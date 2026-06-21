
const Aurora = (() => {
  const cfg = window.CLTECH_CONFIG || {};
  const services = window.CLTECH_SERVICES || [];

  const accountProducts = [
    {slug:"blox-fruits-level-max", title:"Conta Blox Fruits Level Max", price_cents:2990, section:"Contas Blox Fruits", detail:"Conta com nível avançado, preparada para entrega controlada."},
    {slug:"blox-fruits-raca-v4", title:"Conta com Raça V4", price_cents:4990, section:"Contas Blox Fruits", detail:"Conta com foco em evolução e raça V4."},
    {slug:"blox-fruits-godhuman-cdk", title:"Conta Godhuman + CDK", price_cents:6990, section:"Contas Blox Fruits", detail:"Conta com build premium para progressão rápida."},
    {slug:"blox-fruits-fruta-mitica", title:"Conta com Fruta Mítica", price_cents:8990, section:"Contas Blox Fruits", detail:"Conta com fruta mítica selecionada conforme estoque."},
    {slug:"conta-premium-personalizada", title:"Conta Premium Personalizada", price_cents:12990, section:"Contas Premium", detail:"Entrega conforme disponibilidade e aprovação do estoque."}
  ];

  const problems = {
    "Computador lento": ["Demora para ligar", "Travando ao abrir programas", "Disco em 100%", "Precisa de limpeza e otimização"],
    "Notebook não liga": ["Não acende nenhum LED", "Liga e desliga", "Tela preta", "Carregador com defeito"],
    "Formatação": ["Instalar Windows", "Instalar Linux", "Backup antes de formatar", "Instalar programas"],
    "Internet e rede": ["Wi-Fi caindo", "Cabo de rede", "Roteador", "Configuração de impressora"],
    "Site e sistema": ["Erro visual", "Banco de dados", "Pix Efí", "Painel admin"],
    "Compra de conta": ["Código de pedido", "Estoque indisponível", "Não recebi dados", "Troca de credenciais"]
  };

  function worker(){ return (localStorage.getItem("cltech_worker_url") || cfg.WORKER_API_URL || "").replace(/\/$/,""); }
  function token(){ try{return JSON.parse(localStorage.getItem("cltech_session")||"null")?.access_token||""}catch{return ""} }
  function code(prefix="CL"){ const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let out=prefix+"-"; for(let i=0;i<8;i++) out+=chars[Math.floor(Math.random()*chars.length)]; return out; }
  function brl(cents){ return (Number(cents||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }

  async function api(path, data){
    const base = worker();
    if(!base) throw new Error("URL do Worker não configurada no Admin > Integrações.");
    const r = await fetch(base + path, {method:"POST",headers:{"Content-Type":"application/json",Authorization: token()?`Bearer ${token()}`:""},body:JSON.stringify(data||{})});
    const j = await r.json().catch(()=>({}));
    if(!r.ok || j.ok===false) throw new Error(j.error || "Falha na Aurora.");
    return j;
  }

  async function track(event="page_view", data={}){
    try{ await api("/api/aurora/analytics/track",{event, path:location.pathname, title:document.title, data}); }catch(e){}
  }

  function initCarousel(sel){
    const root=document.querySelector(sel); if(!root) return;
    let i=0; const track=root.querySelector(".carousel-track"); const slides=[...root.querySelectorAll(".carousel-slide")];
    const go=n=>{ i=(n+slides.length)%slides.length; track.style.transform=`translateX(${-i*100}%)`; };
    root.querySelector("[data-next]")?.addEventListener("click",()=>go(i+1));
    root.querySelector("[data-prev]")?.addEventListener("click",()=>go(i-1));
    setInterval(()=>go(i+1), 6500);
  }

  function renderAccounts(){
    const el=document.querySelector("#accountProducts"); if(!el) return;
    el.innerHTML = accountProducts.map(p=>`
      <article class="product-card">
        <div class="product-art"><img src="/assets/icons/account.svg" style="width:54px;height:54px"></div>
        <div class="product-body">
          <span class="badge">${p.section}</span>
          <h3>${p.title}</h3>
          <p class="product-desc">${p.detail}</p>
          <div class="product-price"><b>${brl(p.price_cents)}</b><small class="muted">estoque via planilha</small></div>
          <button class="btn btn-pix btn-shine" onclick="Aurora.buyAccount('${p.slug}')">Comprar conta</button>
        </div>
      </article>`).join("");
  }

  async function buyAccount(slug){
    const product = accountProducts.find(p=>p.slug===slug);
    const order_code = code("PED");
    localStorage.setItem("aurora_last_order_code", order_code);
    try{
      const res = await api("/api/aurora/accounts/purchase",{product_slug:slug, product_title:product.title, amount_cents:product.price_cents, order_code});
      if(res.account){
        alert(`Pedido ${order_code} aprovado. Dados entregues na área do cliente e registrados na planilha.`);
      }else{
        location.href = `https://wa.me/${cfg.OWNER_WHATSAPP||"5511951289502"}?text=${encodeURIComponent("Pedido sem estoque: "+order_code+" - "+product.title)}`;
      }
    }catch(err){
      location.href = `https://wa.me/${cfg.OWNER_WHATSAPP||"5511951289502"}?text=${encodeURIComponent("Preciso finalizar o pedido "+order_code+" - "+product.title+". Erro: "+err.message)}`;
    }
  }

  function renderProblems(){
    const el=document.querySelector("#problemGrid"); if(!el) return;
    el.innerHTML = Object.entries(problems).map(([group,items])=>`
      <div class="problem-option" onclick="Aurora.selectProblem('${group.replace(/'/g,"")}')">
        <strong>${group}</strong>
        <p class="muted">${items.join(" • ")}</p>
      </div>`).join("");
  }

  function selectProblem(group){
    const items = problems[group] || [];
    const box=document.querySelector("#guidedAnswers");
    if(!box) return;
    box.innerHTML = `<h3>${group}</h3>` + items.map(item=>`<button class="btn btn-outline" onclick="Aurora.sendGuided('${group.replace(/'/g,"")}','${item.replace(/'/g,"")}')">${item}</button>`).join(" ");
  }

  async function sendGuided(group, answer){
    const order_code = localStorage.getItem("aurora_last_order_code") || code("SUP");
    await api("/api/aurora/support/message",{order_code, group, answer});
    addChat("user", `${group}: ${answer}`);
    addChat("bot", `Atendimento registrado com código ${order_code}. O admin verá o relatório completo no painel Aurora.`);
  }

  function addChat(type, text){
    const box=document.querySelector("#chatBox"); if(!box) return;
    const div=document.createElement("div"); div.className=`chat-msg ${type==="user"?"user":""}`; div.textContent=text; box.appendChild(div); box.scrollTop=box.scrollHeight;
  }

  async function aiSend(){
    const input=document.querySelector("#aiInput"); if(!input || !input.value.trim()) return;
    const text=input.value.trim(); input.value=""; addChat("user", text);
    try{ const r=await api("/api/aurora/ai/chat",{message:text, context:"site"}); addChat("bot", r.reply || "Solicitação registrada."); }
    catch(e){ addChat("bot", "A Aurora registrou sua solicitação e encaminhou para análise administrativa."); }
  }

  async function scheduleVisit(e){
    e.preventDefault();
    const f=new FormData(e.target);
    const data=Object.fromEntries(f.entries());
    data.city="São Paulo"; data.code=code("VIS");
    await api("/api/aurora/maintenance/schedule", data);
    document.querySelector("#visitMsg").textContent = "Visita registrada com código " + data.code + ". O admin acompanha pelo painel.";
    e.target.reset();
  }

  async function ownerApprovalRequest(e){
    e.preventDefault();
    const f=new FormData(e.target);
    const data=Object.fromEntries(f.entries());
    data.code=code("DONO");
    await api("/api/aurora/approval/request", data);
    document.querySelector("#approvalMsg").innerHTML = `Código enviado para confirmação do dono: <span class="admin-code">${data.code}</span>`;
    e.target.reset();
  }

  async function confirmOwnerCode(e){
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.target).entries());
    const r=await api("/api/aurora/approval/confirm", data);
    document.querySelector("#approvalConfirmMsg").textContent = r.message || "Alteração confirmada.";
  }

  async function reportByCode(e){
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.target).entries());
    const r=await api("/api/aurora/report/by-code", data);
    document.querySelector("#codeReport").textContent = JSON.stringify(r.report || r, null, 2);
  }

  return {track, initCarousel, renderAccounts, buyAccount, renderProblems, selectProblem, sendGuided, aiSend, scheduleVisit, ownerApprovalRequest, confirmOwnerCode, reportByCode, brl};
})();

window.addEventListener("DOMContentLoaded",()=>{
  Aurora.track();
  Aurora.initCarousel("#newsCarousel");
  Aurora.renderAccounts();
  Aurora.renderProblems();
});
