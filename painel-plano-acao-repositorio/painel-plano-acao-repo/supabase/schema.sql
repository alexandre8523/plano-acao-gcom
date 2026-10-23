-- =====================================================================
-- Painel Plano de Ação - Giraffas  |  estrutura do banco (Supabase)
-- Execute uma vez no Supabase: menu "SQL Editor" > New query > colar > Run
-- =====================================================================

-- 1) Quem pode usar o painel: só e-mails deste domínio.
--    Para liberar outro domínio, acrescente:  or lower(auth.jwt() ->> 'email') like '%@outrodominio.com.br'
create or replace function public.email_permitido()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') like '%@gcom.com.br'
$$;

-- 2) Dados do mês (plano, gráficos e tickets), carregados pelo script scripts/gerar_dados.py
--    id = mês ('2026-09') e uma cópia em 'atual', que é a que o painel abre
create table if not exists public.painel_dados (
  id            text primary key,
  conteudo      jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- 3) Situação atual de cada ação (uma linha por ação)
create table if not exists public.acoes (
  id            text primary key,              -- '2026-09-a1', '2026-09-a2', ...
  periodo       text not null,                 -- mês do plano, ex.: '2026-09'
  acao          integer not null,              -- número da ação no plano do mês
  status        text not null default 'Não iniciado'
                check (status in ('Não iniciado', 'Em andamento', 'Concluído', 'Cancelado')),
  progresso     integer not null default 0 check (progresso >= 0),
  responsavel   text,
  prazo         date,
  obs           text not null default '',
  atualizado_em timestamptz not null default now(),
  autor_id      uuid default auth.uid(),
  autor_nome    text,
  unique (periodo, acao)
);

-- 4) Percurso: cada atualização salva vira uma linha
create table if not exists public.historico (
  id               text primary key,
  periodo          text not null,
  acao             integer not null,
  status           text not null,
  progresso        integer not null check (progresso >= 0),
  nota             text not null default '',
  obs              text not null default '',
  mudancas         text not null default '',
  tags             text[] not null default '{}',
  registrado_em    timestamptz not null default now(),
  autor_id         uuid default auth.uid(),
  autor_nome       text,
  editado_em       timestamptz,
  editado_por      uuid,
  editado_por_nome text
);
create index if not exists historico_periodo_acao_idx on public.historico (periodo, acao);

-- 5) Segurança: só usuários logados com e-mail do domínio leem e gravam
alter table public.painel_dados enable row level security;
alter table public.acoes        enable row level security;
alter table public.historico    enable row level security;

drop policy if exists "ler dados do mes" on public.painel_dados;
create policy "ler dados do mes" on public.painel_dados
  for select to authenticated using (public.email_permitido());

drop policy if exists "ler acoes" on public.acoes;
create policy "ler acoes" on public.acoes
  for select to authenticated using (public.email_permitido());
drop policy if exists "criar acoes" on public.acoes;
create policy "criar acoes" on public.acoes
  for insert to authenticated with check (public.email_permitido() and autor_id = auth.uid());
drop policy if exists "alterar acoes" on public.acoes;
create policy "alterar acoes" on public.acoes
  for update to authenticated using (public.email_permitido()) with check (public.email_permitido() and autor_id = auth.uid());

drop policy if exists "ler historico" on public.historico;
create policy "ler historico" on public.historico
  for select to authenticated using (public.email_permitido());
drop policy if exists "criar historico" on public.historico;
create policy "criar historico" on public.historico
  for insert to authenticated with check (public.email_permitido() and autor_id = auth.uid());
drop policy if exists "editar historico" on public.historico;
create policy "editar historico" on public.historico
  for update to authenticated using (public.email_permitido()) with check (public.email_permitido());
drop policy if exists "excluir historico" on public.historico;
create policy "excluir historico" on public.historico
  for delete to authenticated using (public.email_permitido());

-- 6) Atualização ao vivo entre usuários (Realtime)
do $$
begin
  begin alter publication supabase_realtime add table public.acoes;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.historico; exception when duplicate_object then null; end;
end $$;

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
