const PixPay = (() => {
  const cfg = window.CLTECH_CONFIG || {};
  const services = window.CLTECH_SERVICES || [];

  function brl(cents){
    return (Number(cents || 0) / 100).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
  }

  function getParam(name){
    return new URLSearchParams(location.search).get(name);
  }

  function serviceBySlug(slug){
    return services.find(s => s.slug === slug) || services[0];
  }

  function workerUrl(){
    return (localStorage.getItem("cltech_worker_url") || cfg.WORKER_API_URL || "").replace(/\/$/, "");
  }

  function authToken(){
    try {
      return JSON.parse(localStorage.getItem("cltech_auth") || "null")?.access_token || "";
    } catch(e) {
      return "";
    }
  }

  function status(text, type=""){
    const box = document.querySelector("#efiStatus");
    if (!box) return;
    box.textContent = text;
    box.className = `efi-status ${type}`;
  }

  function whatsappMessage(service, orderId, txid){
    const msg = [
      "Olá, CLTECH Studio.",
      "Quero confirmar meu pagamento via Pix Efí:",
      `Serviço: ${service.title}`,
      `Valor: ${brl(service.price_cents)}`,
      orderId ? `Pedido: ${orderId}` : "",
      txid ? `TXID: ${txid}` : "",
      "Segue o comprovante."
    ].filter(Boolean).join("\n");

    return `https://wa.me/${cfg.OWNER_WHATSAPP || "5511951289502"}?text=${encodeURIComponent(msg)}`;
  }

  async function createEfiPix(service, orderId){
    const api = workerUrl();

    if (!api) {
      throw new Error("URL do Worker não configurada. Cole a URL do Worker no Admin > Integrações ou em assets/config.js.");
    }

    const res = await fetch(`${api}/api/efi/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken() ? `Bearer ${authToken()}` : ""
      },
      body: JSON.stringify({
        service_slug: service.slug,
        service_title: service.title,
        amount_cents: Number(service.price_cents || 0),
        order_id: orderId || "",
        customer_note: "Contratação CLTECH Studio"
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Não foi possível gerar o Pix Efí.");
    }

    return data;
  }

  async function renderPaymentPage(){
    const slug = getParam("service") || localStorage.getItem("pending_service_slug") || "combo-cltech-pix-pro";
    const orderId = getParam("order") || "";
    const service = serviceBySlug(slug);
    if (!service) return;

    const serviceName = document.querySelector("#payServiceName");
    const serviceDesc = document.querySelector("#payServiceDesc");
    const servicePrice = document.querySelector("#payServicePrice");
    const pixPayload = document.querySelector("#pixPayload");
    const wa = document.querySelector("#waProofLink");
    const qrBox = document.querySelector("#efiQrBox");
    const txidBox = document.querySelector("#efiTxid");

    if (serviceName) serviceName.textContent = service.title;
    if (serviceDesc) serviceDesc.textContent = service.description;
    if (servicePrice) servicePrice.textContent = brl(service.price_cents);
    if (pixPayload) pixPayload.value = "";

    const registerLink = document.querySelector("#registerOrderLink");
    if (registerLink) registerLink.href = `/login.html?service=${encodeURIComponent(service.slug)}`;

    status("Gerando cobrança Pix na Efí...", "");

    try {
      const pix = await createEfiPix(service, orderId);

      if (pixPayload) pixPayload.value = pix.pix_copy_paste || "";
      if (txidBox) txidBox.textContent = pix.txid ? `TXID: ${pix.txid}` : "";

      if (qrBox) {
        qrBox.innerHTML = pix.qrcode_image
          ? `<div class="qr-wrap"><img alt="QR Code Pix Efí" src="${pix.qrcode_image}"></div>`
          : "";
      }

      if (wa) wa.href = whatsappMessage(service, orderId, pix.txid);

      status("Pix Efí gerado. Copie o código, pague no banco e envie o comprovante.", "ok");
    } catch (err) {
      status(err.message, "bad");
      if (wa) wa.href = whatsappMessage(service, orderId, "");
    }
  }

  async function copyPix(){
    const text = document.querySelector("#pixPayload")?.value || "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const btn = document.querySelector("#copyPixBtn");
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "Pix copiado";
      setTimeout(() => btn.textContent = old, 1600);
    }
  }

  return { brl, renderPaymentPage, copyPix };
})();

window.PixPay = PixPay;
