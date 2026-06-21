const J = { "Content-Type": "application/json; charset=utf-8" };
const cors = (env) => ({
  "Access-Control-Allow-Origin": env.FRONTEND_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
});
const json = (data, status=200, env={}) => new Response(JSON.stringify(data), {status, headers:{...J,...cors(env)}});

async function body(req){ try { return await req.json(); } catch { return {}; } }
function need(env,k){ if(!env[k]) throw new Error(`Variável ausente no Worker: ${k}`); return env[k]; }
function money(cents){ return (Number(cents || 0) / 100).toFixed(2); }
function cleanTxid(seed="CLTECH"){
  const base = String(seed).replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "CLTECH";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = base;
  while(out.length < 28) out += chars[Math.floor(Math.random() * chars.length)];
  return out.slice(0, 35);
}

async function verifyUserOptional(request, env){
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if(!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  });
  const u = await r.json().catch(() => null);
  return r.ok && u?.id ? u : null;
}

async function verifyUser(request, env){
  const u = await verifyUserOptional(request, env);
  if(!u) throw new Error("Login obrigatório.");
  return u;
}

async function db(env,path,opt={}){
  const key = env.SUPABASE_SECRET_KEY;
  if(!key) throw new Error("SUPABASE_SECRET_KEY não configurada.");
  const r = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...opt,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opt.headers || {})
    }
  });
  const t = await r.text();
  let d = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if(!r.ok) throw new Error(d?.message || d?.error || t || "Erro Supabase");
  return d;
}

async function appendSheet(env,type,data){
  if(!env.SHEETS_WEBHOOK_URL || !env.SHEETS_TOKEN) return {skipped:true};
  const r = await fetch(env.SHEETS_WEBHOOK_URL, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token:env.SHEETS_TOKEN,type,data})
  });
  return await r.json().catch(() => ({ok:r.ok}));
}

async function sendViaBaileys(env,to,message){
  if(!env.BAILEYS_BRIDGE_URL || !env.BAILEYS_BRIDGE_SECRET) return {skipped:true,reason:"baileys_not_configured"};
  const r = await fetch(`${env.BAILEYS_BRIDGE_URL.replace(/\/$/,"")}/send`, {
    method:"POST",
    headers:{"Content-Type":"application/json","x-bot-secret":env.BAILEYS_BRIDGE_SECRET},
    body:JSON.stringify({to,message})
  });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(d.error || "Falha Baileys");
  return d;
}

async function sendWA(env,to,message){
  return sendViaBaileys(env, to || env.OWNER_WHATSAPP, message);
}

function efiBase(env){
  return (env.EFI_ENV || "production") === "sandbox"
    ? "https://pix-h.api.efipay.com.br"
    : "https://pix.api.efipay.com.br";
}

async function efiFetch(env, path, init={}){
  if(!env.EFI_CERT || typeof env.EFI_CERT.fetch !== "function"){
    throw new Error("EFI_CERT mTLS não configurado no Cloudflare Worker.");
  }
  return env.EFI_CERT.fetch(`${efiBase(env)}${path}`, init);
}

