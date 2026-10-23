"""
Gera os dados do Painel de Plano de Ação a partir da exportação mensal de chamados.

Uso:
    pip install pandas lxml openpyxl
    python scripts/gerar_dados.py caminho/da/exportacao.xls [--data-base AAAA-MM-DD]

Saídas:
    dados/plano.json            -> cópia local dos dados (para conferência)
    supabase/carga_dados.sql    -> cole no SQL Editor do Supabase e execute para atualizar o painel

Regras aplicadas (as mesmas do painel atual):
    * Só chamados do time SUPORTE e sem o tipo "Inconclusivo".
    * Entram no plano as combinações Unidade x Tipo de chamado com MAIS DE 3 casos.
    * Prioridade pela causa (serviço) mais repetida da ação: Alta = mais de 4 casos; Média = 4; Baixa = 3 ou menos.
    * Prazo a partir da data-base (hoje, se não informada): Alta 7 dias, Média 15, Baixa 30.
    * Top 10 = unidades com mais chamados no período (empates no 10º lugar entram).
"""
import argparse
import collections
import datetime as dt
import json
import os
import sys

import pandas as pd

MIN_CASOS = 3
MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

REGRAS = [
    ('sem retorno', 'Definir contato fixo (responsável + WhatsApp) na unidade e validar disponibilidade antes de abrir o chamado; reforçar com o franqueado que chamados sem retorno são encerrados.', 'Customer Success'),
    ('gcomdb', 'Agendar janela fixa de atualização do GcomDB (cardápio/produtos/usuários) e validar o envio automático; treinar a loja para checar a atualização após mudanças de cardápio.', 'Suporte N2 / Cadastro'),
    ('display', 'Padronizar a configuração do chama senha (display, resolução, fonte) e documentar; orientar técnico local a fixar a saída de vídeo para evitar inversão de telas.', 'Suporte N1 + Técnico local'),
    ('impressora de cupom', 'Revisar driver, cabo, porta e modelo das impressoras de cupom; enviar técnico local para checagem preventiva e avaliar troca do equipamento reincidente.', 'Técnico local / Infra'),
    ('impressora', 'Revisar configuração de impressão (apontamento/modelo) e deixar procedimento padrão documentado na loja.', 'Suporte N1'),
    ('takeaway', 'Revisar e congelar a configuração de filtros/telas Takeaway; enviar guia rápido de uso à equipe da loja.', 'Suporte N2'),
    ('certificado', 'Controlar vencimento dos certificados digitais (alerta 30 dias antes) e definir o fluxo de envio do novo certificado pelo administrativo.', 'Administrativo / Suporte N1'),
    ('integra', 'Auditar parâmetros e cardápio da integração (De-Para) e monitorar falhas; acionar parceiro quando a causa for externa.', 'Integrações'),
    ('tef', 'Revisar comunicação TEF (PinPad/GSurf/Sitef/rede) e checklist de conectividade; treinar operadores em dúvidas de TEF/PIX.', 'Suporte N2 + Adquirente'),
    ('pix', 'Revisar comunicação TEF (PinPad/GSurf/Sitef/rede) e checklist de conectividade; treinar operadores em dúvidas de TEF/PIX.', 'Suporte N2 + Adquirente'),
    ('servidor desligado', 'Orientar a loja a manter o servidor ligado/no-break; avaliar BIOS para ligar automaticamente após queda de energia.', 'Técnico local / Infra'),
    ('rede interna', 'Checar rede interna, IP fixo do servidor e switch; acionar técnico local para manutenção preventiva da rede.', 'Técnico local / Infra'),
    ('abertura do programa', 'Verificar apontamento de banco/firewall/servidor e documentar a configuração correta da unidade.', 'Infra'),
    ('bloqueio administrativo', 'Alinhar com o financeiro/franqueado a regularização para evitar bloqueios recorrentes; comunicar antecipadamente.', 'Financeiro / Customer Success'),
    ('pendentes no encerramento', 'Investigar a causa dos pedidos pendentes (Totem / ID nulo) com Produto e orientar o fechamento correto do dia.', 'Produto / Suporte N2'),
    ('encerramento', 'Treinar a loja no fluxo de fechamento de caixa e encerramento do dia.', 'Treinamento'),
    ('fechamento', 'Treinar a loja no fluxo de fechamento de caixa e encerramento do dia.', 'Treinamento'),
    ('pausa', 'Treinar a loja no processo de pausa/despausa e validar a sincronização com o Totem.', 'Treinamento / Produto'),
    ('dúvida', 'Realizar reciclagem/treinamento com a equipe da loja nos temas recorrentes e enviar material de apoio.', 'Treinamento'),
    ('duvida', 'Realizar reciclagem/treinamento com a equipe da loja nos temas recorrentes e enviar material de apoio.', 'Treinamento'),
    ('cpu', 'Avaliar condição do hardware (CPU/periféricos/SO) e programar manutenção ou substituição.', 'Técnico local / Infra'),
    ('sistema operacional', 'Avaliar condição do hardware (CPU/periféricos/SO) e programar manutenção ou substituição.', 'Técnico local / Infra'),
    ('instala', 'Revisar o padrão de instalação/versão e agendar atualização única para todos os terminais.', 'Implantação'),
]


