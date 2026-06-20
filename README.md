# CLTECH Studio — GitHub + PixiJS + Cloudflare Pages

Projeto pronto para usar com GitHub e Cloudflare Pages.

## Deploy no Cloudflare Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos deste pacote.
3. No Cloudflare, vá em **Workers & Pages**.
4. Crie um projeto **Pages** conectado ao GitHub.
5. Configure:
   - Framework preset: `None`
   - Build command: vazio
   - Build output directory: `pages`

## PixiJS

O site usa PixiJS em `pages/assets/pixi-background.js` para criar um fundo cyber animado com partículas, linhas, circuitos e brilho neon.

## Worker Pix Efí

Crie um Worker separado chamado `cltech-api` e cole o código de `worker/src/worker.js`.

Configure as secrets em `worker/CONFIGURE_WORKER_EFI_SECRETS.txt`.

## Segurança

Não envie para o GitHub: `.env`, `.p12`, `cert.pem`, `key.pem`, `SUPABASE_SECRET_KEY` ou `EFI_CLIENT_SECRET`.
