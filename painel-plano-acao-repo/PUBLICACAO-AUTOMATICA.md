# Publicação automática (GitHub + Cloudflare)

Cada alteração enviada para o GitHub é publicada sozinha no Cloudflare, no mesmo endereço.

## Configurar (uma vez)

1. Crie uma conta em https://github.com e um repositório **privado** (por exemplo, `painel-plano-acao`).
2. No repositório, clique em **Add file → Upload files** e arraste **todo o conteúdo desta pasta** (`site/`, `supabase/`, `scripts/`, `wrangler.jsonc`, `.gitignore` e os `.md`). Depois clique em **Commit changes**.
   - Confira se o seu `site/config.js` preenchido foi junto.
3. No Cloudflare, abra o projeto **plano-acao-gcom** e vá em **Settings → Build → Connect** (Git repository).
4. Autorize o GitHub, escolha o repositório e a branch `main`.
   - Build command: deixe vazio.
   - Deploy command: `npx wrangler deploy` (padrão).
   - Root directory: `/`
5. Salve. O Cloudflare faz a primeira publicação sozinho (aba **Deployments**).

## No dia a dia

- Para atualizar, abra o arquivo no GitHub (por exemplo, `site/index.html`), clique no lápis para editar ou use **Add file → Upload files** para substituir pelo arquivo novo, e clique em **Commit changes**.
- Em cerca de 1 minuto a nova versão está no ar. Se der algo errado, a publicação anterior continua no ar e o erro aparece em **Deployments**.
- Para voltar uma versão: em **Deployments**, escolha a anterior e clique em **Rollback**.

## Observações

- O `wrangler.jsonc` usa o nome `plano-acao-gcom`. Se o projeto no Cloudflare tiver outro nome, troque o `name` no arquivo.
- As pastas com dados de chamados (`dados/`, `carga_dados.sql`, planilhas) ficam fora do repositório pelo `.gitignore`.
