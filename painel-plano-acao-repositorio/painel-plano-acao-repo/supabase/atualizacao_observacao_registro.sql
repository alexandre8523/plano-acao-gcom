-- =====================================================================
-- Painel Plano de Ação - Giraffas  |  OBSERVAÇÃO POR REGISTRO DO PERCURSO
-- Cada registro do percurso passa a guardar a sua própria observação.
-- Execute UMA vez no Supabase (SQL Editor > New query > colar > Run).
-- =====================================================================
alter table public.historico add column if not exists obs text not null default '';

-- recarrega o cadastro de colunas da API do Supabase
notify pgrst, 'reload schema';
