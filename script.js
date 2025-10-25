// Ruínas Antigas v2 — seleção por Árvore; 5 fases; mecânicas 1..7.
// --- Ver comentário detalhado no início do arquivo da versão enviada anteriormente. ---

const game = document.getElementById('game');
const ctx = game.getContext('2d');
const W = game.width, H = game.height;

const hudLevel = document.getElementById('hudLevel');
const hudCrystals = document.getElementById('hudCrystals');
const hudTimer = document.getElementById('hudTimer');
const btnRestart = document.getElementById('btnRestart');
const btnToMap = document.getElementById('btnToMap');

const screenMenu = document.getElementById('screenMenu');
const screenMap  = document.getElementById('screenMap');
const screenResult = document.getElementById('screenResult');
const btnPlay = document.getElementById('btnPlay');
const btnResultMap = document.getElementById('btnResultMap');
const btnResultRetry = document.getElementById('btnResultRetry');
const resTitle = document.getElementById('resTitle');
const resInfo = document.getElementById('resInfo');

const mapCanvas = document.getElementById('map');
const mapCtx = mapCanvas.getContext('2d');

const State = { MENU:0, MAP:1, GAME:2, RESULT:3 };
let state = State.MENU;
let currentLevelIndex = -1;
let progress = { unlocked: 1, completed: [] };

let timeLeft = 0, frameId;
const key = {};
window.addEventListener('keydown', (e)=>{
  key[e.code] = true;
  if (e.code === 'Escape') gotoMap();
  if (e.code === 'KeyE') useLever();
  if (e.code === 'KeyR') restartLevel();
});
window.addEventListener('keyup', (e)=> key[e.code] = false);

const GRAV = 0.75, FRICTION = 0.85, MAX_FALL = 16;
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function aabb(a,b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function now(){ return performance.now(); }
function drawRect(x,y,w,h, fill, stroke){ if (fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,w-2,h-2);} }
function formatTime(s){ const m=Math.floor(s/60).toString().padStart(2,'0'); const r=Math.max(0,Math.floor(s%60)).toString().padStart(2,'0'); return `${m}:${r}`; }

const treeNodes=[{id:1,x:100,y:380},{id:2,x:260,y:280},{id:3,x:420,y:190},{id:4,x:600,y:260},{id:5,x:780,y:160}];
const treeEdges=[[1,2],[2,3],[3,4],[4,5]];

function showMenu(){ state=State.MENU; screenMenu.classList.add('show'); }
function hideAll(){ screenMenu.classList.remove('show'); screenMap.classList.remove('show'); screenResult.classList.remove('show'); }
function gotoMap(){ if (state===State.GAME) cancelAnimationFrame(frameId); state=State.MAP; hideAll(); screenMap.classList.add('show'); renderMap(); }
btnPlay.addEventListener('click',()=>{ hideAll(); gotoMap(); });
btnToMap.addEventListener('click', gotoMap);

function renderMap(){
  const w=mapCanvas.width,h=mapCanvas.height;
  mapCtx.clearRect(0,0,w,h);
  const grd=mapCtx.createLinearGradient(0,0,0,h); grd.addColorStop(0,'#2f2a1b'); grd.addColorStop(1,'#0f0e09'); mapCtx.fillStyle=grd; mapCtx.fillRect(0,0,w,h);
  mapCtx.strokeStyle='#a07a3b'; mapCtx.lineWidth=8; mapCtx.lineCap='round'; mapCtx.beginPath();
  for (const [a,b] of treeEdges){const na=treeNodes.find(n=>n.id===a), nb=treeNodes.find(n=>n.id===b); mapCtx.moveTo(na.x,na.y); mapCtx.lineTo(nb.x,nb.y);} mapCtx.stroke();
  for (const n of treeNodes){ const unlocked=n.id<=progress.unlocked; const done=progress.completed.includes(n.id);
    mapCtx.beginPath(); mapCtx.arc(n.x,n.y,16,0,Math.PI*2);
    mapCtx.fillStyle = done? '#00e676' : (unlocked? '#fdd835' : '#666'); mapCtx.fill();
    mapCtx.lineWidth=3; mapCtx.strokeStyle='#2c1e12'; mapCtx.stroke();
    mapCtx.fillStyle='#1b1412'; mapCtx.font='bold 13px system-ui'; mapCtx.textAlign='center'; mapCtx.fillText(String(n.id), n.x, n.y+4);
  }
}
mapCanvas.addEventListener('click',(e)=>{
  const r=mapCanvas.getBoundingClientRect(); const x=(e.clientX-r.left)*(mapCanvas.width/r.width), y=(e.clientY-r.top)*(mapCanvas.height/r.height);
  for (const n of treeNodes){ if (Math.hypot(x-n.x,y-n.y)<=20 && n.id<=progress.unlocked){ startLevel(n.id-1); break; } }
});

