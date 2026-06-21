
## Aurora Transfer Manager

A Aurora é a gerenciadora profissional de transferência da CLTECH Studio. Ela controla:

- Banco de dados e Supabase
- Pix Efí e callbacks
- Estoque de contas pela planilha
- Códigos de pedido e sessão
- Relatório por código
- Agendamento de manutenção em São Paulo
- Atendimento guiado por problema
- Aurora IA integrada em modo guiado
- Aprovação do dono para alterações administrativas
- Gráficos PixiJS com dados persistentes
- Acessos reais do site
- Carrosséis de novidades e menus

### Novas páginas

```txt
pages/aurora.html
pages/admin-aurora.html
```

### Novos arquivos

```txt
pages/assets/aurora.js
pages/assets/aurora-charts.js
pages/assets/logo-cltech-aurora.svg
pages/assets/icons/
pages/assets/illustrations/
supabase/aurora_schema.sql
worker/COLE_NO_WORKER_AURORA.js
apps_script/Code_Aurora.gs
```

### Cloudflare Pages via GitHub

```txt
Framework preset: None
Build command: vazio
Build output directory: pages
```

### Planilha de alteração

Use as abas criadas pelo Apps Script:
- Alteracoes
- Callback
- Contas_Estoque
- Codigos_Confirmacao
- Aprovacao_Dono
- Relatorio_Codigo

Para contas digitais, preencha a aba `Contas_Estoque` com `status=disponivel` e `produto_slug`.
