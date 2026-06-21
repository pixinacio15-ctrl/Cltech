
const SHEETS_TOKEN = 'COLE_UM_TOKEN_FORTE_AQUI';

const SHEETS = [
  'Clientes','Funcionarios','Servicos','Pedidos','Tickets','Pagamentos','WhatsApp','Logs',
  'Acessos','Contas_Estoque','Entregas_Contas','Pedido_Sem_Estoque','Agendamentos_SP',
  'Codigos_Pedido','Codigos_Confirmacao','Aprovacao_Dono','Relatorio_Codigo',
  'Chat_IA','Chat_Guiado','Alteracoes','Callback','Novidades','Carrossel'
];

function setupCltechSheets(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  SHEETS.forEach(name => {
    let sh = ss.getSheetByName(name);
    if(!sh) sh = ss.insertSheet(name);
    if(sh.getLastRow() === 0) {
      if(name === 'Contas_Estoque') sh.appendRow(['status','produto_slug','ref','login','senha','email','observacao','entregue_em','pedido']);
      else if(name === 'Alteracoes') sh.appendRow(['aprovar','area','acao','dados_json','codigo_dono','status','callback']);
      else sh.appendRow(['data','tipo','dados_json']);
    }
  });
  return jsonResponse({ok:true, sheets:SHEETS});
}

function doGet(e){
  if(e.parameter && e.parameter.setup === '1') return setupCltechSheets();
  return jsonResponse({ok:true, service:'CLTECH Aurora Sheets'});
}

function doPost(e){
  try{
    const payload = JSON.parse(e.postData.contents || '{}');
    if(payload.token !== SHEETS_TOKEN) return jsonResponse({ok:false,error:'token inválido'});
    if(payload.type === 'claim_account') return claimAccount(payload.data || {});
    return appendByType(payload.type || 'Logs', payload.data || {});
  }catch(err){
    return jsonResponse({ok:false,error:String(err)});
  }
}

function sheetNameFor(type){
  const map = {
    acesso:'Acessos', entrega_conta:'Entregas_Contas', pedido_sem_estoque:'Pedido_Sem_Estoque',
    agendamento_sp:'Agendamentos_SP', aprovacao_dono:'Aprovacao_Dono', confirmacao_dono:'Codigos_Confirmacao',
    relatorio_codigo:'Relatorio_Codigo', chat_ia:'Chat_IA', chat_guiado:'Chat_Guiado',
    pagamento:'Pagamentos', pedido:'Pedidos', ticket:'Tickets', whatsapp:'WhatsApp'
  };
  return map[String(type).toLowerCase()] || 'Logs';
}

function appendByType(type, data){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = sheetNameFor(type);
  let sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if(sh.getLastRow() === 0) sh.appendRow(['data','tipo','dados_json']);
  sh.appendRow([new Date(), type, JSON.stringify(data)]);
  return jsonResponse({ok:true, sheet:name});
}

function claimAccount(data){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Contas_Estoque') || ss.insertSheet('Contas_Estoque');
  if(sh.getLastRow() < 2) return jsonResponse({ok:true, account:null, no_stock:true});
  const values = sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const status = String(row[0] || '').toLowerCase();
    const slug = String(row[1] || '');
    if(status === 'disponivel' && slug === data.product_slug){
      sh.getRange(i+1,1).setValue('entregue');
      sh.getRange(i+1,8).setValue(new Date());
      sh.getRange(i+1,9).setValue(data.order_code || '');
      const account = {ref:row[2], login:row[3], senha:row[4], email:row[5], observacao:row[6]};
      appendByType('entrega_conta',{order_code:data.order_code, product_slug:data.product_slug, ref:row[2]});
      return jsonResponse({ok:true, account});
    }
  }
  appendByType('pedido_sem_estoque', data);
  return jsonResponse({ok:true, account:null, no_stock:true});
}

function jsonResponse(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
