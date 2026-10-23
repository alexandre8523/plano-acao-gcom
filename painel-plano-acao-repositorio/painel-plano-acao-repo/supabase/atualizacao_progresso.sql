-- =====================================================================
-- Painel Plano de Ação - Giraffas  |  PROGRESSO PELO PRAZO
-- Permite progresso acima de 100% (ações que passaram do prazo).
-- Execute UMA vez no Supabase (SQL Editor > New query > colar > Run).
-- =====================================================================
alter table public.acoes     drop constraint if exists acoes_progresso_check;
alter table public.acoes     add  constraint acoes_progresso_check     check (progresso >= 0);
alter table public.historico drop constraint if exists historico_progresso_check;
alter table public.historico add  constraint historico_progresso_check check (progresso >= 0);

-- recarrega o cadastro de colunas da API do Supabase
notify pgrst, 'reload schema';