const levels=[
{ name:'Fase 1 — O Despertar', timeLimit:90, spawn:{x:60,y:420},
  platforms:[{x:0,y:500,w:960,h:40},{x:120,y:440,w:160,h:16},{x:320,y:390,w:120,h:16},{x:500,y:340,w:120,h:16},{x:680,y:290,w:140,h:16},{x:820,y:430,w:120,h:16}],
  movers:[{x:240,y:470,w:90,h:14, ax:240,ay:470, bx:360,by:410, speed:1.2, t:0}],
  liquids:[{x:420,y:486,w:140,h:14,type:'lava'},{x:620,y:486,w:110,h:14,type:'agua'}],
  crystals:[{x:350,y:360,w:12,h:12},{x:530,y:310,w:12,h:12},{x:710,y:260,w:12,h:12}],
  doors:[{id:'D1',x:900,y:380,w:36,h:70,open:true,requires:['P1']}],
  levers:[], plates:[{id:'P1',x:820,y:426,w:40,h:6,pressed:false,opens:['D1']}],
  boxes:[{x:770,y:410,w:26,h:26,vx:0,vy:0}]},
{ name:'Fase 2 — Câmara da Alavanca', timeLimit:90, spawn:{x:70,y:450},
  platforms:[{x:0,y:500,w:960,h:40},{x:120,y:430,w:150,h:16},{x:300,y:380,w:120,h:16},{x:460,y:340,w:140,h:16},{x:660,y:300,w:140,h:16},{x:830,y:420,w:130,h:16}],
  movers:[{x:360,y:470,w:90,h:14, ax:360,ay:470, bx:520,by:470, speed:1.4, t:0}],
  liquids:[{x:420,y:486,w:120,h:14,type:'acido'}],
  crystals:[{x:330,y:350,w:12,h:12},{x:490,y:310,w:12,h:12},{x:690,y:270,w:12,h:12}],
  doors:[{id:'D2',x:900,y:370,w:36,h:80,open:true,requires:['L1']}],
  levers:[{id:'L1',x:835,y:400,w:18,h:18,active:false,toggles:['D2']}], plates:[], boxes:[]},
{ name:'Fase 3 — Peso do Destino', timeLimit:100, spawn:{x:60,y:450},
  platforms:[{x:0,y:500,w:960,h:40},{x:120,y:440,w:160,h:16},{x:340,y:390,w:120,h:16},{x:520,y:340,w:120,h:16},{x:700,y:290,w:150,h:16},{x:820,y:430,w:120,h:16}],
  movers:[{x:240,y:470,w:90,h:14, ax:240,ay:470, bx:360,by:410, speed:1.0, t:0}, {x:560,y:320,w:90,h:14, ax:520,ay:320, bx:680,by:320, speed:1.2, t:0}],
  liquids:[{x:410,y:486,w:140,h:14,type:'lava'}],
  crystals:[{x:360,y:360,w:12,h:12},{x:540,y:310,w:12,h:12},{x:730,y:260,w:12,h:12}],
  doors:[{id:'D3',x:900,y:380,w:36,h:70,open:true,requires:['P3','L3']}],
  levers:[{id:'L3',x:720,y:270,w:18,h:18,active:false,toggles:['D3']}],
  plates:[{id:'P3',x:820,y:426,w:40,h:6,pressed:false,opens:['D3']}],
  boxes:[{x:770,y:410,w:26,h:26,vx:0,vy:0}]},
{ name:'Fase 4 — Engrenagens Verdes', timeLimit:110, spawn:{x:60,y:450},
  platforms:[{x:0,y:500,w:960,h:40},{x:140,y:420,w:160,h:16},{x:340,y:360,w:140,h:16},{x:540,y:300,w:140,h:16},{x:740,y:240,w:140,h:16},{x:850,y:430,w:90,h:16}],
  movers:[{x:220,y:480,w:90,h:14, ax:220,ay:480, bx:220,by:380, speed:1.2, t:0}, {x:420,y:440,w:90,h:14, ax:420,ay:440, bx:420,by:320, speed:1.0, t:0}],
  liquids:[{x:470,y:486,w:160,h:14,type:'agua'}],
  crystals:[{x:370,y:330,w:12,h:12},{x:570,y:270,w:12,h:12},{x:770,y:210,w:12,h:12}],
  doors:[{id:'D4',x:900,y:360,w:36,h:90,open:true,requires:['L4A','L4B']}],
  levers:[{id:'L4A',x:340,y:342,w:18,h:18,active:false,toggles:['D4']},{id:'L4B',x:540,y:282,w:18,h:18,active:false,toggles:['D4']}], plates:[], boxes:[]},
{ name:'Fase 5 — Câmara Final', timeLimit:120, spawn:{x:60,y:450},
  platforms:[{x:0,y:500,w:960,h:40},{x:130,y:430,w:160,h:16},{x:310,y:390,w:120,h:16},{x:480,y:350,w:120,h:16},{x:650,y:310,w:120,h:16},{x:820,y:270,w:120,h:16}],
  movers:[{x:260,y:470,w:90,h:14, ax:220,ay:470, bx:360,by:410, speed:1.2, t:0},{x:620,y:290,w:90,h:14, ax:580,ay:290, bx:760,by:290, speed:1.4, t:0}],
  liquids:[{x:420,y:486,w:150,h:14,type:'acido'}],
  crystals:[{x:340,y:360,w:12,h:12},{x:520,y:320,w:12,h:12},{x:690,y:280,w:12,h:12},{x:860,y:240,w:12,h:12}],
  doors:[{id:'D5',x:900,y:340,w:36,h:110,open:true,requires:['P5','L5A']}],
  levers:[{id:'L5A',x:820,y:252,w:18,h:18,active:false,toggles:['D5']}],
  plates:[{id:'P5',x:130,y:426,w:40,h:6,pressed:false,opens:['D5']}],
  boxes:[{x:170,y:410,w:26,h:26,vx:0,vy:0},{x:780,y:250,w:26,h:26,vx:0,vy:0}]}
];