def acao_sugerida(tipo, servico):
    s = servico.lower()
    for chave, acao, resp in REGRAS:
        if chave in s:
            return acao, resp
    if tipo == 'Dúvida':
        return 'Realizar treinamento/reciclagem com a equipe da loja e enviar material de apoio (FAQ).', 'Treinamento'
    if tipo == 'Requisição':
        return 'Avaliar se a solicitação pode virar autoatendimento ou ser feita de forma preventiva/em lote.', 'Suporte N1'
    if tipo.startswith('Incidente'):
        return 'Fazer análise de causa raiz dos incidentes recorrentes e acionar a área responsável (infra/terceiro/produto).', 'Suporte N2'
    return 'Analisar os casos e definir ação corretiva.', 'Suporte'


def prioridade(qtd):
    return 'Alta' if qtd > 4 else ('Média' if qtd == 4 else 'Baixa')


def ler_exportacao(caminho):
    try:
        return pd.read_html(caminho)[0]  # a exportação do sistema é um HTML com extensão .xls
    except ValueError:
        return pd.read_excel(caminho)


def limpo(v):
    return None if pd.isna(v) else v


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('exportacao')
    ap.add_argument('--data-base', help='data de início dos prazos (AAAA-MM-DD); padrão: hoje')
    args = ap.parse_args()

    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    base_prazo = dt.date.fromisoformat(args.data_base) if args.data_base else dt.date.today()

    d = ler_exportacao(args.exportacao)
    d['DataAb'] = pd.to_datetime(d['Data abertura'], format='%d/%m/%Y %H:%M:%S')
    if 'Time responsável' in d.columns:
        d = d[d['Time responsável'].astype(str).str.upper() == 'SUPORTE']
    d = d[d['Tipo chamado'] != 'Inconclusivo'].copy()
    d['Ticket'] = d['Ticket'].astype(int)
    d['Servico'] = d['Servico'].fillna('Não informado')
    col_marca = 'Marca Empresarial' if 'Marca Empresarial' in d.columns else None
    d['Marca'] = (d[col_marca].fillna('Não informada').astype(str).str.strip().str.upper()) if col_marca else 'NÃO INFORMADA'
    marca_por_ticket = dict(zip(d['Ticket'], d['Marca']))
    marca_de = lambda tk: marca_por_ticket.get(int(tk))
    if d.empty:
        sys.exit('Nenhum chamado encontrado depois dos filtros.')

    ini, fim = d['DataAb'].min(), d['DataAb'].max()
    periodo = f"{MESES[ini.month - 1]}/{ini.year}" if (ini.year, ini.month) == (fim.year, fim.month) else f"{ini:%d/%m/%Y} a {fim:%d/%m/%Y}"

    tot_loja = d.groupby('Loja').size()
    corte = sorted(tot_loja.values, reverse=True)[min(9, len(tot_loja) - 1)]
    top10 = set(tot_loja[tot_loja >= corte].index)

    comb = d.groupby(['Loja', 'Tipo chamado']).size().rename('Qtd').reset_index()
    comb = comb[comb.Qtd > MIN_CASOS].copy()
    comb['Total'] = comb.Loja.map(tot_loja)
    comb = comb.sort_values(['Total', 'Loja', 'Qtd'], ascending=[False, True, False])

    plano, tickets = [], []
    for i, r in enumerate(comb.itertuples(index=False), 1):
        sub = d[(d.Loja == r.Loja) & (d['Tipo chamado'] == r[1])].sort_values('DataAb')
        sv = sub.Servico.value_counts()
        acao, resp = acao_sugerida(r[1], sv.index[0])
        prio = prioridade(int(sv.iloc[0]))  # pela causa (serviço) que mais se repete na ação
        plano.append(dict(
            id=i, unidade=r.Loja, empresa=limpo(sub.Empresa.iloc[0]), uf=limpo(sub.UF.iloc[0]), municipio=limpo(sub['Município'].iloc[0]),
            tipo=r[1], qtd=int(r.Qtd), total_unidade=int(r.Total), pct_unidade=round(r.Qtd / r.Total, 4),
            causas='; '.join(f'{k} ({v})' for k, v in sv.head(3).items()), causa_principal=sv.index[0], casos_causa=int(sv.iloc[0]), acao=acao, responsavel=resp, prioridade=prio,
            prazo=(base_prazo + dt.timedelta(days={'Alta': 7, 'Média': 15, 'Baixa': 30}[prio])).isoformat(),
            status='Não iniciado', indicador=f'Reduzir em 50% os chamados "{r[1]}" da unidade no próximo mês',
            top10='Sim' if r.Loja in top10 else 'Não'))
        for t in sub.itertuples(index=False):
            tickets.append(dict(ticket=int(t.Ticket), unidade=t.Loja, tipo=t[d.columns.get_loc('Tipo chamado')], abertura=t.DataAb.strftime('%Y-%m-%d %H:%M'),
                                servico=t.Servico, descricao=None, solucao=None, criticidade=limpo(t.Criticidade), marca=marca_de(t.Ticket)))

    # descrição e solução (nomes de coluna com acento/espaço não viram atributo)
    det = d.set_index('Ticket')
    for p in plano:
        sub_m = d[(d.Loja == p['unidade']) & (d['Tipo chamado'] == p['tipo'])]['Marca'].value_counts()
        p['marca'] = sub_m.index[0]
    for t in tickets:
        t['descricao'] = limpo(det.at[t['ticket'], 'Descrição abertura'])
        t['solucao'] = limpo(det.at[t['ticket'], 'Descrição conclusão'])

    seg = collections.OrderedDict()
    for r in d.itertuples(index=False):
        tipo = r[d.columns.get_loc('Tipo chamado')]
        u = seg.setdefault(r.Loja, dict(unidade=r.Loja, total=0, req=0, duv=0, infra=0, outros=0))
        u['total'] += 1
        u[{'Requisição': 'req', 'Dúvida': 'duv', 'Incidente-Infra': 'infra'}.get(tipo, 'outros')] += 1
    unidades = sorted(seg.values(), key=lambda u: (-u['total'], u['unidade']))[:15]
    for u in unidades:
        u['top10'] = u['unidade'] in top10

    mc = d['Marca'].value_counts()
    marcas = [[k, int(v)] for k, v in mc.items()]
    marca = 'MULTIMARCAS' if (len(marcas) > 1 and marcas[0][1] / len(d) < 0.8) else marcas[0][0]
    import re as _re, unicodedata as _ud
    slug = _re.sub(r'[^a-z0-9]+', '-', _ud.normalize('NFD', marca).encode('ascii', 'ignore').decode().lower()).strip('-') or 'sem-marca'
    dados = dict(
        periodo=periodo, marca=marca, marcas=marcas, chave=ini.strftime('%Y-%m') + '-' + slug, inicio=ini.strftime('%Y-%m-%d'), fim=fim.strftime('%Y-%m-%d'), geradoEm=base_prazo.isoformat(),
        fonte=os.path.basename(args.exportacao), total=int(len(d)), recorrentes=len(tickets),
        unidadesPlano=len({p['unidade'] for p in plano}), units=unidades,
        tipos=collections.Counter(t['tipo'] for t in tickets).most_common(),
        causas=collections.Counter(t['servico'] for t in tickets).most_common(10),
        plano=plano, tickets=tickets)

    os.makedirs(os.path.join(raiz, 'dados'), exist_ok=True)
    texto = json.dumps(dados, ensure_ascii=False)
    with open(os.path.join(raiz, 'dados', 'plano.json'), 'w', encoding='utf-8') as fh:
        fh.write(texto)
    if '$painel$' in texto:
        sys.exit('Texto inesperado nos dados ($painel$); ajuste o delimitador do SQL.')
    sql = ("-- Carga gerada por scripts/gerar_dados.py em " + dt.datetime.now().strftime('%d/%m/%Y %H:%M') + "\n"
           "-- Período: " + periodo + " | " + str(len(plano)) + " ações | fonte: " + dados['fonte'] + "\n"
           "insert into public.painel_dados (id, conteudo, atualizado_em)\nvalues ('" + dados['chave'] + "', $painel$" + texto + "$painel$::jsonb, now())\n"
           "on conflict (id) do update set conteudo = excluded.conteudo, atualizado_em = now();\n\n"
           "-- o painel abre sempre a carga mais recente:\n"
           "insert into public.painel_dados (id, conteudo, atualizado_em)\n"
           "select 'atual', conteudo, now() from public.painel_dados where id = '" + dados['chave'] + "'\n"
           "on conflict (id) do update set conteudo = excluded.conteudo, atualizado_em = now();\n")
    with open(os.path.join(raiz, 'supabase', 'carga_dados.sql'), 'w', encoding='utf-8') as fh:
        fh.write(sql)
    c = collections.Counter(p['prioridade'] for p in plano)
    print(f"Período {periodo}: {len(d)} chamados, {len(tickets)} recorrentes, {len(plano)} ações "
          f"(Alta {c['Alta']}, Média {c['Média']}, Baixa {c['Baixa']}).")
    print('Gerados: dados/plano.json e supabase/carga_dados.sql')


if __name__ == '__main__':
    main()
