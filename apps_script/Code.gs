
/**
 * CLTECH Aurora Transfer Manager — Google Sheets Controller
 * Versão refinada: configuração, callback, estoque, alterações, relatórios e endpoints.
 *
 * Como usar:
 * 1. Cole este arquivo no Apps Script da planilha.
 * 2. Execute setupAurora().
 * 3. Publique como Web App.
 * 4. Copie a URL para SHEETS_WEBHOOK_URL no Cloudflare Worker.
 *
 * Segurança:
 * - Defina SHEETS_TOKEN em Configuracao!B2.
 * - O Worker deve enviar esse token em toda chamada.
 */

const AURORA_VERSION = '2.1.0';
const DEFAULT_TOKEN = 'troque_este_token_no_setup';

const SHEET_DEFS = {
  Configuracao: ['chave','valor','tipo','obrigatorio','descricao','atualizado_em'],
  Endpoints: ['nome','metodo','url','token','ativo','ultima_chamada','ultimo_status','observacao'],
  Servicos: ['ativo','slug','titulo','categoria','preco_centavos','prazo_dias','descricao','tags','destaque','ordem'],
  Produtos_Contas: ['ativo','slug','titulo','secao','preco_centavos','descricao','ordem'],
  Contas_Estoque: ['status','produto_slug','ref','login','senha','email','observacao','reservado_em','entregue_em','pedido_codigo'],
  Alteracoes: ['executar','area','acao','dados_json','exige_dono','codigo_dono','status','retorno','criado_em','executado_em'],
  Callback: ['data','origem','evento','status','payload_json','retorno_json'],
  Acessos: ['data','evento','path','titulo','ip','user_agent','dados_json'],
  Clientes: ['data','id','nome','email','telefone','status','dados_json'],
  Funcionarios: ['data','id','nome','email','cargo','ativo','permissoes_json'],
  Pedidos: ['data','codigo','cliente','produto_servico','valor_centavos','status','payload_json'],
  Tickets: ['data','codigo','categoria','assunto','status','mensagem','resposta'],
  Pagamentos: ['data','codigo','txid','provider','valor_centavos','status','payload_json'],
  WhatsApp: ['data','destino','tipo','mensagem','status','payload_json'],
  Logs: ['data','nivel','origem','mensagem','payload_json'],
  Agendamentos_SP: ['data','codigo','nome','whatsapp','bairro','endereco','data_visita','periodo','problema','status'],
  Codigos_Pedido: ['data','codigo','tipo','titulo','status','payload_json'],
  Codigos_Confirmacao: ['data','codigo','area','admin','status','observacao_dono','payload_json'],
  Aprovacao_Dono: ['data','codigo','area','alteracao','admin','status','confirmado_em','payload_json'],
  Relatorio_Codigo: ['data','codigo','status','relatorio_json'],
  Chat_IA: ['data','codigo','mensagem','resposta','status','payload_json'],
  Chat_Guiado: ['data','codigo','grupo','resposta','status','payload_json'],
  Novidades: ['ativo','titulo','subtitulo','imagem','link','ordem'],
  Carrossel: ['ativo','titulo','texto','imagem','botao','link','ordem'],
  Aurora_Status: ['data','modulo','status','detalhe','payload_json']
};

const CONFIG_DEFAULTS = [
  ['SHEETS_TOKEN', DEFAULT_TOKEN, 'secret', 'sim', 'Token que o Worker usa para chamar a planilha. Troque por um token forte.'],
  ['WORKER_URL', '', 'url', 'sim', 'URL do Cloudflare Worker cltech-api.'],
  ['SUPABASE_URL', 'https://ihommfxxdynexzzshwhi.supabase.co', 'url', 'sim', 'URL do Supabase.'],
  ['OWNER_WHATSAPP', '5511951289502', 'texto', 'sim', 'WhatsApp do dono.'],
  ['AURORA_AI_MODE', 'guided', 'texto', 'sim', 'Modo da IA: guided, worker ou off.'],
  ['OWNER_APPROVAL_REQUIRED', 'true', 'boolean', 'sim', 'Se true, alterações administrativas exigem código do dono.'],
  ['ACCOUNT_DELIVERY_MODE', 'sheet_stock', 'texto', 'sim', 'Modo de entrega de contas: sheet_stock.'],
  ['NO_STOCK_ACTION', 'whatsapp_admin', 'texto', 'sim', 'Ação quando não há conta disponível.'],
  ['MAINTENANCE_CITY', 'São Paulo', 'texto', 'sim', 'Cidade atendida para visitas presenciais.'],
  ['EFI_MODE', 'worker_mtls', 'texto', 'sim', 'A Efí opera pelo Worker com mTLS.'],
  ['CALLBACK_ACTIVE', 'true', 'boolean', 'sim', 'Permite callbacks da Aurora.'],
  ['SHEET_LAST_SETUP', '', 'data', 'não', 'Preenchido automaticamente.']
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Aurora')
    .addItem('Configurar/Atualizar planilha', 'setupAurora')
    .addItem('Processar alterações pendentes', 'processarAlteracoes')
    .addItem('Testar status', 'statusAurora')
    .addToUi();
}