let triggers={};
const player={x:0,y:0,w:24,h:32,vx:0,vy:0,onGround:false,crystals:0,alive:true};

function startLevel(idx){
  currentLevelIndex=idx; const L=levels[idx];
  triggers={}; (L.levers||[]).forEach(l=>triggers[l.id]=l.active); (L.plates||[]).forEach(p=>triggers[p.id]=p.pressed); (L.doors||[]).forEach(d=>triggers[d.id]=d.open);
  player.x=L.spawn.x; player.y=L.spawn.y; player.vx=player.vy=0; player.onGround=false; player.crystals=0; player.alive=true;
  timeLeft=L.timeLimit; hudLevel.textContent=L.name; hudCrystals.textContent='♦ 0'; hudTimer.textContent='⏱ '+formatTime(timeLeft);
  hideAll(); state=State.GAME; lastTick=now(); frameId=requestAnimationFrame(loop);
}
function restartLevel(){ if (state!==State.GAME) return; startLevel(currentLevelIndex); }
function completeLevel(){ cancelAnimationFrame(frameId); progress.completed=Array.from(new Set([...progress.completed, currentLevelIndex+1])); if (progress.unlocked<5 && currentLevelIndex+2>progress.unlocked) progress.unlocked=currentLevelIndex+2; resTitle.textContent='Vitória!'; resInfo.textContent=`Cristais: ${player.crystals} | Tempo restante: ${formatTime(timeLeft)}`; state=State.RESULT; screenResult.classList.add('show'); }
function failLevel(reason='Tempo esgotado!'){ cancelAnimationFrame(frameId); resTitle.textContent='Derrota'; resInfo.textContent=reason; state=State.RESULT; screenResult.classList.add('show'); }
btnResultMap.addEventListener('click',()=>{ screenResult.classList.remove('show'); gotoMap(); });
btnResultRetry.addEventListener('click',()=>{ screenResult.classList.remove('show'); restartLevel(); });

function collideRects(a,r){ const dx=(a.x+a.w/2)-(r.x+r.w/2), dy=(a.y+a.h/2)-(r.y+r.h/2); const ox=(a.w/2+r.w/2)-Math.abs(dx), oy=(a.h/2+r.h/2)-Math.abs(dy); if(ox<=0||oy<=0) return null; if (ox<oy){ if(dx>0) a.x+=ox; else a.x-=ox; a.vx=0; return 'x'; } else { if(dy>0) a.y+=oy; else a.y-=oy; a.vy=0; return (dy>0?'bottom':'top'); } }
function useLever(){ if (state!==State.GAME) return; const L=levels[currentLevelIndex]; for(const lever of L.levers){ if(aabb(player,lever)){ lever.active=!lever.active; triggers[lever.id]=lever.active; updateDoors(); } } }

