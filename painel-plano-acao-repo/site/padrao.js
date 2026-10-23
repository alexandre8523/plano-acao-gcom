// Configuração padrão do painel. A área de Administração grava uma cópia editável no banco
// (tabela configuracoes); este arquivo só é usado enquanto nada foi salvo por lá.
window.PAINEL_PADRAO = {
  "titulo": "Plano de Ação - {marca}",
  "subtitulo": "Suporte Gcom",
  "filtroTime": "SUPORTE",
  "excluirTipos": [
    "Inconclusivo"
  ],
  "minCasos": 4,
  "prioridadePor": "causa",
  "prioridade": {
    "altaMin": 5,
    "mediaMin": 4
  },
  "prazos": {
    "Alta": 7,
    "Média": 15,
    "Baixa": 30
  },
  "topN": 10,
  "indicador": "Reduzir em 50% os chamados \"{tipo}\" da unidade no próximo mês",
  "regras": [
    {
      "chave": "sem retorno",
      "acao": "Definir contato fixo (responsável + WhatsApp) na unidade e validar disponibilidade antes de abrir o chamado; reforçar com o franqueado que chamados sem retorno são encerrados.",
      "responsavel": "Customer Success"
    },
    {
      "chave": "gcomdb",
      "acao": "Agendar janela fixa de atualização do GcomDB (cardápio/produtos/usuários) e validar o envio automático; treinar a loja para checar a atualização após mudanças de cardápio.",
      "responsavel": "Suporte N2 / Cadastro"
    },
    {
      "chave": "display",
      "acao": "Padronizar a configuração do chama senha (display, resolução, fonte) e documentar; orientar técnico local a fixar a saída de vídeo para evitar inversão de telas.",
      "responsavel": "Suporte N1 + Técnico local"
    },
    {
      "chave": "impressora de cupom",
      "acao": "Revisar driver, cabo, porta e modelo das impressoras de cupom; enviar técnico local para checagem preventiva e avaliar troca do equipamento reincidente.",
      "responsavel": "Técnico local / Infra"
    },
    {
      "chave": "impressora",
      "acao": "Revisar configuração de impressão (apontamento/modelo) e deixar procedimento padrão documentado na loja.",
      "responsavel": "Suporte N1"
    },
    {
      "chave": "takeaway",
      "acao": "Revisar e congelar a configuração de filtros/telas Takeaway; enviar guia rápido de uso à equipe da loja.",
      "responsavel": "Suporte N2"
    },
    {
      "chave": "certificado",
      "acao": "Controlar vencimento dos certificados digitais (alerta 30 dias antes) e definir o fluxo de envio do novo certificado pelo administrativo.",
      "responsavel": "Administrativo / Suporte N1"
    },
    {
      "chave": "integra",
      "acao": "Auditar parâmetros e cardápio da integração (De-Para) e monitorar falhas; acionar parceiro quando a causa for externa.",
      "responsavel": "Integrações"
    },
    {
      "chave": "tef",
      "acao": "Revisar comunicação TEF (PinPad/GSurf/Sitef/rede) e checklist de conectividade; treinar operadores em dúvidas de TEF/PIX.",
      "responsavel": "Suporte N2 + Adquirente"
    },
    {
      "chave": "pix",
      "acao": "Revisar comunicação TEF (PinPad/GSurf/Sitef/rede) e checklist de conectividade; treinar operadores em dúvidas de TEF/PIX.",
      "responsavel": "Suporte N2 + Adquirente"
    },
    {
      "chave": "servidor desligado",
      "acao": "Orientar a loja a manter o servidor ligado/no-break; avaliar BIOS para ligar automaticamente após queda de energia.",
      "responsavel": "Técnico local / Infra"
    },
    {
      "chave": "rede interna",
      "acao": "Checar rede interna, IP fixo do servidor e switch; acionar técnico local para manutenção preventiva da rede.",
      "responsavel": "Técnico local / Infra"
    },
    {
      "chave": "abertura do programa",
      "acao": "Verificar apontamento de banco/firewall/servidor e documentar a configuração correta da unidade.",
      "responsavel": "Infra"
    },
    {
      "chave": "bloqueio administrativo",
      "acao": "Alinhar com o financeiro/franqueado a regularização para evitar bloqueios recorrentes; comunicar antecipadamente.",
      "responsavel": "Financeiro / Customer Success"
    },
    {
      "chave": "pendentes no encerramento",
      "acao": "Investigar a causa dos pedidos pendentes (Totem / ID nulo) com Produto e orientar o fechamento correto do dia.",
      "responsavel": "Produto / Suporte N2"
    },
    {
      "chave": "encerramento",
      "acao": "Treinar a loja no fluxo de fechamento de caixa e encerramento do dia.",
      "responsavel": "Treinamento"
    },
    {
      "chave": "fechamento",
      "acao": "Treinar a loja no fluxo de fechamento de caixa e encerramento do dia.",
      "responsavel": "Treinamento"
    },
    {
      "chave": "pausa",
      "acao": "Treinar a loja no processo de pausa/despausa e validar a sincronização com o Totem.",
      "responsavel": "Treinamento / Produto"
    },
    {
      "chave": "dúvida",
      "acao": "Realizar reciclagem/treinamento com a equipe da loja nos temas recorrentes e enviar material de apoio.",
      "responsavel": "Treinamento"
    },
    {
      "chave": "duvida",
      "acao": "Realizar reciclagem/treinamento com a equipe da loja nos temas recorrentes e enviar material de apoio.",
      "responsavel": "Treinamento"
    },
    {
      "chave": "cpu",
      "acao": "Avaliar condição do hardware (CPU/periféricos/SO) e programar manutenção ou substituição.",
      "responsavel": "Técnico local / Infra"
    },
    {
      "chave": "sistema operacional",
      "acao": "Avaliar condição do hardware (CPU/periféricos/SO) e programar manutenção ou substituição.",
      "responsavel": "Técnico local / Infra"
    },
    {
      "chave": "instala",
      "acao": "Revisar o padrão de instalação/versão e agendar atualização única para todos os terminais.",
      "responsavel": "Implantação"
    }
  ],
  "padroes": {
    "Dúvida": {
      "acao": "Realizar treinamento/reciclagem com a equipe da loja e enviar material de apoio (FAQ).",
      "responsavel": "Treinamento"
    },
    "Requisição": {
      "acao": "Avaliar se a solicitação pode virar autoatendimento ou ser feita de forma preventiva/em lote.",
      "responsavel": "Suporte N1"
    },
    "Incidente": {
      "acao": "Fazer análise de causa raiz dos incidentes recorrentes e acionar a área responsável (infra/terceiro/produto).",
      "responsavel": "Suporte N2"
    },
    "Outros": {
      "acao": "Analisar os casos e definir ação corretiva.",
      "responsavel": "Suporte"
    }
  },
  "tags": [
    "Dúvida",
    "Infraestrutura",
    "Direcionamento",
    "Treinamento"
  ],
  "obsSugestoes": [
    "Sem contato com a unidade"
  ]
};