function setupAurora() {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    Object.keys(SHEET_DEFS).forEach(name => {
      const sh = getOrCreateSheet_(ss, name);
      ensureHeader_(sh, SHEET_DEFS[name]);
      styleSheet_(sh);
    });

    seedConfig_();
    seedInitialContent_();
    setValidations_();
    appendLog_('info', 'setupAurora', 'Planilha configurada', {version: AURORA_VERSION});

    return jsonOutput_({ok:true, version:AURORA_VERSION, sheets:Object.keys(SHEET_DEFS)});
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'health';

  if (action === 'setup') return setupAurora();
  if (action === 'config') return jsonOutput_({ok:true, config:getConfig_()});
  if (action === 'status') return statusAurora();
  if (action === 'report') return relatorioPorCodigo_((e.parameter && e.parameter.code) || '');

  return jsonOutput_({
    ok:true,
    service:'CLTECH Aurora Sheets',
    version:AURORA_VERSION,
    actions:['setup','config','status','report']
  });
}

function doPost(e) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const body = parseBody_(e);
    const config = getConfig_();
    const token = String(config.SHEETS_TOKEN || DEFAULT_TOKEN);

    if (body.token !== token) {
      appendCallback_('worker','auth_failed','denied', body, {error:'token inválido'});
      return jsonOutput_({ok:false,error:'token inválido'});
    }

    const type = String(body.type || body.action || 'append').toLowerCase();
    const data = body.data || {};

    if (type === 'claim_account') return claimAccount_(data);
    if (type === 'append') return appendGeneric_(data.sheet || data.type || 'Logs', data);
    if (type === 'config_update') return updateConfig_(data);
    if (type === 'change_request') return addChangeRequest_(data);
    if (type === 'process_changes') return processarAlteracoes();
    if (type === 'callback') return receiveCallback_(data);
    if (type === 'report_code') return relatorioPorCodigo_(data.code || body.code || '');
    if (type === 'health') return statusAurora();

    return appendGeneric_(type, data);
  } catch (err) {
    appendLog_('error','doPost', String(err && err.message || err), {});
    return jsonOutput_({ok:false,error:String(err && err.message || err)});
  } finally {
    lock.releaseLock();
  }
}

function claimAccount_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Contas_Estoque');
  const orderCode = data.order_code || gerarCodigo_('PED');
  const slug = String(data.product_slug || '').trim();

  appendRow_('Codigos_Pedido', [new Date(), orderCode, 'account_purchase', data.product_title || slug, 'checking_stock', JSON.stringify(data)]);

  if (!slug) {
    appendCallback_('claim_account','invalid','error', data, {error:'product_slug ausente'});
    return jsonOutput_({ok:false,error:'product_slug ausente',order_code:orderCode});
  }

  const last = sh.getLastRow();
  if (last < 2) {
    handleNoStock_(orderCode, data);
    return jsonOutput_({ok:true,order_code:orderCode,no_stock:true,account:null});
  }

  const values = sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();

  for (let i=0;i<values.length;i++) {
    const row = values[i];
    const status = String(row[0] || '').toLowerCase().trim();
    const productSlug = String(row[1] || '').trim();

    if ((status === 'disponivel' || status === 'disponível') && productSlug === slug) {
      const sheetRow = i + 2;
      sh.getRange(sheetRow,1).setValue('entregue');
      sh.getRange(sheetRow,8).setValue(new Date());
      sh.getRange(sheetRow,9).setValue(new Date());
      sh.getRange(sheetRow,10).setValue(orderCode);

      const account = {
        ref: row[2] || '',
        login: row[3] || '',
        senha: row[4] || '',
        email: row[5] || '',
        observacao: row[6] || ''
      };

      appendRow_('Pedidos', [new Date(), orderCode, data.customer || '', data.product_title || slug, data.amount_cents || '', 'entregue', JSON.stringify(data)]);
      appendRow_('Callback', [new Date(), 'sheet', 'claim_account', 'delivered', JSON.stringify(data), JSON.stringify({account_ref:account.ref})]);
      return jsonOutput_({ok:true,order_code:orderCode,account:account});
    }
  }

  handleNoStock_(orderCode, data);
  return jsonOutput_({ok:true,order_code:orderCode,no_stock:true,account:null});
}