function update(dt){
  const L=levels[currentLevelIndex];
  timeLeft -= dt/1000; if (timeLeft<=0) return failLevel('Tempo esgotado!'); hudTimer.textContent='⏱ '+formatTime(timeLeft);
  const left=key['ArrowLeft']||key['KeyA'], right=key['ArrowRight']||key['KeyD'], jumpKey=key['ArrowUp']||key['Space']||key['KeyW'];
  if(left) player.vx-=0.9; if(right) player.vx+=0.9; player.vx*=FRICTION; player.vx=clamp(player.vx,-4.2,4.2);
  player.vy+=GRAV; player.vy=clamp(player.vy,-999,MAX_FALL);
  if(jumpKey && player.onGround){ player.vy=-12.5; player.onGround=false; }
  for (const m of L.movers){ m.t += m.speed*(dt/16); const u=0.5-0.5*Math.cos((m.t % (Math.PI*2))); m.x=m.ax+(m.bx-m.ax)*u; m.y=m.ay+(m.by-m.ay)*u; }
  player.x += player.vx; for (const r of [...L.platforms, ...L.movers]) collideRects(player,r);
  player.onGround=false; player.y += player.vy; for (const r of [...L.platforms, ...L.movers]){ const side=collideRects(player,r); if(side==='top'){ player.onGround=true; if(L.movers.includes(r)){ player.x += (r.x-(r._px||r.x)); player.y += (r.y-(r._py||r.y)); } } r._px=r.x; r._py=r.y; }
  for (const b of L.boxes){ b.vx*=0.9; b.vy+=GRAV; b.vy=clamp(b.vy,-999,MAX_FALL);
    if (aabb(player,b)){ if(player.vx>0){ player.x=b.x-player.w; b.vx+=0.6; } else if(player.vx<0){ player.x=b.x+b.w; b.vx-=0.6; } }
    b.x += b.vx; for (const r of [...L.platforms,...L.movers]) collideRects(b,r);
    b.y += b.vy; for (const r of [...L.platforms,...L.movers]){ const side=collideRects(b,r); if(side==='top'){ b.vy=0; } }
  }
  for (const p of L.plates){ const prev=p.pressed; p.pressed=false; if (aabb(player,{x:p.x,y:p.y-2,w:p.w,h:p.h+6})) p.pressed=true; for(const b of L.boxes){ if(aabb(b,{x:p.x,y:p.y-2,w:p.w,h:p.h+6})) p.pressed=true; } if(prev!==p.pressed){ triggers[p.id]=p.pressed; updateDoors(); } }
  for (const liq of L.liquids){ if (aabb(player, liq)) return failLevel('Você caiu em '+liq.type+'!'); }
  for (const c of L.crystals){ if(!c.got && aabb(player,c)){ c.got=true; player.crystals++; hudCrystals.textContent='♦ '+player.crystals; } }
  for (const d of L.doors){ if(d.open && aabb(player,d)) return completeLevel(); }
}
function updateDoors(){ const L=levels[currentLevelIndex]; for (const d of L.doors){ let ok=true; for(const req of d.requires){ if(!triggers[req]){ ok=false; break; } } d.open=ok; } }
function draw(){
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#2b221b'); g.addColorStop(1,'#100d0c'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const L=levels[currentLevelIndex];
  for (const p of L.platforms){ drawRect(p.x,p.y,p.w,p.h,'#4c3a2c','#1f150f'); }
  for (const m of L.movers){ drawRect(m.x,m.y,m.w,m.h,'#6a4e39','#241a13'); }
  for (const liq of L.liquids){ const color=liq.type==='lava'?'#e65100':(liq.type==='agua'?'#039be5':'#76ff03'); drawRect(liq.x,liq.y,liq.w,liq.h,color,'#1a120c'); }
  for (const p of L.plates){ drawRect(p.x,p.y,p.w,p.h, p.pressed?'#d4af37':'#8d6e63', '#1f150f'); }
  for (const l of L.levers){ drawRect(l.x,l.y,l.w,l.h, l.active?'#ffd54f':'#6d4c41', '#1f150f'); }
  for (const d of L.doors){ drawRect(d.x,d.y,d.w,d.h, d.open?'#00c853':'#7e4a2f', '#140f0c'); }
  ctx.fillStyle='#b3e5fc'; ctx.strokeStyle='#01579b'; ctx.lineWidth=2; for (const c of L.crystals){ if(c.got) continue; ctx.beginPath(); ctx.moveTo(c.x+c.w/2,c.y); ctx.lineTo(c.x+c.w,c.y+c.h/2); ctx.lineTo(c.x+c.w/2,c.y+c.h); ctx.lineTo(c.x,c.y+c.h/2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  for (const b of L.boxes){ drawRect(b.x,b.y,b.w,b.h,'#8d6e63','#1f150f'); }
  drawRect(player.x,player.y,player.w,player.h,'#cfa67a','#2a1d16');
}
let lastTick=0;
function loop(ts){ const dt=Math.min(50, ts-(lastTick||ts)); lastTick=ts; update(dt); draw(); if(state===State.GAME) frameId=requestAnimationFrame(loop); }
btnRestart.addEventListener('click', restartLevel);
showMenu();
renderMap();
//jogo gpt
