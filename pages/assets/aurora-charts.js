
const AuroraCharts = (() => {
  async function loadSummary(){
    const base=(localStorage.getItem("cltech_worker_url") || (window.CLTECH_CONFIG||{}).WORKER_API_URL || "").replace(/\/$/,"");
    if(!base) return {visits:0,orders:0,paid:0,tickets:0,series:[12,18,9,24,31,16,28]};
    try{
      const r=await fetch(base+"/api/aurora/analytics/summary",{headers:{Authorization:(CL?.token?.()?`Bearer ${CL.token()}`:"")}});
      return await r.json();
    }catch(e){return {visits:0,orders:0,paid:0,tickets:0,series:[12,18,9,24,31,16,28]};}
  }
  async function render(selector){
    const mount=document.querySelector(selector); if(!mount || !window.PIXI) return;
    const data=await loadSummary();
    const app=new PIXI.Application();
    if(app.init) await app.init({width:mount.clientWidth||700,height:280,backgroundAlpha:0,antialias:true});
    else Object.assign(app, new PIXI.Application({width:mount.clientWidth||700,height:280,transparent:true,antialias:true}));
    mount.innerHTML=""; mount.appendChild(app.canvas||app.view);
    const g=new PIXI.Graphics(); app.stage.addChild(g);
    const series=data.series||[data.visits||0,data.orders||0,data.paid||0,data.tickets||0];
    const max=Math.max(1,...series);
    const W=(app.canvas||app.view).width, H=(app.canvas||app.view).height;
    function draw(t=0){
      g.clear();
      g.roundRect(0,0,W,H,24).fill({color:0x020617,alpha:.45});
      const pad=34, bw=(W-pad*2)/series.length-10;
      series.forEach((v,i)=>{
        const h=(H-pad*2)*(v/max);
        const x=pad+i*(bw+10), y=H-pad-h;
        g.roundRect(x,y,bw,h,10).fill({color:i%2?0xa855f7:0x38bdf8,alpha:.78});
        g.circle(x+bw/2,y-10+Math.sin(t/20+i)*3,3).fill({color:0xe0f2fe,alpha:.95});
      });
      g.moveTo(pad,H-pad).lineTo(W-pad,H-pad).stroke({width:1,color:0xe0f2fe,alpha:.22});
    }
    app.ticker.add((tk)=>draw(tk.lastTime||performance.now()));
  }
  return {render};
})();
window.addEventListener("DOMContentLoaded",()=>AuroraCharts.render("#auroraChart"));