function handleNoStock_(orderCode, data) {
  appendRow_('Pedidos', [new Date(), orderCode, data.customer || '', data.product_title || data.product_slug || '', data.amount_cents || '', 'sem_estoque', JSON.stringify(data)]);
  appendRow_('Callback', [new Date(), 'sheet', 'claim_account', 'no_stock', JSON.stringify(data), JSON.stringify({whatsapp_admin:true})]);
  appendLog_('warn','claimAccount','Produto sem estoque', {orderCode:orderCode, data:data});
}

function updateConfig_(data) {
  const key = String(data.key || '').trim();
  if (!key) return jsonOutput_({ok:false,error:'key obrigatória'});

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuracao');
  const last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(2,1,last-1,1).getValues().flat() : [];
  const idx = values.findIndex(v => String(v) === key);

  if (idx >= 0) {
    sh.getRange(idx+2,2).setValue(data.value || '');
    sh.getRange(idx+2,6).setValue(new Date());
  } else {
    sh.appendRow([key, data.value || '', data.type || 'texto', data.required || 'não', data.description || '', new Date()]);
  }

  appendCallback_('config','update','ok', data, {});
  return jsonOutput_({ok:true,key:key});
}

function addChangeRequest_(data) {
  const code = data.code || gerarCodigo_('DONO');
  appendRow_('Alteracoes', [
    data.executar || 'PENDENTE',
    data.area || '',
    data.acao || '',
    JSON.stringify(data.dados || data),
    data.exige_dono === false ? 'não' : 'sim',
    code,
    'pendente',
    '',
    new Date(),
    ''
  ]);
  appendRow_('Codigos_Confirmacao', [new Date(), code, data.area || '', data.admin || '', 'pendente', '', JSON.stringify(data)]);
  appendRow_('Aprovacao_Dono', [new Date(), code, data.area || '', data.acao || '', data.admin || '', 'pendente', '', JSON.stringify(data)]);
  return jsonOutput_({ok:true,code:code,status:'pendente'});
}

function processarAlteracoes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Alteracoes');
  const config = getConfig_();
  const workerUrl = String(config.WORKER_URL || '').replace(/\/$/,'');
  const last = sh.getLastRow();

  if (last < 2) return jsonOutput_({ok:true,processed:0});

  const values = sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  let processed = 0;

  values.forEach((row, i) => {
    const sheetRow = i + 2;
    const executar = String(row[0] || '').toUpperCase().trim();
    const exigeDono = String(row[4] || '').toLowerCase().trim();
    const codigo = String(row[5] || '').trim();
    const status = String(row[6] || '').toLowerCase().trim();

    if (executar !== 'APROVAR' || status === 'executado') return;

    if (exigeDono === 'sim') {
      const confirmed = codigoConfirmado_(codigo);
      if (!confirmed) {
        sh.getRange(sheetRow,7).setValue('aguardando_dono');
        sh.getRange(sheetRow,8).setValue('Código do dono ainda não confirmado.');
        return;
      }
    }

    const payload = {
      area: row[1],
      acao: row[2],
      dados: safeJson_(row[3], {}),
      codigo: codigo
    };

    let retorno = {local:true, message:'Alteração marcada como executada na planilha.'};

    if (workerUrl) {
      try {
        const res = UrlFetchApp.fetch(workerUrl + '/api/aurora/sheets/change-callback', {
          method:'post',
          contentType:'application/json',
          payload: JSON.stringify({token: config.SHEETS_TOKEN, data: payload}),
          muteHttpExceptions:true
        });
        retorno = safeJson_(res.getContentText(), {status:res.getResponseCode(), text:res.getContentText()});
      } catch (err) {
        retorno = {error:String(err)};
      }
    }

    sh.getRange(sheetRow,7).setValue('executado');
    sh.getRange(sheetRow,8).setValue(JSON.stringify(retorno));
    sh.getRange(sheetRow,10).setValue(new Date());
    appendCallback_('alteracoes','processar','executado', payload, retorno);
    processed++;
  });

  return jsonOutput_({ok:true,processed:processed});
}