async function efiToken(env){
  const basic = btoa(`${need(env,"EFI_CLIENT_ID")}:${need(env,"EFI_CLIENT_SECRET")}`);
  const r = await efiFetch(env, "/oauth/token", {
    method:"POST",
    headers:{
      Authorization:`Basic ${basic}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({grant_type:"client_credentials"})
  });
  const d = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(d.error_description || d.error || "Falha no OAuth da Efí.");
  return d.access_token;
}

async function efiCheckout(request, env){
  const b = await body(request);
  const user = await verifyUserOptional(request, env);

  const amountCents = Number(b.amount_cents || 0);
  if(!amountCents || amountCents < 100) return json({ok:false,error:"Valor inválido para Pix Efí."},400,env);

  const serviceTitle = String(b.service_title || "Serviço CLTECH Studio").slice(0, 80);
  const orderId = String(b.order_id || "");
  const serviceSlug = String(b.service_slug || "cltech");
  const txid = cleanTxid(orderId || serviceSlug);

  const token = await efiToken(env);

  const cobBody = {
    calendario: { expiracao: Number(env.EFI_PIX_EXPIRATION || 3600) },
    valor: { original: money(amountCents) },
    chave: need(env,"EFI_PIX_KEY"),
    solicitacaoPagador: serviceTitle.slice(0, 140),
    infoAdicionais: [
      { nome: "Servico", valor: serviceTitle.slice(0, 72) },
      { nome: "Origem", valor: "CLTECH Studio" }
    ]
  };

  if(orderId){
    cobBody.infoAdicionais.push({ nome:"Pedido", valor: orderId.slice(0,72) });
  }

  const cobR = await efiFetch(env, `/v2/cob/${txid}`, {
    method:"PUT",
    headers:{
      Authorization:`Bearer ${token}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(cobBody)
  });

  const cob = await cobR.json().catch(() => ({}));
  if(!cobR.ok) throw new Error(cob.mensagem || cob.message || cob.error || "Erro criando cobrança Pix Efí.");

  let qr = {};
  if(cob?.loc?.id){
    const qrR = await efiFetch(env, `/v2/loc/${cob.loc.id}/qrcode`, {
      headers:{ Authorization:`Bearer ${token}` }
    });
    qr = await qrR.json().catch(() => ({}));
    if(!qrR.ok) throw new Error(qr.mensagem || qr.message || qr.error || "Erro gerando QR Code Efí.");
  }

  if(env.SUPABASE_SECRET_KEY && user?.id && orderId){
    try {
      await db(env, "/rest/v1/payments", {
        method:"POST",
        body:JSON.stringify({
          order_id: orderId,
          user_id: user.id,
          provider:"efi_pix",
          txid,
          amount_cents: amountCents,
          status:"pending",
          pix_copy_paste: qr.qrcode || "",
          qrcode_image: qr.imagemQrcode || "",
          raw_response: { cob, qr }
        })
      });
    } catch(e) {
      // não bloqueia o checkout se o pagamento já existir
    }
  }

  await appendSheet(env, "pagamento", {
    order_id: orderId,
    service: serviceTitle,
    txid,
    amount_cents: amountCents,
    status:"pending",
    provider:"efi_pix"
  });

  await sendWA(env, env.OWNER_WHATSAPP, `CLTECH: Pix Efí gerado\nServiço: ${serviceTitle}\nValor: R$ ${money(amountCents)}\nTXID: ${txid}`).catch(() => null);

  return json({
    ok:true,
    provider:"efi_pix",
    txid,
    amount_cents: amountCents,
    pix_copy_paste: qr.qrcode || "",
    qrcode_image: qr.imagemQrcode || "",
    expires_in: Number(env.EFI_PIX_EXPIRATION || 3600)
  },200,env);
}

async function orderNotify(request,env){
  await verifyUser(request,env);
  const b = await body(request);
  const rows = await db(env, `/rest/v1/orders?id=eq.${encodeURIComponent(b.order_id)}&select=*,profiles(email,full_name,phone)`);
  const o = rows[0];
  if(!o) return json({error:"Pedido não encontrado"},404,env);
  await appendSheet(env,"pedido",{id:o.id,client:o.profiles?.full_name||o.profiles?.email,title:o.title,amount_cents:o.amount_cents,status:o.status,payment_status:o.payment_status,details:o.details});
  const text = `CLTECH: novo pedido\nCliente: ${o.profiles?.full_name||o.profiles?.email}\nServiço: ${o.title}\nValor: R$ ${(o.amount_cents/100).toFixed(2)}`;
  const wa = await sendWA(env,env.OWNER_WHATSAPP,text);
  return json({ok:true,whatsapp:wa},200,env);
}

async function ticketNotify(request,env){
  await verifyUser(request,env);
  const b = await body(request);
  const rows = await db(env, `/rest/v1/tickets?id=eq.${encodeURIComponent(b.ticket_id)}&select=*,profiles(email,full_name,phone)`);
  const t = rows[0];
  if(!t) return json({error:"Ticket não encontrado"},404,env);
  await appendSheet(env,"ticket",{id:t.id,client:t.profiles?.full_name||t.profiles?.email,category:t.category,subject:t.subject,status:t.status,message:t.message});
  const text = `CLTECH: novo ticket\nCliente: ${t.profiles?.full_name||t.profiles?.email}\nTipo: ${t.category}\nAssunto: ${t.subject}\nMensagem: ${t.message}`;
  const wa = await sendWA(env,env.OWNER_WHATSAPP,text);
  return json({ok:true,whatsapp:wa},200,env);
}

async function manualWA(request,env){
  await verifyUser(request,env);
  const b = await body(request);
  if(!b.message) return json({error:"Mensagem obrigatória"},400,env);
  const wa = await sendWA(env,b.to,b.message);
  return json({ok:true,whatsapp:wa},200,env);
}

async function sheetAppend(request,env){
  await verifyUser(request,env);
  const b = await body(request);
  const r = await appendSheet(env,b.type||"Logs",b.data||{});
  return json({ok:true,result:r},200,env);
}

async function efiWebhook(request,env){
  const url = new URL(request.url);
  if(env.WEBHOOK_TOKEN && url.searchParams.get("token") !== env.WEBHOOK_TOKEN){
    return json({error:"Webhook recusado"},401,env);
  }

  const b = await body(request);
  const pix = Array.isArray(b.pix) ? b.pix : [];

  for(const p of pix){
    if(!p.txid) continue;

    if(env.SUPABASE_SECRET_KEY){
      try {
        await db(env, `/rest/v1/payments?txid=eq.${encodeURIComponent(p.txid)}`, {
          method:"PATCH",
          body:JSON.stringify({status:"paid", paid_at:p.horario || new Date().toISOString(), raw_response:b})
        });

        const pays = await db(env, `/rest/v1/payments?txid=eq.${encodeURIComponent(p.txid)}&select=order_id`);
        const orderId = pays?.[0]?.order_id;
        if(orderId){
          await db(env, `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
            method:"PATCH",
            body:JSON.stringify({payment_status:"paid", status:"in_progress"})
          });
        }
      } catch(e) {}
    }

    await appendSheet(env, "pagamento", {txid:p.txid,status:"paid",provider:"efi_pix"});
    await sendWA(env, env.OWNER_WHATSAPP, `CLTECH: pagamento Pix Efí confirmado\nTXID: ${p.txid}`).catch(() => null);
  }

  return json({ok:true},200,env);
}


// ===== AURORA TRANSFER MANAGER =====
async function auroraDb(env, table, payload){
  if(!env.SUPABASE_SECRET_KEY) return {skipped:true};
  return db(env, `/rest/v1/${table}`, {method:"POST", body:JSON.stringify(payload)});
}
async function auroraTrack(request, env){
  const b=await body(request); const u=await userOptional(request, env);
  const row={event:b.event||"page_view", path:b.path||"", title:b.title||"", user_id:u?.id||null, data:b.data||{}, ip:request.headers.get("cf-connecting-ip")||"", user_agent:request.headers.get("user-agent")||""};
  await auroraDb(env,"aurora_events",row).catch(()=>null);
  await appendSheet(env,"acesso",row).catch(()=>null);
  return json({ok:true},200,env);
}
async function auroraSummary(request, env){
  let visits=0, orders=0, paid=0, tickets=0;
  try{
    const ev=await db(env,"/rest/v1/aurora_events?select=id"); visits=ev.length;
    const od=await db(env,"/rest/v1/orders?select=id"); orders=od.length;
    const py=await db(env,"/rest/v1/payments?status=eq.paid&select=id"); paid=py.length;
    const tk=await db(env,"/rest/v1/tickets?select=id"); tickets=tk.length;
  }catch(e){}
  return json({ok:true,visits,orders,paid,tickets,series:[visits,orders,paid,tickets,Math.max(1,visits+orders),Math.max(1,paid+tickets)]},200,env);
}
async function auroraAccountPurchase(request, env){
  const b=await body(request);
  const code=b.order_code||("PED-"+crypto.randomUUID().slice(0,8).toUpperCase());
  const payload={code,type:"account_purchase",title:b.product_title||b.product_slug,status:"checking_stock",payload:b};
  await auroraDb(env,"aurora_order_codes",payload).catch(()=>null);
  let sheetResult=null;
  if(env.SHEETS_WEBHOOK_URL&&env.SHEETS_TOKEN){
    const r=await fetch(env.SHEETS_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:env.SHEETS_TOKEN,type:"claim_account",data:b})});
    sheetResult=await r.json().catch(()=>null);
  }
  if(sheetResult?.account){
    await auroraDb(env,"aurora_account_deliveries",{order_code:code,product_slug:b.product_slug,account_ref:sheetResult.account.ref||"",delivery_status:"delivered",payload:sheetResult.account}).catch(()=>null);
    await appendSheet(env,"entrega_conta",{order_code:code,product_slug:b.product_slug,status:"delivered"}).catch(()=>null);
    return json({ok:true,order_code:code,account:sheetResult.account},200,env);
  }
  await sendWA(env,env.OWNER_WHATSAPP,`CLTECH Aurora: estoque indisponível\nPedido: ${code}\nProduto: ${b.product_title||b.product_slug}`).catch(()=>null);
  await appendSheet(env,"pedido_sem_estoque",{order_code:code,product_slug:b.product_slug,product_title:b.product_title}).catch(()=>null);
  return json({ok:true,order_code:code,no_stock:true,whatsapp:true},200,env);
}
async function auroraSchedule(request, env){
  const b=await body(request);
  await auroraDb(env,"aurora_maintenance_visits",{code:b.code,name:b.name,phone:b.phone,city:"São Paulo",district:b.district,address:b.address,visit_date:b.date,period:b.period,problem:b.problem,status:"pending"}).catch(()=>null);
  await appendSheet(env,"agendamento_sp",b).catch(()=>null);
  await sendWA(env,env.OWNER_WHATSAPP,`CLTECH Aurora: nova visita em São Paulo\nCódigo: ${b.code}\nCliente: ${b.name}\nBairro: ${b.district}\nProblema: ${b.problem}`).catch(()=>null);
  return json({ok:true,code:b.code},200,env);
}
async function auroraSupport(request, env){
  const b=await body(request);
  await auroraDb(env,"aurora_support_messages",{order_code:b.order_code,group_name:b.group,answer:b.answer,message:b.message||"",source:b.message?"ai":"guided"}).catch(()=>null);
  await appendSheet(env,"chat_guiado",b).catch(()=>null);
  return json({ok:true},200,env);
}
async function auroraAi(request, env){
  const b=await body(request); const msg=String(b.message||"").toLowerCase();
  let reply="A Aurora registrou sua solicitação. Para acelerar, informe o serviço desejado, urgência, telefone e se já existe código de pedido.";
  if(msg.includes("pix")||msg.includes("pagamento")) reply="Para pagamento, escolha o serviço e clique em Contratar e pagar. A cobrança Pix Efí será gerada com QR Code e copia e cola.";
  if(msg.includes("visita")||msg.includes("manutenção")||msg.includes("computador")) reply="Para manutenção em São Paulo, informe bairro, endereço, melhor período e o problema do computador ou notebook.";
  if(msg.includes("conta")||msg.includes("estoque")) reply="Para compra de conta, a Aurora consulta o estoque na planilha. Se não houver conta disponível, o pedido é enviado ao WhatsApp do admin com código.";
  await auroraDb(env,"aurora_support_messages",{message:b.message,source:"ai",answer:reply}).catch(()=>null);
  await appendSheet(env,"chat_ia",{message:b.message,reply}).catch(()=>null);
  return json({ok:true,reply},200,env);
}
async function auroraApprovalRequest(request, env){
  const b=await body(request); const code=b.code||("DONO-"+crypto.randomUUID().slice(0,8).toUpperCase());
  await auroraDb(env,"aurora_admin_approvals",{code,area:b.area,change:b.change,admin_name:b.admin_name,status:"pending"}).catch(()=>null);
  await appendSheet(env,"aprovacao_dono",{...b,code,status:"pending"}).catch(()=>null);
  await sendWA(env,env.OWNER_WHATSAPP,`CLTECH Aurora: confirmação necessária\nCódigo: ${code}\nÁrea: ${b.area}\nAdmin: ${b.admin_name}\nAlteração: ${b.change}`).catch(()=>null);
  return json({ok:true,code},200,env);
}
async function auroraApprovalConfirm(request, env){
  const b=await body(request);
  await db(env,`/rest/v1/aurora_admin_approvals?code=eq.${encodeURIComponent(b.code)}`,{method:"PATCH",body:JSON.stringify({status:"confirmed",owner_note:b.owner_note||"",confirmed_at:new Date().toISOString()})}).catch(()=>null);
  await appendSheet(env,"confirmacao_dono",{code:b.code,owner_note:b.owner_note,status:"confirmed"}).catch(()=>null);
  return json({ok:true,message:"Código confirmado. Alteração liberada para execução administrativa."},200,env);
}
async function auroraReportByCode(request, env){
  const b=await body(request); const code=String(b.code||"");
  let report={code,items:[]};
  try{
    report.order_codes=await db(env,`/rest/v1/aurora_order_codes?code=eq.${encodeURIComponent(code)}&select=*`);
    report.visits=await db(env,`/rest/v1/aurora_maintenance_visits?code=eq.${encodeURIComponent(code)}&select=*`);
    report.approvals=await db(env,`/rest/v1/aurora_admin_approvals?code=eq.${encodeURIComponent(code)}&select=*`);
    report.support=await db(env,`/rest/v1/aurora_support_messages?order_code=eq.${encodeURIComponent(code)}&select=*`);
  }catch(e){ report.error=e.message; }
  await appendSheet(env,"relatorio_codigo",{code,report}).catch(()=>null);
  return json({ok:true,report},200,env);
}


// ===== AURORA MOBILE + SHEETS CALLBACK EXTRA =====
async function auroraSheetsChangeCallback(request, env){
  const b=await body(request);
  await appendSheet(env,"callback",{source:"sheets_change_callback",data:b}).catch(()=>null);
  return json({ok:true,message:"Callback de alteração recebido pela Aurora."},200,env);
}
async function auroraConfigPull(request, env){
  if(!env.SHEETS_WEBHOOK_URL || !env.SHEETS_TOKEN) return json({ok:false,error:"Sheets não configurado"},400,env);
  const url = env.SHEETS_WEBHOOK_URL + "?action=config";
  const r = await fetch(url);
  const data = await r.json().catch(()=>({}));
  return json({ok:true,config:data.config||data},200,env);
}
async function auroraEfiStatus(request, env){
  return json({
    ok:true,
    mode:"worker_mtls",
    client_id:!!env.EFI_CLIENT_ID,
    client_secret:!!env.EFI_CLIENT_SECRET,
    pix_key:!!env.EFI_PIX_KEY,
    cert_binding:!!env.EFI_CERT,
    note:"A Efí usa credenciais da aplicação e certificado mTLS. Se o painel chamar de chave API, use como EFI_CLIENT_ID/EFI_CLIENT_SECRET no Worker."
  },200,env);
}

export default {
  async fetch(request,env){
    if(request.method === "OPTIONS") return new Response(null,{headers:cors(env)});
    const url = new URL(request.url);

    try {
      if(url.pathname === "/health"){
        return json({
          ok:true,
          service:"cltech-api",
          efi_ready: !!(env.EFI_CLIENT_ID && env.EFI_CLIENT_SECRET && env.EFI_PIX_KEY && env.EFI_CERT),
          sheets: !!env.SHEETS_WEBHOOK_URL,
          baileys: !!env.BAILEYS_BRIDGE_URL
        },200,env);
      }

      if(url.pathname === "/api/efi/checkout" && request.method === "POST") return efiCheckout(request,env);
      if(url.pathname === "/api/efi/webhook" && request.method === "POST") return efiWebhook(request,env);
      if(url.pathname === "/api/order/notify" && request.method === "POST") return orderNotify(request,env);
      if(url.pathname === "/api/ticket/notify" && request.method === "POST") return ticketNotify(request,env);
      if(url.pathname === "/api/whatsapp/send" && request.method === "POST") return manualWA(request,env);
      if(url.pathname === "/api/sheets/append" && request.method === "POST") return sheetAppend(request,env);

      if(url.pathname==="/api/aurora/analytics/track"&&request.method==="POST")return auroraTrack(request,env);
      if(url.pathname==="/api/aurora/analytics/summary")return auroraSummary(request,env);
      if(url.pathname==="/api/aurora/accounts/purchase"&&request.method==="POST")return auroraAccountPurchase(request,env);
      if(url.pathname==="/api/aurora/maintenance/schedule"&&request.method==="POST")return auroraSchedule(request,env);
      if(url.pathname==="/api/aurora/support/message"&&request.method==="POST")return auroraSupport(request,env);
      if(url.pathname==="/api/aurora/ai/chat"&&request.method==="POST")return auroraAi(request,env);
      if(url.pathname==="/api/aurora/approval/request"&&request.method==="POST")return auroraApprovalRequest(request,env);
      if(url.pathname==="/api/aurora/approval/confirm"&&request.method==="POST")return auroraApprovalConfirm(request,env);
      if(url.pathname==="/api/aurora/report/by-code"&&request.method==="POST")return auroraReportByCode(request,env);
      if(url.pathname==="/api/aurora/sheets/change-callback"&&request.method==="POST")return auroraSheetsChangeCallback(request,env);
      if(url.pathname==="/api/aurora/config/pull")return auroraConfigPull(request,env);
      if(url.pathname==="/api/aurora/efi/status")return auroraEfiStatus(request,env);
      return json({error:"Rota não encontrada"},404,env);
    } catch(e) {
      return json({ok:false,error:e.message || "Erro interno"},500,env);
    }
  }
};
