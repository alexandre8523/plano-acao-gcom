# Painel Plano de Ação – Giraffas (versão hospedagem estática)

O painel tem o mesmo visual e as mesmas funções da versão no Claude:

- indicadores e gráficos;
- filtros por unidade e por causa;
- status, progresso, observações, tags e percurso com linha do tempo;
- edição e exclusão de registros;
- **área de Administração**: importar a planilha do mês e editar regras, textos e ações direto na tela, sem mexer em arquivos.

Ele roda em qualquer hospedagem de site estático. Os dados ficam no **Supabase**, que tem banco PostgreSQL, login e atualização ao vivo, e o plano gratuito atende esse volume.

```
painel-plano-acao/
├── site/                 ← SÓ esta pasta vai para a hospedagem
│   ├── index.html        ← o painel
│   ├── config.js         ← endereço e chave do Supabase (único arquivo para editar)
│   ├── app-supabase.js   ← login + leitura/gravação no banco
│   ├── admin.js          ← área de Administração (importação e regras)
│   └── padrao.js         ← regras e textos padrão (usados até alguém salvar outros na tela)
├── dados/plano.json      ← cópia local dos dados do mês (conferência; não publicar)
├── supabase/
│   ├── schema.sql              ← cria tabelas e regras de acesso (rodar 1 vez)
│   ├── atualizacao_admin.sql   ← cria a área de Administração (rodar 1 vez, depois do schema)
│   ├── atualizacao_progresso.sql ← permite progresso acima de 100% (rodar 1 vez em bancos criados antes de 21/10/2026)
│   ├── atualizacao_marca.sql   ← relatório com a marca reconhecida (rodar 1 vez em bancos criados antes de 22/10/2026)
│   ├── atualizacao_observacao_registro.sql ← observação em cada registro do percurso (rodar 1 vez em bancos criados antes de 21/10/2026)
│   └── carga_dados.sql         ← dados de setembro/2026 (opcional: a importação pela tela substitui)
└── scripts/
    └── gerar_dados.py    ← alternativa à importação pela tela (gera o carga_dados.sql)
```

---

## 1. Criar o banco no Supabase (uma vez, ~10 min)

1. Crie uma conta em https://supabase.com e clique em **New project**. Escolha a região **South America (São Paulo)** e anote a senha do banco.
2. Crie as tabelas: abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Crie a área de Administração: em uma nova query, cole o conteúdo de `supabase/atualizacao_admin.sql`, troque ou acrescente os e-mails dos administradores na linha indicada e clique em **Run**.
4. Carregue os dados: entre no painel como administrador e importe a planilha pela tela (seção 5). Outra opção é rodar o `supabase/carga_dados.sql` no SQL Editor.
5. Configure o login: em **Authentication → URL Configuration**, preencha **Site URL** com o endereço onde o painel vai ficar (por exemplo, `https://plano-giraffas.netlify.app`) e adicione esse mesmo endereço em **Redirect URLs**.
   - O login com **e-mail e senha** já vem ativo. Veja abaixo como criar os usuários.
   - O botão "Receber link de acesso por e-mail" também funciona, mas depende do envio de e-mail do Supabase, que tem limite por hora. Para escondê-lo, use `LOGIN_LINK_EMAIL: false` no `site/config.js`.
   - Opcional: para entrar com a conta Microsoft 365, ative **Authentication → Providers → Azure**, seguindo o guia do Supabase, e mude `LOGIN_MICROSOFT` para `true` no `site/config.js`.
6. Pegue as chaves: em **Project Settings → API**, copie a **Project URL** e a chave **anon public** e cole as duas no `site/config.js`.

> **Quem tem acesso:** só pessoas logadas com e-mail **@gcom.com.br** leem e gravam dados. Essa regra está no banco (função `email_permitido` no `schema.sql`), e não apenas na tela.
>
> **Liberar outro domínio:** edite a função `email_permitido` no `schema.sql` e o `DOMINIO_PERMITIDO` no `site/config.js`.

## 2. Publicar o site (escolha uma opção)

| Opção | Como fazer |
|---|---|
| **Netlify (mais fácil)** | Entre em https://app.netlify.com/drop e arraste a pasta **`site`**. Em segundos você recebe o endereço. |
| **Vercel** | **Add New → Project**, importe o repositório e defina **Root Directory = `site`**. Não precisa de build. |
| **GitHub Pages** | Suba só o conteúdo de `site/` em um repositório e ative **Settings → Pages**. |
| **Servidor da Gcom (IIS, Nginx, Apache)** | Copie os arquivos de `site/` para uma pasta publicada. É só HTML, CSS e JS, sem servidor de aplicação. |

> **Atenção:** publique só a pasta `site`. As pastas `dados/` e `supabase/` têm os dados dos chamados e não devem ficar acessíveis na internet.

Depois de publicar, confira se o endereço final está no **Site URL** e nas **Redirect URLs** do Supabase (passo 1.5).

## 3. Criar os usuários (e-mail e senha)

