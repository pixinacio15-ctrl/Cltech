/* CLTECH Studio — PixiJS Cyber Background */
(() => {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const mount = document.getElementById('pixi-bg');
  if (!mount || !window.PIXI) return;
  const C = { cyan:0x38bdf8, blue:0x2563eb, purple:0xa855f7, green:0x22c55e };
  let app, g, nodes=[], traces=[], timer;
  const rnd=(a,b)=>Math.random()*(b-a)+a;
  const mk=(w,h,i)=>({x:rnd(0,w),y:rnd(0,h),vx:rnd(-.22,.22),vy:rnd(-.18,.18),r:rnd(1.4,3.8),p:rnd(0,6.28),c:i%3===0?C.cyan:i%3===1?C.purple:C.blue});
  function build(){const w=innerWidth,h=innerHeight;nodes=[];traces=[];const n=Math.min(76,Math.max(34,Math.floor(w*h/27000)));for(let i=0;i<n;i++)nodes.push(mk(w,h,i));for(let i=0;i<24;i++)traces.push({x:rnd(-80,w),y:rnd(0,h),len:rnd(80,260),s:rnd(.25,.9),a:rnd(.05,.16),c:i%2?C.cyan:C.purple});}
  function draw(t){const w=innerWidth,h=innerHeight;g.clear();g.circle(w*.18,h*.22,170+Math.sin(t*.001)*12).fill({color:C.cyan,alpha:.045});g.circle(w*.82,h*.18,210+Math.cos(t*.0012)*16).fill({color:C.purple,alpha:.05});g.circle(w*.72,h*.82,260).fill({color:C.blue,alpha:.035});
    traces.forEach((tr,i)=>{tr.x+=tr.s;if(tr.x>w+120)tr.x=-tr.len-80;const y=tr.y+Math.sin(t*.001+i)*10;g.moveTo(tr.x,y).lineTo(tr.x+tr.len*.55,y).lineTo(tr.x+tr.len,y+(i%2?24:-24));g.stroke({width:1,color:tr.c,alpha:tr.a});g.circle(tr.x+tr.len,y+(i%2?24:-24),2.2).fill({color:tr.c,alpha:tr.a+.06});});
    for(let i=0;i<nodes.length;i++){const a=nodes[i];a.x+=a.vx;a.y+=a.vy;a.p+=.018;if(a.x<-20)a.x=w+20;if(a.x>w+20)a.x=-20;if(a.y<-20)a.y=h+20;if(a.y>h+20)a.y=-20;for(let j=i+1;j<nodes.length;j++){const b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.sqrt(dx*dx+dy*dy);if(d<150){g.moveTo(a.x,a.y).lineTo(b.x,b.y);g.stroke({width:1,color:(i+j)%2?C.cyan:C.purple,alpha:(1-d/150)*.13});}}const rr=Math.max(1,a.r+Math.sin(a.p)*.8);g.circle(a.x,a.y,rr).fill({color:a.c,alpha:.55});g.circle(a.x,a.y,rr+5).fill({color:a.c,alpha:.045});}
    const cx=w*.78,cy=h*.74;for(let i=0;i<5;i++){g.ellipse(cx,cy+i*22+Math.sin(t*.001+i)*2,92,18).stroke({width:1.3,color:i%2?C.cyan:C.purple,alpha:.16});}}
  async function start(){try{app=new PIXI.Application();if(app.init){await app.init({resizeTo:window,backgroundAlpha:0,antialias:true,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2)});}else{app=new PIXI.Application({resizeTo:window,transparent:true,antialias:true,autoDensity:true,resolution:Math.min(devicePixelRatio||1,2)});}mount.appendChild(app.canvas||app.view);g=new PIXI.Graphics();app.stage.addChild(g);build();app.ticker.add(()=>draw(performance.now()));addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(build,160);});}catch(e){console.warn('PixiJS background fallback:',e);}}
  start();
})();
