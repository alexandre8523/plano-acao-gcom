-- =====================================================================
-- Painel Plano de Ação  |  MARCA RECONHECIDA NA IMPORTAÇÃO
-- Atualiza a visão de relatórios para mostrar a marca e todas as cargas (mês + marca).
-- Execute UMA vez no Supabase (SQL Editor > New query > colar > Run).
-- =====================================================================
drop view if exists public.vw_acompanhamento;
-- 7) Visão pronta para relatórios (Power BI / Excel): ações com a última situação
create or replace view public.vw_acompanhamento
with (security_invoker = true) as
select coalesce(d.conteudo ->> 'chave', left(d.conteudo ->> 'inicio', 7)) as periodo,
       d.conteudo ->> 'periodo'  as periodo_nome,
       coalesce(p.item ->> 'marca', d.conteudo ->> 'marca') as marca,
       p.item ->> 'id'          as acao,
       p.item ->> 'unidade'     as unidade,
       p.item ->> 'uf'          as uf,
       p.item ->> 'tipo'        as tipo,
       (p.item ->> 'qtd')::int  as casos,
       p.item ->> 'prioridade'  as prioridade,
       coalesce(a.responsavel, p.item ->> 'responsavel') as responsavel,
       coalesce(a.prazo, (p.item ->> 'prazo')::date)     as prazo,
       coalesce(a.status, 'Não iniciado')                as status,
       coalesce(a.progresso, 0)                          as progresso,
       a.obs                                             as observacoes,
       a.atualizado_em,
       a.autor_nome                                      as atualizado_por
from public.painel_dados d
cross join lateral jsonb_array_elements(d.conteudo -> 'plano') as p(item)
left join public.acoes a on a.periodo = coalesce(d.conteudo ->> 'chave', left(d.conteudo ->> 'inicio', 7)) and a.acao = (p.item ->> 'id')::int
where d.id <> 'atual';

notify pgrst, 'reload schema';
