// ============================================================
// Configuração do painel. Preencha com os dados do seu projeto
// Supabase: Project Settings > API (ou "Connect" > App Frameworks).
// A chave "anon" é pública por natureza; quem protege os dados
// são as regras de segurança criadas em supabase/schema.sql.
// ============================================================
window.PAINEL_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'COLE-AQUI-A-CHAVE-ANON-PUBLICA',

  // Domínio de e-mail liberado (precisa ser o mesmo do schema.sql)
  DOMINIO_PERMITIDO: 'gcom.com.br',

  // Mostrar o botão "Entrar com Microsoft" (precisa configurar o provedor Azure no Supabase)
  LOGIN_MICROSOFT: false,

  // Mostrar o botão "Receber link de acesso por e-mail" (usa o envio de e-mail do Supabase, que tem limite por hora)
  LOGIN_LINK_EMAIL: true,
};
