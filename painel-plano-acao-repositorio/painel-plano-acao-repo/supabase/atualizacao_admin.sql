-- =====================================================================
-- Painel Plano de Ação - Giraffas  |  ÁREA DE ADMINISTRAÇÃO
-- Execute UMA vez no Supabase (SQL Editor > New query > colar > Run),
-- depois de já ter rodado o schema.sql. Pode rodar de novo sem problema.
-- =====================================================================

-- 1) Lista de administradores (quem importa planilhas e edita regras/textos)
create table if not exists public.admins (
  email      text primary key,
  criado_em  timestamptz not null default now()
);

-- >>> Troque/acrescente aqui os e-mails dos administradores iniciais <<<
insert into public.admins (email) values ('alexandre.ferreira@gcom.com.br')
on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

alter table public.admins enable row level security;
drop policy if exists "ler admins" on public.admins;
create policy "ler admins" on public.admins
  for select to authenticated using (public.email_permitido());
drop policy if exists "gerenciar admins" on public.admins;
create policy "gerenciar admins" on public.admins
  for all to authenticated using (public.is_admin()) with check (public.is_admin() and email like '%@%');

-- 2) Configurações editáveis pela tela (regras de ação, prioridades, prazos, tags, sugestões)
create table if not exists public.configuracoes (
  id            text primary key,
  conteudo      jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table public.configuracoes enable row level security;
drop policy if exists "ler configuracoes" on public.configuracoes;
create policy "ler configuracoes" on public.configuracoes
  for select to authenticated using (public.email_permitido());
drop policy if exists "gravar configuracoes" on public.configuracoes;
create policy "gravar configuracoes" on public.configuracoes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3) Administradores podem carregar/alterar os dados do mês pela tela
drop policy if exists "admin grava dados do mes" on public.painel_dados;
create policy "admin grava dados do mes" on public.painel_dados
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- recarrega o cadastro de colunas da API do Supabase
notify pgrst, 'reload schema';