function receiveCallback_(data) {
  appendCallback_(data.origem || 'worker', data.evento || 'callback', data.status || 'ok', data.payload || data, data.retorno || {});
  return jsonOutput_({ok:true});
}

function relatorioPorCodigo_(code) {
  code = String(code || '').trim();
  if (!code) return jsonOutput_({ok:false,error:'código obrigatório'});

  const report = {};
  ['Pedidos','Tickets','Pagamentos','Agendamentos_SP','Codigos_Pedido','Codigos_Confirmacao','Aprovacao_Dono','Chat_IA','Chat_Guiado','Callback'].forEach(name => {
    report[name] = findRowsByCode_(name, code);
  });

  appendRow_('Relatorio_Codigo', [new Date(), code, 'gerado', JSON.stringify(report)]);
  return jsonOutput_({ok:true,code:code,report:report});
}

function statusAurora() {
  const config = getConfig_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const status = {
    ok:true,
    version:AURORA_VERSION,
    spreadsheet:ss.getName(),
    sheets:Object.keys(SHEET_DEFS).filter(name => !!ss.getSheetByName(name)).length,
    config:{
      worker_url: !!config.WORKER_URL,
      token: !!config.SHEETS_TOKEN,
      owner_whatsapp: config.OWNER_WHATSAPP || ''
    },
    time:new Date().toISOString()
  };
  appendRow_('Aurora_Status', [new Date(), 'sheets', 'ok', 'Status consultado', JSON.stringify(status)]);
  return jsonOutput_(status);
}

function appendGeneric_(type, data) {
  const sheet = normalizeTypeToSheet_(type);
  appendRow_(sheet, [new Date(), type, JSON.stringify(data)]);
  return jsonOutput_({ok:true,sheet:sheet});
}

function seedConfig_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuracao');
  const last = sh.getLastRow();
  const existing = last > 1 ? sh.getRange(2,1,last-1,1).getValues().flat().map(String) : [];

  CONFIG_DEFAULTS.forEach(row => {
    if (!existing.includes(row[0])) {
      sh.appendRow([row[0], row[1], row[2], row[3], row[4], new Date()]);
    }
  });

  setConfigValue_('SHEET_LAST_SETUP', new Date().toISOString());
}

function seedInitialContent_() {
  seedRowsIfEmpty_('Produtos_Contas', [
    ['sim','blox-fruits-level-max','Conta Blox Fruits Level Max','Contas Blox Fruits',2990,'Conta avançada com entrega controlada por estoque.',1],
    ['sim','blox-fruits-raca-v4','Conta com Raça V4','Contas Blox Fruits',4990,'Conta com evolução de raça conforme disponibilidade.',2],
    ['sim','blox-fruits-godhuman-cdk','Conta Godhuman + CDK','Contas Blox Fruits',6990,'Conta com build premium e progressão avançada.',3],
    ['sim','blox-fruits-fruta-mitica','Conta com Fruta Mítica','Contas Blox Fruits',8990,'Conta com fruta mítica conforme estoque.',4],
    ['sim','conta-premium-personalizada','Conta Premium Personalizada','Contas Premium',12990,'Conta selecionada conforme briefing do cliente.',5]
  ]);

  seedRowsIfEmpty_('Novidades', [
    ['sim','Aurora Transfer Manager','Banco, Efí, planilhas, estoque e aprovações no mesmo fluxo.','/assets/illustrations/aurora-dashboard.svg','/aurora.html',1],
    ['sim','Agendamento em São Paulo','Manutenção de computadores com código e acompanhamento.','/assets/illustrations/manutencao-sp.svg','/aurora.html#visitas',2],
    ['sim','Entrega por estoque','Contas digitais com consulta automática na planilha.','/assets/illustrations/contas-digitais.svg','/aurora.html#contas',3]
  ]);
}

function seedRowsIfEmpty_(sheetName, rows) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (sh.getLastRow() <= 1) {
    rows.forEach(r => sh.appendRow(r));
  }
}

function setValidations_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  applyValidation_(ss.getSheetByName('Contas_Estoque'), 'A2:A', ['disponivel','reservado','entregue','bloqueado']);
  applyValidation_(ss.getSheetByName('Alteracoes'), 'A2:A', ['PENDENTE','APROVAR','RECUSAR']);
  applyValidation_(ss.getSheetByName('Alteracoes'), 'E2:E', ['sim','não']);
  applyValidation_(ss.getSheetByName('Agendamentos_SP'), 'J2:J', ['pendente','confirmado','em_atendimento','finalizado','cancelado']);
  applyValidation_(ss.getSheetByName('Aprovacao_Dono'), 'F2:F', ['pendente','confirmado','recusado']);
}

