// =====================================================================
// Área de Administração do painel
//  - Importar a planilha de chamados (Excel/HTML exportado pelo sistema)
//  - Editar regras, prioridades, prazos, textos, tags e sugestões
//  - Escolher o mês exibido e gerenciar administradores
// =====================================================================
(function () {
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const vazio = (v) => v == null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && isNaN(v));
  const limpo = (v) => (vazio(v) ? null : (typeof v === 'string' ? v.trim() : v));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // ---------------- leitura do arquivo ----------------
  function carregarXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((ok, falha) => {
      const s = document.createElement('script'); s.src = XLSX_URL;
      s.onload = () => ok(window.XLSX); s.onerror = () => falha(new Error('Não foi possível carregar o leitor de Excel (cdnjs.cloudflare.com).'));
      document.head.appendChild(s);
    });
  }

  function tabelaHTML(texto) {
    const doc = new DOMParser().parseFromString(texto, 'text/html');
    const tabelas = [...doc.querySelectorAll('table')];
    for (const t of tabelas) {
      const linhas = [...t.querySelectorAll('tr')];
      if (!linhas.length) continue;
      const cab = [...linhas[0].querySelectorAll('th,td')].map((c) => c.textContent.trim());
      if (!cab.some((c) => norm(c) === 'ticket')) continue;
      return linhas.slice(1).map((tr) => {
        const cel = [...tr.querySelectorAll('td,th')].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
        const o = {}; cab.forEach((h, i) => { o[h] = cel[i] ?? ''; }); return o;
      }).filter((o) => Object.values(o).some((v) => v !== ''));
    }
    throw new Error('Não encontrei a tabela de chamados no arquivo (precisa ter a coluna "Ticket").');
  }

  async function lerArquivo(arquivo) {
    const buf = await arquivo.arrayBuffer();
    const ini = new TextDecoder('utf-8').decode(buf.slice(0, 2048)).replace(/^﻿/, '').trimStart();
    if (ini.startsWith('<')) {
      let texto = new TextDecoder('utf-8').decode(buf);
      if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
      return tabelaHTML(texto);
    }
    const XLSX = await carregarXLSX();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    for (const nome of wb.SheetNames) {
      const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '', raw: true });
      if (linhas.length && Object.keys(linhas[0]).some((k) => norm(k) === 'ticket')) return linhas;
    }
    throw new Error('Não encontrei a planilha de chamados no arquivo (precisa ter a coluna "Ticket").');
  }

  // ---------------- processamento (mesmas regras do scripts/gerar_dados.py) ----------------
  const COLS = {
    ticket: ['ticket'], loja: ['loja', 'unidade'], tipo: ['tipo chamado', 'tipo'], data: ['data abertura'], time: ['time responsavel'],
    servico: ['servico', 'serviço'], empresa: ['empresa'], uf: ['uf'], municipio: ['municipio'], criticidade: ['criticidade'],
    descricao: ['descricao abertura'], solucao: ['descricao conclusao'], marca: ['marca empresarial', 'marca'],
  };
  const slug = (t) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sem-marca';
  function mapaColunas(linha) {
    const chaves = Object.keys(linha); const m = {};
    Object.entries(COLS).forEach(([k, nomes]) => { m[k] = chaves.find((c) => nomes.includes(norm(c))); });
    const falta = ['ticket', 'loja', 'tipo', 'data'].filter((k) => !m[k]);
    if (falta.length) throw new Error('Colunas obrigatórias ausentes: ' + falta.map((k) => ({ ticket: 'Ticket', loja: 'Loja', tipo: 'Tipo chamado', data: 'Data abertura' })[k]).join(', ') + '.');
    return m;
  }
  function lerData(v) {
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number' && isFinite(v)) return new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000);
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return null;
  }

  function acaoSugerida(cfg, tipo, servico) {
    const s = String(servico).toLowerCase();
    for (const r of cfg.regras || []) { if (r.chave && s.includes(String(r.chave).toLowerCase())) return [r.acao, r.responsavel]; }
    const p = cfg.padroes || {};
    const pick = tipo === 'Dúvida' ? p['Dúvida'] : tipo === 'Requisição' ? p['Requisição'] : String(tipo).startsWith('Incidente') ? p.Incidente : p.Outros;
    const x = pick || p.Outros || { acao: 'Analisar os casos e definir ação corretiva.', responsavel: 'Suporte' };
    return [x.acao, x.responsavel];
  }

  function processar(linhasBrutas, cfg, base, fonte, anterior) {
    if (!linhasBrutas.length) throw new Error('O arquivo não tem linhas de chamados.');
    const c = mapaColunas(linhasBrutas[0]);
    const excl = new Set((cfg.excluirTipos || []).map((t) => norm(t)));
    const time = norm(cfg.filtroTime || '');
    const info = { lidas: linhasBrutas.length, foraTime: 0, excluidos: 0, semData: 0 };
    const d = [];
    linhasBrutas.forEach((r, ordem) => {
      if (c.time && time && norm(r[c.time]) !== time) { info.foraTime++; return; }
      const tipo = limpo(r[c.tipo]);
      if (!tipo || excl.has(norm(tipo))) { info.excluidos++; return; }
      const dt = lerData(r[c.data]);
      const ticket = parseInt(String(r[c.ticket]).replace(/\D/g, ''), 10);
      if (!dt || !Number.isFinite(ticket)) { info.semData++; return; }
      d.push({ ordem, ticket, loja: String(limpo(r[c.loja]) ?? 'Sem unidade'), tipo: String(tipo), dt, servico: String(limpo(c.servico && r[c.servico]) ?? 'Não informado'),
        empresa: limpo(c.empresa && r[c.empresa]), uf: limpo(c.uf && r[c.uf]), municipio: limpo(c.municipio && r[c.municipio]),
        criticidade: limpo(c.criticidade && r[c.criticidade]), descricao: limpo(c.descricao && r[c.descricao]), solucao: limpo(c.solucao && r[c.solucao]),
        marca: String(limpo(c.marca && r[c.marca]) ?? 'Não informada').toUpperCase() });
    });
    if (!d.length) throw new Error('Nenhum chamado restou depois dos filtros (time e tipos excluídos). Confira as regras.');

    const ini = new Date(Math.min(...d.map((x) => x.dt))), fim = new Date(Math.max(...d.map((x) => x.dt)));
    const periodo = (ini.getFullYear() === fim.getFullYear() && ini.getMonth() === fim.getMonth()) ? `${MESES[ini.getMonth()]}/${ini.getFullYear()}`
      : `${pad(ini.getDate())}/${pad(ini.getMonth() + 1)}/${ini.getFullYear()} a ${pad(fim.getDate())}/${pad(fim.getMonth() + 1)}/${fim.getFullYear()}`;

    const totLoja = new Map(); d.forEach((x) => totLoja.set(x.loja, (totLoja.get(x.loja) || 0) + 1));
    const vals = [...totLoja.values()].sort((a, b) => b - a);
    const corte = vals[Math.min((cfg.topN || 10) - 1, vals.length - 1)];
    const top = new Set([...totLoja].filter(([, v]) => v >= corte).map(([k]) => k));

    const comb = new Map();
    d.forEach((x) => { const k = x.loja + '\u0000' + x.tipo; if (!comb.has(k)) comb.set(k, { loja: x.loja, tipo: x.tipo, itens: [] }); comb.get(k).itens.push(x); });
    const minCasos = Math.max(1, Number(cfg.minCasos) || 4);
    let lista = [...comb.values()].filter((g) => g.itens.length >= minCasos)
      .sort((a, b) => cmp(a.loja, b.loja) || cmp(a.tipo, b.tipo))
      .sort((a, b) => (totLoja.get(b.loja) - totLoja.get(a.loja)) || cmp(a.loja, b.loja) || (b.itens.length - a.itens.length));

    // reaproveita o número das ações de uma carga anterior do mesmo mês, para não embaralhar o acompanhamento
    const idsAnt = new Map(); let prox = 1;
    if (anterior && Array.isArray(anterior.plano)) { anterior.plano.forEach((p) => { idsAnt.set(p.unidade + '\u0000' + p.tipo, p.id); prox = Math.max(prox, p.id + 1); }); }

    const pr = cfg.prioridade || {}; const altaMin = Number(pr.altaMin) || 5, mediaMin = Number(pr.mediaMin) || 4;
    const prazos = cfg.prazos || { Alta: 7, 'Média': 15, Baixa: 30 };
    const plano = [], tickets = [];
    lista.forEach((g, i) => {
      const sub = g.itens.slice().sort((a, b) => (a.dt - b.dt) || (a.ordem - b.ordem));
      const cont = new Map(); sub.forEach((x) => cont.set(x.servico, (cont.get(x.servico) || 0) + 1));
      const sv = [...cont].map(([k, v], ord) => ({ k, v, ord })).sort((a, b) => (b.v - a.v) || (a.ord - b.ord));
      const [acao, resp] = acaoSugerida(cfg, g.tipo, sv[0].k);
      const qtd = sub.length, total = totLoja.get(g.loja);
      const baseCont = cfg.prioridadePor === 'tipo' ? qtd : sv[0].v;
      const prio = baseCont >= altaMin ? 'Alta' : (baseCont >= mediaMin ? 'Média' : 'Baixa');
      const prazo = new Date(base.getFullYear(), base.getMonth(), base.getDate() + (Number(prazos[prio]) || 15));
      const chave = g.loja + '\u0000' + g.tipo;
      const id = anterior ? (idsAnt.get(chave) ?? prox++) : i + 1;
      const mc = new Map(); sub.forEach((x) => mc.set(x.marca, (mc.get(x.marca) || 0) + 1));
      const marcaAcao = [...mc].sort((a, b) => b[1] - a[1])[0][0];
      plano.push({ id, marca: marcaAcao, unidade: g.loja, empresa: sub[0].empresa, uf: sub[0].uf, municipio: sub[0].municipio, tipo: g.tipo, qtd, total_unidade: total,
        pct_unidade: Math.round((qtd / total) * 1e4) / 1e4, causas: sv.slice(0, 3).map((x) => `${x.k} (${x.v})`).join('; '), causa_principal: sv[0].k, casos_causa: sv[0].v, acao, responsavel: resp,
        prioridade: prio, prazo: iso(prazo), status: 'Não iniciado', indicador: String(cfg.indicador || '').replace(/\{tipo\}/g, g.tipo), top10: top.has(g.loja) ? 'Sim' : 'Não' });
      sub.forEach((x) => tickets.push({ ticket: x.ticket, unidade: x.loja, tipo: x.tipo, abertura: `${iso(x.dt)} ${pad(x.dt.getHours())}:${pad(x.dt.getMinutes())}`,
        servico: x.servico, descricao: x.descricao, solucao: x.solucao, criticidade: x.criticidade, marca: x.marca }));
    });

    const seg = new Map();
    d.forEach((x) => {
      if (!seg.has(x.loja)) seg.set(x.loja, { unidade: x.loja, total: 0, req: 0, duv: 0, infra: 0, outros: 0 });
      const u = seg.get(x.loja); u.total++;
      u[x.tipo === 'Requisição' ? 'req' : x.tipo === 'Dúvida' ? 'duv' : x.tipo === 'Incidente-Infra' ? 'infra' : 'outros']++;
    });
    const units = [...seg.values()].sort((a, b) => (b.total - a.total) || cmp(a.unidade, b.unidade)).slice(0, 15).map((u) => ({ ...u, top10: top.has(u.unidade) }));
    const contar = (arr) => { const m = new Map(); arr.forEach((k) => m.set(k, (m.get(k) || 0) + 1)); return [...m].map(([k, v], o) => ({ k, v, o })).sort((a, b) => (b.v - a.v) || (a.o - b.o)).map((x) => [x.k, x.v]); };

    // marca(s) reconhecida(s) no arquivo
    const marcas = contar(d.map((x) => x.marca));
    const principal = marcas[0][0];
    const multimarca = marcas.length > 1 && marcas[0][1] / d.length < 0.8;
    const marca = multimarca ? 'MULTIMARCAS' : principal;
    const chave = iso(ini).slice(0, 7) + '-' + slug(marca);
    return {
      dados: { periodo, marca, marcas, chave, inicio: iso(ini), fim: iso(fim), geradoEm: iso(base), fonte, total: d.length, recorrentes: tickets.length,
        unidadesPlano: new Set(plano.map((p) => p.unidade)).size, units, tipos: contar(tickets.map((t) => t.tipo)), causas: contar(tickets.map((t) => t.servico)).slice(0, 10),
        plano: plano.sort((a, b) => a.id - b.id), tickets },
      info,
    };
  }

  // Recalcula prioridade e prazo de um mês já carregado, com as regras atuais
  function reaplicarPrioridades(D, cfg) {
    const pr = cfg.prioridade || {}; const altaMin = Number(pr.altaMin) || 5, mediaMin = Number(pr.mediaMin) || 4;
    const prazos = cfg.prazos || { Alta: 7, 'Média': 15, Baixa: 30 };
    const b = String(D.geradoEm || D.fim || iso(new Date())).slice(0, 10).split('-').map(Number);
    const grupos = new Map();
    D.tickets.slice().sort((a, b2) => cmp(a.abertura, b2.abertura)).forEach((t) => { const k = t.unidade + '\u0000' + t.tipo; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t); });
    const cont = { Alta: 0, 'Média': 0, Baixa: 0 }; let mudou = 0;
    D.plano.forEach((p) => {
      const itens = grupos.get(p.unidade + '\u0000' + p.tipo) || [];
      const m = new Map(); itens.forEach((t) => m.set(t.servico || 'Não informado', (m.get(t.servico || 'Não informado') || 0) + 1));
      const sv = [...m].map(([k, v], o) => ({ k, v, o })).sort((a, b2) => (b2.v - a.v) || (a.o - b2.o));
      const top = sv[0] || { k: '', v: 0 };
      const baseCont = cfg.prioridadePor === 'tipo' ? p.qtd : top.v;
      const prio = baseCont >= altaMin ? 'Alta' : (baseCont >= mediaMin ? 'Média' : 'Baixa');
      const prazo = iso(new Date(b[0], b[1] - 1, b[2] + (Number(prazos[prio]) || 15)));
      if (p.prioridade !== prio || p.prazo !== prazo) mudou++;
      Object.assign(p, { prioridade: prio, prazo, causa_principal: top.k, casos_causa: top.v });
      cont[prio]++;
    });
    return { cont, mudou };
  }

  window.PainelProc = { lerArquivo, processar, reaplicarPrioridades };

  // ---------------- interface ----------------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const nf = new Intl.NumberFormat('pt-BR');
  const fDT = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const msgEl = () => el('span', 'msg');
  const setMsg = (m, t, tipo) => { m.className = 'msg' + (tipo === 'err' ? ' err' : tipo === 'ok' ? ' okm' : ''); m.textContent = t; };
  const campo = (rotulo, input, dica) => { const l = el('label', 'adm-field'); l.append(el('span', null, rotulo), input); if (dica) l.appendChild(el('small', null, dica)); return l; };
  const inp = (v, type, attrs) => { const i = el('input'); i.type = type || 'text'; i.value = v ?? ''; Object.assign(i, attrs || {}); return i; };
  const txt = (v, rows) => { const t = el('textarea'); t.value = v ?? ''; t.rows = rows || 3; return t; };
  const btn = (t, cls) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), t); b.type = 'button'; return b; };

  window.iniciarAdmin = function (ctx) {
    // ctx: { sb, sess, D (pode ser null), cfg, padrao, recarregar }
    const raiz = document.getElementById('admin');
    raiz.replaceChildren();
    const head = el('div', 'adm-head');
    head.append(el('h2', null, 'Ajustes'));
    const fechar = btn('Voltar ao painel'); fechar.addEventListener('click', () => { if (ctx.voltarPainel) ctx.voltarPainel(); else raiz.hidden = true; });
    if (ctx.D) head.appendChild(fechar);
    raiz.appendChild(head);
    const abas = el('div', 'adm-tabs'); abas.setAttribute('role', 'tablist');
    const corpo = el('div', 'adm-body');
    raiz.append(abas, corpo);
    const ABAS = [['importar', 'Importar planilha'], ['regras', 'Regras e textos'], ['meses', 'Meses carregados'], ['admins', 'Administradores']];
    let atual = 'importar';
    const paineis = {};
    const desenhar = () => {
      abas.replaceChildren(...ABAS.map(([k, n]) => {
        const b = btn(n + (k === 'regras' && ctx.regrasSujas ? ' •' : ''), 'adm-tab'); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', k === atual ? 'true' : 'false');
        if (k === 'regras' && ctx.regrasSujas) b.title = 'Há alterações não salvas';
        b.addEventListener('click', () => { atual = k; desenhar(); }); return b;
      }));
      Object.values(paineis).forEach((p) => { p.hidden = true; });
      if (atual === 'regras' && paineis.regras) { paineis.regras.hidden = false; return; }
      if (paineis[atual]) paineis[atual].remove();
      const p = el('div', 'adm-pane'); paineis[atual] = p; corpo.appendChild(p);
      ({ importar: abaImportar, regras: abaRegras, meses: abaMeses, admins: abaAdmins })[atual](p, ctx);
    };
    ctx.redesenharAbas = desenhar;
    window.addEventListener('beforeunload', (e) => { if (ctx.regrasSujas) { e.preventDefault(); e.returnValue = ''; } });
    desenhar();
  };

  // ---- Importar ----
  function abaImportar(box, ctx) {
    box.appendChild(el('p', 'note', 'Selecione a exportação de chamados do sistema (.xls, .xlsx ou .csv). O painel aplica as regras da aba "Regras e textos", mostra um resumo e só publica quando você confirmar.'));
    const arq = el('input'); arq.type = 'file'; arq.accept = '.xls,.xlsx,.csv,.htm,.html'; arq.id = 'adm-arquivo';
    const hoje = new Date();
    const base = inp(iso(hoje), 'date'); base.id = 'adm-base';
    const linha = el('div', 'adm-grid');
    linha.append(campo('Arquivo de chamados', arq), campo('Data de início dos prazos', base, 'Os prazos das ações contam a partir desta data.'));
    const proc = btn('Processar arquivo', 'primary'); proc.id = 'adm-processar';
    const m = msgEl();
    const acoes = el('div', 'form-actions'); acoes.append(proc, m);
    const prev = el('div', 'adm-preview');
    box.append(linha, acoes, prev);
    proc.addEventListener('click', async () => {
      prev.replaceChildren();
      const f = arq.files && arq.files[0];
      if (!f) { setMsg(m, 'Escolha o arquivo primeiro.', 'err'); return; }
      const b = new Date(base.value + 'T12:00:00'); if (isNaN(b)) { setMsg(m, 'Data de início inválida.', 'err'); return; }
      proc.disabled = true; setMsg(m, 'Lendo o arquivo…');
      try {
        const linhas = await lerArquivo(f);
        setMsg(m, `Processando ${nf.format(linhas.length)} linhas…`);
        const prim = processar(linhas, ctx.cfg, b, f.name, null);
        // carga já existente da mesma marca e mês (ou carga antiga, sem marca, do mesmo mês) mantém o acompanhamento
        const mesNum = prim.dados.inicio.slice(0, 7);
        let mes = prim.dados.chave;
        let { data: ant, error: eAnt } = await ctx.sb.from('painel_dados').select('conteudo').eq('id', mes).maybeSingle();
        if (eAnt) throw eAnt;
        if (!ant) {
          const r2 = await ctx.sb.from('painel_dados').select('conteudo').eq('id', mesNum).maybeSingle();
          // carga antiga sem marca: só é reaproveitada se for da mesma marca (mesmas unidades); senão vira um plano separado
          const antigo = !r2.error && r2.data ? r2.data.conteudo : null;
          if (antigo) {
            const mesmaMarca = antigo.marca ? antigo.marca === prim.dados.marca : (() => {
              const ua = new Set((antigo.plano || []).map((q) => q.unidade));
              const un = [...new Set(prim.dados.plano.map((q) => q.unidade))];
              const comuns = un.filter((u) => ua.has(u)).length;
              return un.length > 0 && comuns / un.length >= 0.5;
            })();
            if (mesmaMarca) { ant = r2.data; mes = mesNum; }
          }
        }
        const res = ant ? processar(linhas, ctx.cfg, b, f.name, ant.conteudo) : prim;
        res.dados.chave = mes;
        setMsg(m, '');
        resumo(prev, res, mes, !!ant, ctx);
      } catch (e) {
        setMsg(m, (e && e.message) || 'Não foi possível ler o arquivo.', 'err');
      } finally { proc.disabled = false; }
    });
  }

  function resumo(box, res, mes, existe, ctx) {
    const D = res.dados, inf = res.info;
    const cont = { Alta: 0, 'Média': 0, Baixa: 0 }; D.plano.forEach((p) => { cont[p.prioridade]++; });
    box.appendChild(el('h3', null, `Resumo: ${D.periodo}`));
    const mrow = el('div', 'marca-row');
    mrow.append(el('span', 'note', 'Marca reconhecida:'), el('span', 'marca-chip', D.marca));
    if (D.marcas.length > 1) mrow.appendChild(el('span', 'note', D.marcas.map(([k, v]) => `${k}: ${nf.format(v)}`).join(' · ')));
    if (D.marcas.length === 1 && D.marca === 'NÃO INFORMADA') mrow.appendChild(el('span', 'note', 'A coluna "Marca Empresarial" não foi encontrada no arquivo.'));
    box.appendChild(mrow);
    const grid = el('div', 'kpis');
    [['Linhas no arquivo', nf.format(inf.lidas)], ['Chamados considerados', nf.format(D.total)], ['Chamados recorrentes', nf.format(D.recorrentes)],
      ['Ações no plano', nf.format(D.plano.length)], ['Alta / Média / Baixa', `${cont.Alta} / ${cont['Média']} / ${cont.Baixa}`], ['Unidades no plano', nf.format(D.unidadesPlano)]]
      .forEach(([l, v]) => { const k = el('div', 'kpi'); k.append(el('span', 'l', l), el('span', 'v', v)); grid.appendChild(k); });
    box.appendChild(grid);
    const fora = [];
    if (inf.foraTime) fora.push(`${nf.format(inf.foraTime)} de outro time`);
    if (inf.excluidos) fora.push(`${nf.format(inf.excluidos)} de tipos excluídos`);
    if (inf.semData) fora.push(`${nf.format(inf.semData)} sem data ou ticket válido`);
    if (fora.length) box.appendChild(el('p', 'note', 'Ficaram de fora: ' + fora.join(', ') + '.'));
    const tb = el('table'); const th = el('thead'); const hr = el('tr');
    ['#', 'Unidade', 'Tipo', 'Casos', 'Prioridade', 'Ação proposta'].forEach((h) => { const c = el('th'); c.appendChild(el('span', 'adm-th', h)); hr.appendChild(c); });
    th.appendChild(hr); tb.appendChild(th); const bd = el('tbody');
    D.plano.slice(0, 8).forEach((p) => { const tr = el('tr'); [String(p.id), p.unidade, p.tipo, String(p.qtd), p.prioridade, p.acao].forEach((v) => tr.appendChild(el('td', null, v))); bd.appendChild(tr); });
    tb.appendChild(bd); const tbox = el('div', 'tbox'); tbox.style.maxHeight = '18rem'; tbox.appendChild(tb); box.appendChild(tbox);
    if (D.plano.length > 8) box.appendChild(el('p', 'note', `… e mais ${D.plano.length - 8} ações.`));
    if (existe) box.appendChild(el('p', 'banner', `Já existe uma carga de ${D.periodo} (${D.marca}). Publicar substitui os dados dessa carga; o acompanhamento salvo (status, percurso) é mantido e as ações iguais continuam com o mesmo número.`));
    const chk = el('label', 'chk'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.id = 'adm-atual'; chk.append(cb, ' Mostrar esta carga no painel (tornar atual)');
    const pub = btn('Publicar no painel', 'primary'); pub.id = 'adm-publicar';
    const m = msgEl();
    const a = el('div', 'form-actions'); a.append(chk, pub, m); box.appendChild(a);
    pub.addEventListener('click', async () => {
      pub.disabled = true; setMsg(m, 'Publicando…');
      try {
        const agora = new Date().toISOString();
        let r = await ctx.sb.from('painel_dados').upsert({ id: mes, conteudo: D, atualizado_em: agora });
        if (r.error) throw r.error;
        if (cb.checked) { r = await ctx.sb.from('painel_dados').upsert({ id: 'atual', conteudo: D, atualizado_em: agora }); if (r.error) throw r.error; }
        setMsg(m, cb.checked ? 'Publicado! Recarregando o painel…' : 'Publicado. A carga ficou salva em "Meses carregados".', 'ok');
        if (cb.checked) setTimeout(() => ctx.recarregar(), 900);
      } catch (e) {
        pub.disabled = false;
        setMsg(m, /row-level|permission|42501/i.test((e && (e.message || e.code)) || '') ? 'Sem permissão: seu e-mail não está na lista de administradores (rode supabase/atualizacao_admin.sql).' : 'Não foi possível publicar: ' + ((e && e.message) || e), 'err');
      }
    });
  }

  // ---- Regras ----
  function abaRegras(box, ctx) {
    const cfg = JSON.parse(JSON.stringify(ctx.cfg));
    const barra = el('div', 'adm-savebar');
    const salvarTopo = btn('Salvar alterações', 'primary'); salvarTopo.id = 'adm-salvar-topo'; salvarTopo.disabled = true;
    const descartar = btn('Descartar alterações'); descartar.disabled = true;
    const mTopo = el('span', 'msg', 'Nenhuma alteração pendente.');
    barra.append(salvarTopo, descartar, mTopo);
    box.appendChild(barra);
    const marcar = (sujo) => {
      ctx.regrasSujas = sujo; salvarTopo.disabled = !sujo; descartar.disabled = !sujo;
      if (sujo) { mTopo.className = 'msg warnm'; mTopo.textContent = 'Há alterações não salvas.'; }
      if (ctx.redesenharAbas && box.dataset.sujo !== String(sujo)) { box.dataset.sujo = String(sujo); const ab = document.querySelectorAll('.adm-tab'); ab.forEach((b) => { if (/^Regras e textos/.test(b.textContent)) b.textContent = 'Regras e textos' + (sujo ? ' •' : ''); }); }
    };
    box.addEventListener('input', () => marcar(true));
    box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.closest('.adm-rules')) marcar(true); });
    descartar.addEventListener('click', () => { marcar(false); abaRegrasRecarregar(box, ctx); });
    box.appendChild(el('p', 'note', 'As regras valem para as próximas importações. Para aplicar ao mês que já está no painel, importe a planilha de novo: o acompanhamento salvo é mantido. Título, tags e sugestões de observação mudam ao recarregar a página.'));
    const g1 = el('div', 'adm-grid');
    const f = {
      titulo: inp(cfg.titulo), subtitulo: inp(cfg.subtitulo), filtroTime: inp(cfg.filtroTime), excluirTipos: inp((cfg.excluirTipos || []).join(', ')),
      minCasos: inp(cfg.minCasos, 'number', { min: 1, step: 1 }), altaMin: inp(cfg.prioridade.altaMin, 'number', { min: 1, step: 1 }), mediaMin: inp(cfg.prioridade.mediaMin, 'number', { min: 1, step: 1 }),
      pAlta: inp(cfg.prazos.Alta, 'number', { min: 1, step: 1 }), pMedia: inp(cfg.prazos['Média'], 'number', { min: 1, step: 1 }), pBaixa: inp(cfg.prazos.Baixa, 'number', { min: 1, step: 1 }),
      topN: inp(cfg.topN, 'number', { min: 1, step: 1 }), indicador: inp(cfg.indicador),
      prioridadePor: (() => { const sel = el('select'); [['causa', 'Causa mais repetida (mesmo serviço)'], ['tipo', 'Total de chamados do tipo na unidade']].forEach(([v, t]) => sel.appendChild(new Option(t, v))); sel.value = cfg.prioridadePor === 'tipo' ? 'tipo' : 'causa'; return sel; })(),
    };
    g1.append(campo('Título do painel', f.titulo, 'Use {marca} para incluir a marca reconhecida na importação.'), campo('Subtítulo', f.subtitulo), campo('Time considerado', f.filtroTime, 'Coluna "Time responsável". Deixe vazio para considerar todos.'),
      campo('Tipos de chamado excluídos', f.excluirTipos, 'Separe por vírgula.'), campo('Mínimo de casos para entrar no plano', f.minCasos, 'Mesmo tipo na mesma unidade.'),
      campo('Prioridade calculada por', f.prioridadePor, 'Causa: conta quantas vezes o mesmo serviço se repete na ação.'),
      campo('Prioridade Alta a partir de (casos)', f.altaMin, 'Ex.: 5 = mais de 4 casos.'), campo('Prioridade Média a partir de (casos)', f.mediaMin),
      campo('Prazo Alta (dias)', f.pAlta), campo('Prazo Média (dias)', f.pMedia), campo('Prazo Baixa (dias)', f.pBaixa),
      campo('Quantidade no "Top" de unidades', f.topN, 'Empates na última posição entram.'), campo('Texto da meta (indicador)', f.indicador, '{tipo} é trocado pelo tipo de chamado.'));
    box.appendChild(g1);

    box.appendChild(el('h3', null, 'Ação sugerida por palavra-chave do serviço'));
    box.appendChild(el('p', 'note', 'A primeira regra cuja palavra-chave aparece no serviço mais frequente define a ação e o responsável. A ordem importa.'));
    const regrasBox = el('div', 'adm-rules');
    const regras = cfg.regras.map((r) => ({ ...r }));
    const desenharRegras = () => {
      regrasBox.replaceChildren();
      regras.forEach((r, i) => {
        const row = el('div', 'adm-rule');
        const k = inp(r.chave); k.placeholder = 'palavra-chave'; k.setAttribute('aria-label', 'Palavra-chave'); k.addEventListener('input', () => { r.chave = k.value; });
        const a = txt(r.acao, 2); a.setAttribute('aria-label', 'Ação'); a.addEventListener('input', () => { r.acao = a.value; });
        const p = inp(r.responsavel); p.placeholder = 'responsável'; p.setAttribute('aria-label', 'Responsável'); p.addEventListener('input', () => { r.responsavel = p.value; });
        const up = btn('↑'); up.title = 'Subir'; up.disabled = i === 0; up.addEventListener('click', () => { [regras[i - 1], regras[i]] = [regras[i], regras[i - 1]]; desenharRegras(); });
        const dn = btn('↓'); dn.title = 'Descer'; dn.disabled = i === regras.length - 1; dn.addEventListener('click', () => { [regras[i + 1], regras[i]] = [regras[i], regras[i + 1]]; desenharRegras(); });
        const rm = btn('Remover', 'adm-del'); rm.addEventListener('click', () => { regras.splice(i, 1); desenharRegras(); });
        const ctr = el('div', 'adm-rule-ctr'); ctr.append(up, dn, rm);
        row.append(k, a, p, ctr); regrasBox.appendChild(row);
      });
      const add = btn('+ Adicionar regra'); add.addEventListener('click', () => { regras.push({ chave: '', acao: '', responsavel: '' }); desenharRegras(); });
      regrasBox.appendChild(add);
    };
    desenharRegras();
    box.appendChild(regrasBox);

    box.appendChild(el('h3', null, 'Ação padrão quando nenhuma palavra-chave combina'));
    const pad2 = el('div', 'adm-rules'); const padroes = {};
    [['Dúvida', 'Dúvida'], ['Requisição', 'Requisição'], ['Incidente', 'Incidentes'], ['Outros', 'Outros tipos']].forEach(([k, n]) => {
      const v = cfg.padroes[k] || { acao: '', responsavel: '' }; padroes[k] = { ...v };
      const row = el('div', 'adm-rule');
      const a = txt(v.acao, 2); a.addEventListener('input', () => { padroes[k].acao = a.value; });
      const p = inp(v.responsavel); p.placeholder = 'responsável'; p.addEventListener('input', () => { padroes[k].responsavel = p.value; });
      row.append(el('strong', 'adm-rule-name', n), a, p, el('span')); pad2.appendChild(row);
    });
    box.appendChild(pad2);

    const g2 = el('div', 'adm-grid');
    const tags = txt((cfg.tags || []).join('\n'), 5), obs = txt((cfg.obsSugestoes || []).join('\n'), 5);
    g2.append(campo('Tags do percurso (uma por linha)', tags), campo('Sugestões de observação (uma por linha)', obs));
    box.appendChild(g2);

    const salvar = btn('Salvar configurações', 'primary'); salvar.id = 'adm-salvar-cfg';
    const restaurar = btn('Restaurar padrão');
    const m = msgEl();
    const a = el('div', 'form-actions'); a.append(salvar, restaurar, m); box.appendChild(a);
    if (ctx.D && ctx.sess && ctx.sess.salvarPlano) {
      const sec = el('div', 'adm-apply');
      sec.appendChild(el('h3', null, `Aplicar ao mês do painel (${ctx.D.periodo})`));
      sec.appendChild(el('p', 'note', 'Recalcula a prioridade e o prazo de todas as ações do mês exibido usando as regras salvas, sem reimportar a planilha. Ações que já têm acompanhamento mantêm o prazo que foi registrado nelas.'));
      const ap = btn('Recalcular prioridades e prazos agora'); ap.id = 'adm-reaplicar';
      const am = msgEl(); const ar = el('div', 'form-actions'); ar.append(ap, am); sec.appendChild(ar); box.appendChild(sec);
      ap.addEventListener('click', async () => {
        if (ctx.regrasSujas) { setMsg(am, 'Salve as alterações antes de recalcular.', 'err'); return; }
        ap.disabled = true; setMsg(am, 'Recalculando…');
        try {
          const D2 = JSON.parse(JSON.stringify(ctx.D));
          const r = reaplicarPrioridades(D2, ctx.cfg);
          await ctx.sess.salvarPlano(D2);
          setMsg(am, `Pronto: Alta ${r.cont.Alta} · Média ${r.cont['Média']} · Baixa ${r.cont.Baixa} (${r.mudou} ações mudaram). Recarregando…`, 'ok');
          setTimeout(() => ctx.recarregar(), 1500);
        } catch (e) { ap.disabled = false; setMsg(am, 'Não foi possível recalcular: ' + ((e && e.message) || e), 'err'); }
      });
    }
    const conf = el('div', 'tl-confirm'); conf.hidden = true;
    const sim = btn('Sim, restaurar', 'danger'); const nao = btn('Cancelar');
    conf.append(el('span', null, 'Voltar todas as regras e textos para o padrão original?'), sim, nao); box.appendChild(conf);
    restaurar.addEventListener('click', () => { conf.hidden = false; });
    nao.addEventListener('click', () => { conf.hidden = true; });
    const gravar = async (novo, textoOk) => {
      setMsg(m, 'Salvando…'); setMsg(mTopo, 'Salvando…'); salvarTopo.disabled = true;
      const { error } = await ctx.sb.from('configuracoes').upsert({ id: 'geral', conteudo: novo, atualizado_em: new Date().toISOString(), atualizado_por: ctx.sess.email });
      if (error) { salvarTopo.disabled = false; setMsg(mTopo, 'Não foi possível salvar. Veja a mensagem no fim da página.', 'err'); setMsg(m, /row-level|permission|42501|does not exist/i.test(error.message + (error.code || '')) ? 'Sem permissão ou tabela ausente: rode supabase/atualizacao_admin.sql e confira se seu e-mail é administrador.' : 'Não foi possível salvar: ' + error.message, 'err'); return; }
      ctx.cfg = novo; setMsg(m, textoOk, 'ok'); marcar(false); setMsg(mTopo, 'Alterações salvas às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. Recarregue a página para ver título, tags e sugestões novos.', 'ok');
    };
    sim.addEventListener('click', async () => { conf.hidden = true; await gravar(JSON.parse(JSON.stringify(ctx.padrao)), 'Padrão restaurado. Recarregue a página para ver tudo atualizado.'); abaRegrasRecarregar(box, ctx); });
    salvarTopo.addEventListener('click', () => salvar.click());
    salvar.addEventListener('click', async () => {
      const n = (x, def) => { const v = parseInt(x.value, 10); return Number.isFinite(v) && v > 0 ? v : def; };
      const altaMin = n(f.altaMin, 5), mediaMin = n(f.mediaMin, 4);
      if (mediaMin > altaMin) { const t = 'A prioridade Média precisa começar em um número de casos menor ou igual ao da Alta.'; setMsg(m, t, 'err'); setMsg(mTopo, t, 'err'); return; }
      const novo = {
        titulo: f.titulo.value.trim() || ctx.padrao.titulo, subtitulo: f.subtitulo.value.trim(), filtroTime: f.filtroTime.value.trim(),
        excluirTipos: f.excluirTipos.value.split(',').map((s) => s.trim()).filter(Boolean), minCasos: n(f.minCasos, 4),
        prioridadePor: f.prioridadePor.value, prioridade: { altaMin, mediaMin }, prazos: { Alta: n(f.pAlta, 7), 'Média': n(f.pMedia, 15), Baixa: n(f.pBaixa, 30) }, topN: n(f.topN, 10),
        indicador: f.indicador.value.trim(), regras: regras.filter((r) => r.chave.trim() && r.acao.trim()).map((r) => ({ chave: r.chave.trim(), acao: r.acao.trim(), responsavel: r.responsavel.trim() })),
        padroes, tags: tags.value.split('\n').map((s) => s.trim()).filter(Boolean), obsSugestoes: obs.value.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      await gravar(novo, 'Configurações salvas. Tags, sugestões e título aparecem ao recarregar a página; as regras valem na próxima importação.');
    });
  }
  function abaRegrasRecarregar(box, ctx) { box.replaceChildren(); abaRegras(box, ctx); }

  // ---- Meses ----
  async function abaMeses(box, ctx) {
    box.appendChild(el('p', 'note', 'Cada importação fica guardada por mês e marca. Escolha qual carga o painel mostra. O acompanhamento de cada carga fica separado.'));
    const m = msgEl(); box.appendChild(m); setMsg(m, 'Carregando…');
    const { data, error } = await ctx.sb.from('painel_dados').select('id, atualizado_em, periodo:conteudo->>periodo, inicio:conteudo->>inicio, chave:conteudo->>chave, marca:conteudo->>marca').order('id', { ascending: false });
    if (error) { setMsg(m, 'Não foi possível listar os meses: ' + error.message, 'err'); return; }
    setMsg(m, '');
    const atual = data.find((r) => r.id === 'atual');
    const meses = data.filter((r) => r.id !== 'atual');
    if (!meses.length) { box.appendChild(el('p', 'empty', 'Nenhum mês carregado ainda. Use a aba "Importar planilha".')); return; }
    const lista = el('div', 'adm-list');
    meses.forEach((r) => {
      const ehAtual = atual && ((atual.chave || (atual.inicio || '').slice(0, 7)) === r.id);
      const row = el('div', 'adm-list-row');
      const info = el('div'); info.append(el('strong', null, (r.periodo || r.id) + (r.marca ? ' · ' + r.marca : '')), el('div', 'note', `Carregado em ${fDT(r.atualizado_em)}`));
      const ctr = el('div', 'adm-rule-ctr');
      if (ehAtual) ctr.appendChild(el('span', 'pill st-con', 'No painel'));
      else {
        const b = btn('Mostrar no painel'); b.addEventListener('click', async () => {
          b.disabled = true; setMsg(m, 'Trocando o mês…');
          const { data: d1, error: e1 } = await ctx.sb.from('painel_dados').select('conteudo').eq('id', r.id).single();
          if (e1) { setMsg(m, e1.message, 'err'); b.disabled = false; return; }
          const { error: e2 } = await ctx.sb.from('painel_dados').upsert({ id: 'atual', conteudo: d1.conteudo, atualizado_em: new Date().toISOString() });
          if (e2) { setMsg(m, e2.message, 'err'); b.disabled = false; return; }
          setMsg(m, 'Pronto! Recarregando…', 'ok'); setTimeout(() => ctx.recarregar(), 700);
        });
        ctr.appendChild(b);
        const x = btn('Excluir', 'adm-del'); x.addEventListener('click', () => {
          if (row.querySelector('.tl-confirm')) return;
          const cf = el('div', 'tl-confirm'); const s = btn('Sim, excluir', 'danger'); const n = btn('Cancelar');
          cf.append(el('span', null, `Excluir a carga de ${r.periodo || r.id}? O acompanhamento salvo continua no banco.`), s, n); row.appendChild(cf);
          n.addEventListener('click', () => cf.remove());
          s.addEventListener('click', async () => {
            const { error: e } = await ctx.sb.from('painel_dados').delete().eq('id', r.id);
            if (e) { setMsg(m, e.message, 'err'); return; }
            box.replaceChildren(); abaMeses(box, ctx);
          });
        });
        ctr.appendChild(x);
      }
      row.append(info, ctr); lista.appendChild(row);
    });
    box.appendChild(lista);
  }

  // ---- Administradores ----
  async function abaAdmins(box, ctx) {
    box.appendChild(el('p', 'note', 'Administradores podem importar planilhas, editar regras e textos e trocar o mês exibido. Os demais usuários registram o acompanhamento normalmente. Os usuários (login e senha) continuam sendo criados no Supabase, em Authentication > Users.'));
    const m = msgEl(); box.appendChild(m);
    const lista = el('div', 'adm-list'); box.appendChild(lista);
    const carregar = async () => {
      setMsg(m, 'Carregando…');
      const { data, error } = await ctx.sb.from('admins').select('email, criado_em').order('email');
      if (error) { setMsg(m, 'Não foi possível listar: ' + error.message, 'err'); return; }
      setMsg(m, ''); lista.replaceChildren();
      data.forEach((a) => {
        const row = el('div', 'adm-list-row'); row.append(el('strong', null, a.email));
        const ctr = el('div', 'adm-rule-ctr');
        if (a.email === ctx.sess.email) ctr.appendChild(el('span', 'note', 'você'));
        else {
          const x = btn('Remover', 'adm-del'); x.addEventListener('click', async () => {
            const { error: e } = await ctx.sb.from('admins').delete().eq('email', a.email);
            if (e) { setMsg(m, e.message, 'err'); return; } carregar();
          });
          ctr.appendChild(x);
        }
        row.appendChild(ctr); lista.appendChild(row);
      });
    };
    const novo = inp('', 'email'); novo.placeholder = 'nome@' + ((window.PAINEL_CONFIG || {}).DOMINIO_PERMITIDO || 'gcom.com.br'); novo.setAttribute('aria-label', 'E-mail do novo administrador');
    const add = btn('Adicionar administrador', 'primary');
    const a = el('div', 'form-actions'); a.append(novo, add); box.appendChild(a);
    add.addEventListener('click', async () => {
      const email = novo.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+$/.test(email)) { setMsg(m, 'Digite um e-mail válido.', 'err'); return; }
      const { error } = await ctx.sb.from('admins').upsert({ email });
      if (error) { setMsg(m, error.message, 'err'); return; }
      novo.value = ''; carregar();
    });
    carregar();
  }
})();
