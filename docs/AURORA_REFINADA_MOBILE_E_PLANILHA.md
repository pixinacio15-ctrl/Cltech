# Aurora Refinada — Mobile, Planilha e Apps Script

## Arquivos principais

- `apps_script/Code_Aurora_REFINADO.gs`
- `pages/aurora-mobile.html`
- `worker/COLE_NO_WORKER_AURORA_REFINADO.js`
- `CLTECH_AURORA_PLANILHA_CONFIGURACAO.xlsx`

## Apps Script

O novo Apps Script cria e controla as abas:

- Configuracao
- Endpoints
- Servicos
- Produtos_Contas
- Contas_Estoque
- Alteracoes
- Callback
- Acessos
- Clientes
- Funcionarios
- Pedidos
- Tickets
- Pagamentos
- WhatsApp
- Logs
- Agendamentos_SP
- Codigos_Pedido
- Codigos_Confirmacao
- Aprovacao_Dono
- Relatorio_Codigo
- Chat_IA
- Chat_Guiado
- Novidades
- Carrossel
- Aurora_Status

Execute no Google Apps Script:

```txt
setupAurora
```

## Mobile

Acesse:

```txt
/aurora-mobile.html
```

## Efí

A Aurora opera Efí pelo Worker. A Efí exige credenciais da aplicação, chave Pix e certificado mTLS no Worker. No pacote, isso fica como:

- EFI_CLIENT_ID
- EFI_CLIENT_SECRET
- EFI_PIX_KEY
- EFI_CERT

## Visual anime

A interface usa mascotes anime em SVG, em estilo seguro, profissional e não explícito.