function applyValidation_(sh, rangeA1, values) {
  if (!sh) return;
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
  sh.getRange(rangeA1).setDataValidation(rule);
}

function getConfig_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuracao');
  const config = {};
  if (!sh || sh.getLastRow() < 2) return config;
  const values = sh.getRange(2,1,sh.getLastRow()-1,2).getValues();
  values.forEach(r => config[String(r[0])] = r[1]);
  return config;
}

function setConfigValue_(key, value) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuracao');
  const last = sh.getLastRow();
  const values = last > 1 ? sh.getRange(2,1,last-1,1).getValues().flat() : [];
  const idx = values.findIndex(v => String(v) === key);
  if (idx >= 0) {
    sh.getRange(idx+2,2).setValue(value);
    sh.getRange(idx+2,6).setValue(new Date());
  }
}

function codigoConfirmado_(codigo) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Codigos_Confirmacao');
  if (!sh || sh.getLastRow() < 2) return false;
  const values = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  return values.some(r => String(r[1]) === codigo && String(r[4]).toLowerCase() === 'confirmado');
}

function findRowsByCode_(sheetName, code) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
  return values.filter(row => row.some(cell => String(cell).includes(code))).map(row => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = row[i]);
    return obj;
  });
}

function normalizeTypeToSheet_(type) {
  const map = {
    acesso:'Acessos', acessos:'Acessos',
    cliente:'Clientes', clientes:'Clientes',
    funcionario:'Funcionarios', funcionarios:'Funcionarios',
    servico:'Servicos', servicos:'Servicos',
    pedido:'Pedidos', pedidos:'Pedidos',
    ticket:'Tickets', tickets:'Tickets',
    pagamento:'Pagamentos', pagamentos:'Pagamentos',
    whatsapp:'WhatsApp',
    log:'Logs', logs:'Logs',
    agendamento_sp:'Agendamentos_SP',
    pedido_sem_estoque:'Pedidos',
    entrega_conta:'Pedidos',
    aprovacao_dono:'Aprovacao_Dono',
    confirmacao_dono:'Codigos_Confirmacao',
    relatorio_codigo:'Relatorio_Codigo',
    chat_ia:'Chat_IA',
    chat_guiado:'Chat_Guiado'
  };
  return map[String(type).toLowerCase()] || 'Logs';
}

function appendCallback_(origem, evento, status, payload, retorno) {
  appendRow_('Callback', [new Date(), origem, evento, status, JSON.stringify(payload || {}), JSON.stringify(retorno || {})]);
}

function appendLog_(nivel, origem, mensagem, payload) {
  appendRow_('Logs', [new Date(), nivel, origem, mensagem, JSON.stringify(payload || {})]);
}

function appendRow_(sheetName, row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = getOrCreateSheet_(ss, sheetName);
  if (sh.getLastRow() === 0 && SHEET_DEFS[sheetName]) ensureHeader_(sh, SHEET_DEFS[sheetName]);
  sh.appendRow(row);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureHeader_(sh, headers) {
  const current = sh.getLastRow() >= 1 ? sh.getRange(1,1,1,Math.max(sh.getLastColumn(), headers.length)).getValues()[0] : [];
  const empty = current.every(v => v === '');
  if (sh.getLastRow() === 0 || empty || String(current[0]) !== String(headers[0])) {
    sh.clear();
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function styleSheet_(sh) {
  const cols = Math.max(1, sh.getLastColumn());
  const header = sh.getRange(1,1,1,cols);
  header.setBackground('#060914').setFontColor('#e0f2fe').setFontWeight('bold');
  sh.autoResizeColumns(1, cols);
  for (let c=1;c<=cols;c++) {
    if (sh.getColumnWidth(c) > 260) sh.setColumnWidth(c, 260);
    if (sh.getColumnWidth(c) < 110) sh.setColumnWidth(c, 110);
  }
}

function parseBody_(e) {
  if (!e || !e.postData) return {};
  const raw = e.postData.contents || '{}';
  return safeJson_(raw, {});
}

function safeJson_(value, fallback) {
  try {
    if (typeof value === 'object') return value;
    return JSON.parse(String(value || '{}'));
  } catch (err) {
    return fallback;
  }
}

function gerarCodigo_(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = prefix + '-';
  for (let i=0;i<8;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