1. No Supabase, entre em **Authentication → Users → Add user → Create new user**.
2. Informe o e-mail @gcom.com.br e uma senha inicial de pelo menos 6 caracteres.
3. Marque **Auto Confirm User** e clique em **Create user**. Não sai nenhum e-mail.
4. Passe a senha inicial para a pessoa. Ela pode trocar depois, em **Alterar senha**, no topo do painel.

Para remover o acesso de alguém, apague o usuário na mesma tela.

## 4. Usar

**Como o progresso é calculado:** pelo tempo do prazo de cada ação.

- **Não iniciado:** fica em 0%.
- **Em andamento:** sobe sozinho, de 0% no início do plano até 100% no fim do dia do prazo. Se o prazo passar, continua acima de 100% e mostra o alerta **⚠ Prazo estourado**.
- **Concluído ou Cancelado:** fica congelado no percentual do dia em que a ação foi marcada, mesmo que tenha passado de 100%.
- **Ações com a tag Direcionamento:** ficam sem prazo e sem percentual.

1. Abra o endereço do site, digite seu e-mail @gcom.com.br e a senha e clique em **Entrar**. A sessão fica salva no navegador.
2. Tudo o que alguém salva aparece na hora para os outros que estão com o painel aberto.

## 5. Administração: atualizar o mês e ajustar regras pela tela

Quem está na lista de administradores vê os botões **Painel** e **Ajustes** no topo. **Ajustes** abre a área de administração em uma tela própria, e **Painel** volta para os indicadores, gráficos e ações.

| Aba | Para que serve |
|---|---|
| **Importar planilha** | Escolha a exportação do mês (`.xls`, `.xlsx` ou `.csv`) e clique em **Processar arquivo**. O painel mostra um resumo (chamados, ações, prioridades). Confira e clique em **Publicar no painel**. Reimportar o mesmo mês mantém o acompanhamento e o número das ações. |
| **Regras e textos** | Título, time considerado, tipos excluídos, mínimo de casos, faixas de prioridade, prazos, top de unidades, texto da meta, ação e responsável sugeridos por palavra-chave, tags do percurso e sugestões de observação. As regras valem a partir da próxima importação. |
| **Marca** | Na importação, o painel reconhece a marca pela coluna **Marca Empresarial** e mostra a etiqueta da marca no topo do Painel. Cada carga fica guardada por **mês + marca** (por exemplo, `2026-09-giraffas`), então importar outra marca no mesmo mês cria um plano separado, que você escolhe em "Meses carregados". Se o arquivo tiver várias marcas misturadas, o plano vira **MULTIMARCAS** e ganha um filtro por marca. |
| **Meses carregados** | Lista os meses importados. Permite escolher qual mês o painel mostra e excluir cargas antigas. |
| **Administradores** | Adiciona ou remove quem pode administrar. Os usuários continuam sendo criados no Supabase (seção 3). |

No detalhe de cada ação, o administrador também vê **Editar ação proposta, meta e responsável sugerido**, para ajustar o texto de uma ação específica.

Mudanças de layout, como novas colunas ou gráficos, ainda pedem edição dos arquivos do `site/` e nova publicação. Para isso, use o campo "Ask an agent…" do Netlify ou um repositório GitHub conectado, que publica a cada alteração.

### Alternativa: gerar a carga pelo script

1. Exporte os chamados do mês no sistema (o mesmo `.xls` de sempre).
2. Gere a carga:
   ```bash
   pip install pandas lxml openpyxl
   python scripts/gerar_dados.py caminho/da/exportacao.xls
   ```
   O script aplica as regras padrão (as editadas na tela valem só para a importação pela tela):
   - só o time Suporte, sem o tipo Inconclusivo;
   - entram unidade e tipo com mais de 3 casos;
   - prioridade pela causa (serviço) que mais se repete na ação: Alta com mais de 4 casos, Média com 4 e Baixa abaixo disso;
   - prazos de 7 e 15 dias a partir de hoje;
   - top 10 pelas unidades com mais chamados.
3. Cole o novo `supabase/carga_dados.sql` no **SQL Editor** do Supabase e clique em **Run**.

O acompanhamento é separado por mês (coluna `periodo`). O mês novo começa zerado, e o histórico dos meses anteriores continua guardado no banco.

## 6. Relatórios (Power BI / Excel)

A visão **`vw_acompanhamento`** junta o plano do mês com a situação atual de cada ação: status, progresso, responsável, prazo e observações. As tabelas `historico` e `acoes` trazem o percurso completo.

Para conectar o Power BI:

1. No Power BI, use **Obter dados → Banco de dados PostgreSQL**.
2. Preencha os dados de conexão que aparecem em **Project Settings → Database** do Supabase.
3. Use um usuário de banco só de leitura.

## Observações

- As atualizações feitas na versão do painel no Claude **não são migradas**: lá havia apenas registros de teste.
- A chave `anon` do `site/config.js` pode ficar no site, porque ela não dá acesso a nada sem login. Quem protege os dados são as regras do `schema.sql`.
- **Nunca** coloque a chave `service_role` no site.
- O link por e-mail usa o envio padrão do Supabase, que tem limite de poucos e-mails por hora. O login com senha não depende disso. Para usar o link com a equipe toda, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.
