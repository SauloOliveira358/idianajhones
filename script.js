// Ruínas Antigas v2 — seleção por Árvore; 5 fases; mecânicas 1..7.
// -----------------------------------------------------------------
// Este arquivo implementa:
// - Estados de tela (MENU, MAPA, JOGO, RESULTADO)
// - Mapa com "nós" de uma árvore para selecionar fases (treeNodes/Edges)
// - Motor simples de física (gravidade, atrito, AABB, plataformas móveis)
// - Gatilhos (alavancas e placas de pressão) que abrem portas (triggers)
// - Cristais colecionáveis, líquidos letais e caixa empurrável
// - Loop principal (update/draw) com requestAnimationFrame
// -----------------------------------------------------------------

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

// -------------------------
// Estados de tela do jogo
// -------------------------
const State = { MENU:0, MAP:1, GAME:2, RESULT:3 };
let state = State.MENU;                 // estado atual
let currentLevelIndex = -1;             // índice da fase ativa
let progress = { unlocked: 1, completed: [] }; // progresso (fases liberadas/concluídas)

let timeLeft = 0, frameId;
const key = {};
const imgPlataforma = new Image();
imgPlataforma.src = 'plataforma.png'; 
// -------------------------
// Entrada via teclado
// - Armazena teclas pressionadas
// - ESC para voltar ao mapa
// - E para usar alavanca
// - R para reiniciar fase
// -------------------------
window.addEventListener('keydown', (e)=>{
  key[e.code] = true;
  if (e.code === 'Escape') gotoMap();
  if (e.code === 'KeyE') useLever();
  if (e.code === 'KeyR') restartLevel();
});
window.addEventListener('keyup', (e)=> key[e.code] = false);

// -------------------------
// Física/utilidades
// -------------------------
const GRAV = 0.75, FRICTION = 0.85, MAX_FALL = 16;

/** Limita v ao intervalo [a, b] */
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

/** Teste de colisão AABB simples (retângulos alinhados aos eixos) */
function aabb(a,b){ return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

/** Tempo atual em ms (uso no loop p/ delta time) */
function now(){ return performance.now(); }

/** Desenha um retângulo com fill e/ou stroke opcionais */
function drawRect(x,y,w,h, fill, stroke){
  if (fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,w-2,h-2);}
}

/** Converte segundos em "MM:SS" para o HUD */
function formatTime(s){
  const m=Math.floor(s/60).toString().padStart(2,'0');
  const r=Math.max(0,Math.floor(s%60)).toString().padStart(2,'0');
  return `${m}:${r}`;
}

// -------------------------
// Mapa de fases: nós e ligações (arvore)
// -------------------------
const treeNodes=[{id:1,x:100,y:380},{id:2,x:260,y:280},{id:3,x:420,y:190},{id:4,x:600,y:260},{id:5,x:780,y:160}];
const treeEdges=[[1,2],[2,3],[3,4],[4,5]];

/** Mostra a tela de menu */
function showMenu(){ state=State.MENU; screenMenu.classList.add('show'); }

/** Esconde todas as telas (menu, mapa, resultado) */
function hideAll(){
  screenMenu.classList.remove('show');
  screenMap.classList.remove('show');
  screenResult.classList.remove('show');
}

/** Vai para a tela de mapa; se estava jogando, cancela o frame atual */
function gotoMap(){
  if (state===State.GAME) cancelAnimationFrame(frameId);
  state=State.MAP;
  hideAll();
  screenMap.classList.add('show');
  renderMap(); // redesenha o mapa ao entrar
  // esconder o gif do personagem fora do jogo
  if (draw.playerEl) draw.playerEl.style.display='none';
  // esconder quaisquer GIFs de lava/água quando sai do jogo
  if (draw.lavaEls) draw.lavaEls.forEach(el => el.style.display='none');
  if (draw.aguaEls) draw.aguaEls.forEach(el => el.style.display='none');
  // esconder gifs de cristais
  if (draw.crystalEls) draw.crystalEls.forEach(el => el.style.display='none');
}
btnPlay.addEventListener('click',()=>{ hideAll(); gotoMap(); });
btnToMap.addEventListener('click', gotoMap);

/**
 * renderMap()
 * Desenha o mapa de seleção de fases:
 * - Fundo com gradiente
 * - Ramos (edges) conectando os nós
 * - Nós com cores: cinza (bloqueado), amarelo (liberado), verde (concluído)
 * - Número da fase dentro do nó
 */
function renderMap(){
  const w=mapCanvas.width,h=mapCanvas.height;

  // fundo
  mapCtx.clearRect(0,0,w,h);
  const grd=mapCtx.createLinearGradient(0,0,0,h);
  grd.addColorStop(0,'#2f2a1b'); grd.addColorStop(1,'#0f0e09');
  mapCtx.fillStyle=grd; mapCtx.fillRect(0,0,w,h);

  // ramos
  mapCtx.strokeStyle='#a07a3b'; mapCtx.lineWidth=8; mapCtx.lineCap='round'; mapCtx.beginPath();
  for (const [a,b] of treeEdges){
    const na=treeNodes.find(n=>n.id===a), nb=treeNodes.find(n=>n.id===b);
    mapCtx.moveTo(na.x,na.y); mapCtx.lineTo(nb.x,nb.y);
  }
  mapCtx.stroke();

  // nós
  for (const n of treeNodes){
    const unlocked=n.id<=progress.unlocked;
    const done=progress.completed.includes(n.id);

    mapCtx.beginPath();
    mapCtx.arc(n.x,n.y,16,0,Math.PI*2);
    mapCtx.fillStyle = done? '#00e676' : (unlocked? '#fdd835' : '#666');
    mapCtx.fill();
    mapCtx.lineWidth=3; mapCtx.strokeStyle='#2c1e12'; mapCtx.stroke();

    mapCtx.fillStyle='#1b1412'; mapCtx.font='bold 13px system-ui'; mapCtx.textAlign='center';
    mapCtx.fillText(String(n.id), n.x, n.y+4);
  }
}

// Clique no mapa: se clica num nó liberado, começa a fase correspondente
mapCanvas.addEventListener('click',(e)=>{
  const r=mapCanvas.getBoundingClientRect();
  const x=(e.clientX-r.left)*(mapCanvas.width/r.width),
        y=(e.clientY-r.top)*(mapCanvas.height/r.height);

  for (const n of treeNodes){
    if (Math.hypot(x-n.x,y-n.y)<=20 && n.id<=progress.unlocked){
      startLevel(n.id-1); // fases no array levels começam em 0
      break;
    }
  }
});

// -------------------------
// Definições das fases (level data)
// -------------------------
// Lista de fases do jogo — cada objeto representa um nível completo
const levels = [
  
  // ===== FASE 1 =====
  { 
    name: 'Fase 1 — O Despertar', // Nome da fase (exibido no HUD ou título)
    timeLimit: 90,                // Tempo limite (em segundos)
    spawn: {x:60, y:420},         // Posição inicial do jogador (spawn point)

    // Plataformas fixas — retângulos sólidos onde o jogador pode andar
    platforms: [
      {x:0,y:500,w:960,h:40,img:'chao2.png'},    // Chão principal (ocupa toda a base)
      {x:120,y:440,w:160,h:16, imgPlataforma},  // Plataforma secundária
      {x:320,y:390,w:120,h:16, imgPlataforma},  // ...
      {x:500,y:340,w:120,h:16, imgPlataforma},
      {x:680,y:290,w:140,h:16, imgPlataforma},
      {x:820,y:430,w:120,h:16,imgPlataforma}
    ],

    movers: [], // Plataformas móveis (ainda não há nenhuma nesta fase)

    // Líquidos — podem ser lava, água ou ácido
    // type:'aguaGif' indica que será renderizada como GIF animado
    liquids: [
      {x:420,y:499,w:140,h:20,type:'agua1.png'}, // Lago de água
      {x:620,y:499,w:110,h:20,type:'agua1.png'}  // Outro pequeno lago
    ],

    // Cristais — itens coletáveis (aumentam pontuação ou completam objetivos)
    crystals: [
      {x:355,y:350,w:42,h:42},
      {x:535,y:300,w:42,h:42},
      {x:710,y:250,w:42,h:42}
    ],

    // Portas — podem ser abertas por placas ou alavancas
    doors: [
      {id:'D1',x:900,y:360,w:36,h:70,open:false,requires:['P1'], img:'porta.png'}
    ],

    levers: [], // Alavancas (nenhuma nesta fase)

    // Placas de pressão — abrem portas quando ativadas
    plates: [
      {id:'P1',x:820,y:426,w:40,h:8,pressed:false,opens:['D1']}
    ],

    // Caixas empurráveis (podem ser usadas para acionar placas)
    boxes: [
      {x:737,y:264,w:26,h:26,vx:0,vy:0}
    ]
  },

  // ===== FASE 2 =====
  { 
    name: 'Fase 2 — Câmara da Alavanca',
    timeLimit: 90,
    spawn: {x:70, y:450},

    // Plataformas
    platforms: [
      {x:0,y:500,w:960,h:40},
      {x:120,y:430,w:150,h:16},
      {x:300,y:380,w:120,h:16},
      {x:460,y:340,w:140,h:16},
      {x:660,y:300,w:140,h:16},
      {x:830,y:420,w:130,h:16}
    ],

    movers: [], // Nenhum móvel nesta fase

    // Substitui o ácido por lava animada (lava.gif)
    liquids: [
      {x:420,y:486,w:120,h:14,type:'lavaGif'}, // Poça de lava à esquerda
      {x:840,y:486,w:120,h:14,type:'lavaGif'}  // Poça de lava à direita
    ],

    // Cristais (menores que na Fase 1)
    crystals: [
      {x:330,y:350,w:20,h:20},
      {x:490,y:310,w:20,h:20},
      {x:690,y:270,w:20,h:20}
    ],

    // Porta controlada por uma alavanca
    doors: [
      {id:'D2',x:900,y:360,w:36,h:80,open:false,requires:['L1']}
    ],

    // Alavanca que abre a porta D2
    levers: [
      {id:'L1',x:835,y:400,w:18,h:18,active:false,toggles:['D2']}
    ],

    plates: [], // Nenhuma placa
    boxes: []   // Nenhuma caixa
  },

  // ===== FASE 3 =====
  { 
    name: 'Fase 3 — Peso do Destino',
    timeLimit: 100,
    spawn: {x:60, y:450},

    // Plataformas
    platforms: [
      {x:0,y:500,w:960,h:40},
      {x:120,y:440,w:160,h:16},
      {x:340,y:390,w:120,h:16},
      {x:520,y:340,w:120,h:16},
      {x:700,y:290,w:150,h:16},
      {x:820,y:430,w:120,h:16}
    ],

    movers: [], // Sem móveis

    // Lava estática (não animada)
    liquids: [
      {x:410,y:486,w:140,h:14,type:'lava'}
    ],

    // Cristais
    crystals: [
      {x:360,y:360,w:20,h:20},
      {x:540,y:310,w:20,h:20},
      {x:730,y:260,w:20,h:20}
    ],

    // Porta que precisa de uma alavanca e uma placa
    doors: [
      {id:'D3',x:900,y:360,w:36,h:70,open:false,requires:['P3','L3']}
    ],

    // Alavanca que faz parte do mecanismo da porta
    levers: [
      {id:'L3',x:720,y:270,w:18,h:18,active:false,toggles:['D3']}
    ],

    // Placa de chão que também abre a porta
    plates: [
      {id:'P3',x:820,y:426,w:40,h:6,pressed:false,opens:['D3']}
    ],

    // Uma caixa que pode ser usada para ativar a placa
    boxes: [
      {x:770,y:410,w:26,h:26,vx:0,vy:0}
    ]
  },

  // ===== FASE 4 =====
  { 
    name: 'Fase 4 — Engrenagens Verdes',
    timeLimit: 110,
    spawn: {x:60, y:450},

    platforms: [
      {x:0,y:500,w:960,h:40},
      {x:140,y:420,w:160,h:16},
      {x:340,y:360,w:140,h:16},
      {x:540,y:300,w:140,h:16},
      {x:740,y:240,w:140,h:16},
      {x:850,y:430,w:90,h:16}
    ],

    movers: [], // Nenhum móvel

    // Água estática (sem GIF)
    liquids: [
      {x:470,y:486,w:160,h:14,type:'agua'}
    ],

    crystals: [
      {x:370,y:330,w:20,h:20},
      {x:570,y:270,w:20,h:20},
      {x:770,y:210,w:20,h:20}
    ],

    // Porta controlada por duas alavancas
    doors: [
      {id:'D4',x:900,y:360,w:36,h:90,open:false,requires:['L4A','L4B']}
    ],

    // Duas alavancas que precisam ser ativadas para abrir D4
    levers: [
      {id:'L4A',x:340,y:342,w:18,h:18,active:false,toggles:['D4']},
      {id:'L4B',x:540,y:282,w:18,h:18,active:false,toggles:['D4']}
    ],

    plates: [], // Nenhuma placa
    boxes: []   // Nenhuma caixa
  },

  // ===== FASE 5 =====
  { 
    name: 'Fase 5 — Câmara Final',
    timeLimit: 120,
    spawn: {x:60, y:450},

    platforms: [
      {x:0,y:500,w:960,h:40},
      {x:130,y:430,w:160,h:16},
      {x:310,y:390,w:120,h:16},
      {x:480,y:350,w:120,h:16},
      {x:650,y:310,w:120,h:16},
      {x:820,y:270,w:120,h:16}
    ],

    movers: [], // Nenhum móvel

    // Ácido — pode causar morte instantânea ao tocar
    liquids: [
      {x:420,y:486,w:150,h:14,type:'acido'}
    ],

    crystals: [
      {x:340,y:360,w:20,h:20},
      {x:520,y:320,w:20,h:20},
      {x:690,y:280,w:20,h:20},
      {x:860,y:240,w:20,h:20}
    ],

    // Porta final que requer uma placa e uma alavanca
    doors: [
      {id:'D5',x:900,y:340,w:36,h:110,open:false,requires:['P5','L5A']}
    ],

    // Alavanca que abre a porta D5
    levers: [
      {id:'L5A',x:820,y:252,w:18,h:18,active:false,toggles:['D5']}
    ],

    // Placa de pressão inicial
    plates: [
      {id:'P5',x:130,y:426,w:40,h:6,pressed:false,opens:['D5']}
    ],

    // Duas caixas (uma no início, outra no topo)
    boxes: [
      {x:170,y:410,w:26,h:26,vx:0,vy:0},
      {x:780,y:250,w:26,h:26,vx:0,vy:0}
    ]
  }
];



// Guarda uma cópia imutável de cada fase
const baseLevels = JSON.parse(JSON.stringify(levels));



let triggers={};
const player={x:0,y:0,w:24,h:32,vx:0,vy:0,onGround:false,crystals:0,alive:true};

/**
 * startLevel(idx)
 */
function startLevel(idx) {
  currentLevelIndex = idx;

  // 🧱 Faz uma cópia profunda do nível para resetar tudo
  const original = baseLevels[idx] || levels[idx]; // baseLevels será o modelo original
  const L = JSON.parse(JSON.stringify(original));
  levels[idx] = L; // substitui o nível atual por uma nova cópia limpa

  triggers = {};
  (L.levers || []).forEach(l => triggers[l.id] = l.active);
  (L.plates || []).forEach(p => triggers[p.id] = p.pressed);
  (L.doors || []).forEach(d => triggers[d.id] = d.open);

  player.x = L.spawn.x;
  player.y = L.spawn.y;
  player.vx = player.vy = 0;
  player.onGround = false;
  player.crystals = 0;
  player.alive = true;

  timeLeft = L.timeLimit;
  hudLevel.textContent = L.name;
  hudCrystals.textContent = '♦ 0';
  hudTimer.textContent = '⏱ ' + formatTime(timeLeft);

  hideAll();
  state = State.GAME;
  lastTick = performance.now();
  frameId = requestAnimationFrame(loop);

  if (game.parentElement && getComputedStyle(game.parentElement).position === 'static') {
    game.parentElement.style.position = 'relative';
  }
  if (draw.playerEl) draw.playerEl.style.display = '';
  if (draw.lavaEls) draw.lavaEls.forEach(el => el.style.display = 'none');
  if (draw.aguaEls) draw.aguaEls.forEach(el => el.style.display = 'none');
  if (draw.crystalEls) draw.crystalEls.forEach(el => el.style.display = 'none');
}


/** Reinicia a fase atual corretamente */
function restartLevel() {
  // 🧹 Esconde tela de morte, se existir
  const deathScreen = document.getElementById('deathScreen');
  if (deathScreen) deathScreen.style.display = 'none';

  // 🔁 Reinicia o nível atual
  cancelAnimationFrame(frameId);  // cancela loop anterior (de morte)
  startLevel(currentLevelIndex);  // recria fase e religa o loop

  // ✅ Garante estado vivo e movimento
  const L = levels[currentLevelIndex];
  player.x = L.spawn.x;
  player.y = L.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.alive = true;
  player.onGround = false;
  player.crystals = 0;

  hudCrystals.textContent = '♦ 0';
}

/** Vitória */
function completeLevel(){
  cancelAnimationFrame(frameId);
  progress.completed=Array.from(new Set([...progress.completed, currentLevelIndex+1]));
  if (progress.unlocked<5 && currentLevelIndex+2>progress.unlocked)
    progress.unlocked=currentLevelIndex+2;

  resTitle.textContent='Vitória!';
  resInfo.textContent=`Cristais: ${player.crystals} | Tempo restante: ${formatTime(timeLeft)}`;
  state=State.RESULT;
  screenResult.classList.add('show');
  if (draw.playerEl) draw.playerEl.style.display='none';
  if (draw.lavaEls) draw.lavaEls.forEach(el => el.style.display='none');
  if (draw.aguaEls) draw.aguaEls.forEach(el => el.style.display='none');
  if (draw.crystalEls) draw.crystalEls.forEach(el => el.style.display='none');
}

/** Derrota */
function failLevel(reason='Tempo esgotado!'){
  cancelAnimationFrame(frameId);
  resTitle.textContent='Derrota';
  resInfo.textContent=reason;
  state=State.RESULT;
  screenResult.classList.add('show');
  if (draw.playerEl) draw.playerEl.style.display='none';
  if (draw.lavaEls) draw.lavaEls.forEach(el => el.style.display='none');
  if (draw.aguaEls) draw.aguaEls.forEach(el => el.style.display='none');
  if (draw.crystalEls) draw.crystalEls.forEach(el => el.style.display='none');
}
btnResultMap.addEventListener('click',()=>{ screenResult.classList.remove('show'); gotoMap(); });
btnResultRetry.addEventListener('click',()=>{ screenResult.classList.remove('show'); restartLevel(); });

/**
 * collideRects(a, r)
 */
function collideRects(a,r){
  const dx=(a.x+a.w/2)-(r.x+r.w/2), dy=(a.y+a.h/2)-(r.y+r.h/2);
  const ox=(a.w/2+r.w/2)-Math.abs(dx), oy=(a.h/2+r.h/2)-Math.abs(dy);
  if(ox<=0||oy<=0) return null;

  if (ox<oy){
    if(dx>0) a.x+=ox; else a.x-=ox;
    a.vx=0;
    return 'x';
  } else {
    if(dy>0) a.y+=oy; else a.y-=oy;
    a.vy=0;
    return (dy>0?'bottom':'top');
  }
}

/** Alavancas */
function useLever(){
  if (state!==State.GAME) return;
  const L=levels[currentLevelIndex];
  for(const lever of L.levers){
    if(aabb(player,lever)){
      lever.active=!lever.active;
      triggers[lever.id]=lever.active;
      updateDoors();
    }
  }
}

/**
 * update(dt)
 */
function update(dt){
  const L=levels[currentLevelIndex];

  timeLeft -= dt/1000;
  if (timeLeft<=0) return failLevel('Tempo esgotado!');
  hudTimer.textContent='⏱ '+formatTime(timeLeft);

  const left=key['ArrowLeft']||key['KeyA'], right=key['ArrowRight']||key['KeyD'], jumpKey=key['ArrowUp']||key['Space']||key['KeyW'];
  if(left) player.vx-=0.9;
  if(right) player.vx+=0.9;
  player.vx*=FRICTION;
  player.vx=clamp(player.vx,-4.2,4.2);

  player.vy+=GRAV;
  player.vy=clamp(player.vy,-999,MAX_FALL);

  if(jumpKey && player.onGround){
    player.vy=-12.5;
    player.onGround=false;
  }

  for (const m of L.movers){
    m.t += m.speed*(dt/16);
    const u=0.5-0.5*Math.cos((m.t % (Math.PI*2)));
    m.x=m.ax+(m.bx-m.ax)*u; m.y=m.ay+(m.by-m.ay)*u;
  }

  player.x += player.vx;
  for (const r of [...L.platforms, ...L.movers]) collideRects(player,r);

  player.onGround=false;
  player.y += player.vy;
  for (const r of [...L.platforms, ...L.movers]){
    const side=collideRects(player,r);
    if(side==='top'){
      player.onGround=true;
      if(L.movers.includes(r)){
        player.x += (r.x-(r._px||r.x));
        player.y += (r.y-(r._py||r.y));
      }
    }
    r._px=r.x; r._py=r.y;
  }




  
  for (const b of L.boxes){
    b.vx*=0.9;
    b.vy+=GRAV; b.vy=clamp(b.vy,-999,MAX_FALL);

           if (aabb(player,b)){
      // Lógica de empurrar (colisão lateral)
      if(player.vx>0){ player.x=b.x-player.w; b.vx+=0.6; }
      else if(player.vx<0){ player.x=b.x+b.w; b.vx-=0.6; }

      // Lógica de colisão vertical (subir na caixa)
      // Se o jogador está caindo (vy > 0) e a parte de baixo do jogador está invadindo a caixa
      // e a invasão vertical é menor que a horizontal, é uma colisão de topo.
      const overlapY = (player.y + player.h) - b.y;
      const overlapX = Math.min(player.x + player.w, b.x + b.w) - Math.max(player.x, b.x);

      if (player.vy > 0 && overlapY > 0 && overlapY < player.vy + 1 && overlapX > 4) {
        player.y = b.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }



    b.x += b.vx; for (const r of [...L.platforms,...L.movers]) collideRects(b,r);
    b.y += b.vy; for (const r of [...L.platforms,...L.movers]){
      const side=collideRects(b,r);
      if(side==='top'){ b.vy=0; }
    }
    b.y += b.vy; for (const r of [...L.platforms,...L.movers]){
      const side=collideRects(b,r);
      if(side==='top'){ b.vy=0; }
    }

    // Colisão do bloco (caixa) com as bordas do canvas
    if (b.x < 0) { // parede esquerda
      b.x = 0;
      b.vx = 0;
    }
    if (b.x + b.w > W) { // parede direita
      b.x = W - b.w;
      b.vx = 0;
    }
    if (b.y + b.h > H) { // chão (para garantir que não caia para fora)
      b.y = H - b.h;
      b.vy = 0;
    }
    // Não é necessário colisão com o teto (b.y < 0) para blocos, pois eles caem.
  } // <--- O loop da caixa agora termina aqui
  

  for (const p of L.plates){
    const prev=p.pressed;
    p.pressed=false;
    if (aabb(player,{x:p.x,y:p.y-2,w:p.w,h:p.h+6})) p.pressed=true;
    for(const b of L.boxes){ if(aabb(b,{x:p.x,y:p.y-2,w:p.w,h:p.h+6})) p.pressed=true; }
    if(prev!==p.pressed){
      triggers[p.id]=p.pressed;
      updateDoors();
    }
  }

  for (const liq of L.liquids){
    if (aabb(player, liq)){
      const name = (liq.type==='lavaGif' ? 'lava' : (liq.type==='aguaGif' ? 'água' : liq.type));
      return failLevel('Você caiu em '+name+'!');
    }
  }

  // coleta de cristais (agora por índice para esconder o GIF correspondente)
  for (let i=0;i<L.crystals.length;i++){
    const c = L.crystals[i];
    if(!c.got && aabb(player,c)){
      c.got=true;
      if (draw.crystalEls && draw.crystalEls[i]) draw.crystalEls[i].style.display='none';
      player.crystals++;
      hudCrystals.textContent='♦ '+player.crystals;
    }
  }

  for (const d of L.doors){
    if(d.open && aabb(player,d)) return completeLevel();
  }
  // 🧱 COLISÃO COM AS BORDAS DO CANVAS — paredes invisíveis
  const canvas = document.getElementById('game');
  if (player.x < 0) player.x = 0; // parede esquerda
  if (player.y < 0) player.y = 0; // teto
  if (player.x + player.w > canvas.width) player.x = canvas.width - player.w; // parede direita
  if (player.y + player.h > canvas.height) { // chão
    player.y = canvas.height - player.h;
    player.vy = 0;
    player.onGround = true;
}


}



/**
 * updateDoors()
 */
function updateDoors(){
  const L=levels[currentLevelIndex];
  for (const d of L.doors){
    let ok=true;
    for(const req of d.requires){
      if(!triggers[req]){ ok=false; break; }
    }
    d.open=ok;
  }
}

/**
 * draw()
 * Renderização do quadro:
 * - Fundo com gradiente
 * - Plataformas, movers, líquidos, placas, alavancas, portas
 * - Cristais não coletados (agora como GIF cristal.gif)
 * - Caixas e jogador (retângulos estilizados)
 */
function draw(){
  const L=levels[currentLevelIndex];

  // fundo (vídeo apenas no nível 1)
  if (currentLevelIndex === 0) {
    if (!draw.bgVideo) {
      draw.bgVideo = document.createElement('video');
      draw.bgVideo.src = 'fundo nivel.mp4';
      draw.bgVideo.loop = true;
      draw.bgVideo.muted = true;
      draw.bgVideo.play();
    }
    try {
      ctx.drawImage(draw.bgVideo, 0, 0, W, H);
    } catch (e) {
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#2b221b'); g.addColorStop(1,'#100d0c');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }

  // fundo (vídeo no nível 2)
  } else if (currentLevelIndex === 1) {
    if (!draw.bgVideo2) {
      draw.bgVideo2 = document.createElement('video');
      draw.bgVideo2.src = 'fundo nivel2.mp4';
      draw.bgVideo2.loop = true;
      draw.bgVideo2.muted = true;
      draw.bgVideo2.play();
    }
    try {
      ctx.drawImage(draw.bgVideo2, 0, 0, W, H);
    } catch (e) {
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#2b221b'); g.addColorStop(1,'#100d0c');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }

  } else {
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#2b221b'); g.addColorStop(1,'#100d0c');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }


for (const p of L.platforms) {
  if (!p.img) p.img = 'plataforma.png';   // todas plataformas têm imagem padrão
  if (p.img) {
    if (!p._imgEl) {
      p._imgEl = new Image();
      p._imgEl.src = p.img;
    }
    ctx.drawImage(p._imgEl, p.x, p.y, p.w, p.h);
  } else {
    drawRect(p.x, p.y, p.w, p.h, '#4c3a2c', '#1f150f');
  }
}


  for (const m of L.movers){ drawRect(m.x,m.y,m.w,m.h,'#6a4e39','#241a13'); }

  // --- LÍQUIDOS ---
  // Para 'lavaGif' e 'aguaGif' usamos <img> absolutos acima do canvas para manter a animação dos GIFs.
  // Demais líquidos continuam desenhados no canvas.
  if (!draw.lavaEls) draw.lavaEls = [];
  if (!draw.aguaEls) draw.aguaEls = [];

  // pegar retângulo renderizado do canvas e fatores de escala (corrige offset/zoom)
  const rect = game.getBoundingClientRect();
  const sx = rect.width  / W;
  const sy = rect.height / H;


  // 🔁 Percorre todos os líquidos do nível atual (lava, água, veneno, etc.)
for (let i = 0; i < L.liquids.length; i++) {
  const liq = L.liquids[i]; // referência ao líquido atual

  // Função auxiliar para criar imagem animada ou estática
  function createLiquidElement(list, src, alt) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.style.position = 'absolute';
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    img.style.imageRendering = 'pixelated';
    img.style.zIndex = '1'; // atrás do personagem
    (game.parentElement || document.body).appendChild(img);
    list[i] = img;
    return img;
  }

  // lavaGif → lava.gif
  if (liq.type === 'lavaGif') {
    if (!draw.lavaEls[i]) createLiquidElement(draw.lavaEls, 'lava.gif', 'lava');
    const img = draw.lavaEls[i];
    const lx = rect.left + liq.x * sx;
    const ly = rect.top  + liq.y * sy;
    img.style.left = `${lx}px`;
    img.style.top = `${ly}px`;
    img.style.width = `${liq.w * sx}px`;
    img.style.height = `${liq.h * sy}px`;
    img.style.display = (state === State.GAME) ? '' : 'none';
  }

  // água animada (aguaGif)
  else if (liq.type === 'aguaGif') {
    if (!draw.aguaEls[i]) createLiquidElement(draw.aguaEls, 'agua.gif', 'água');
    const img = draw.aguaEls[i];
    const lx = rect.left + liq.x * sx;
    const ly = rect.top  + liq.y * sy;
    img.style.left = `${lx}px`;
    img.style.top = `${ly}px`;
    img.style.width = `${liq.w * sx}px`;
    img.style.height = `${liq.h * sy}px`;
    img.style.display = (state === State.GAME) ? '' : 'none';
  }

  // água estática (ex: agua1.png)
  else if (liq.type.endsWith('.png')) {
    if (!draw.aguaEls[i]) createLiquidElement(draw.aguaEls, liq.type, 'água estática');
    const img = draw.aguaEls[i];
    const lx = rect.left + liq.x * sx;
    const ly = rect.top  + liq.y * sy;
    img.style.left = `${lx}px`;
    img.style.top = `${ly}px`;
    img.style.width = `${liq.w * sx}px`;
    img.style.height = `${liq.h * sy}px`;
    img.style.display = (state === State.GAME) ? '' : 'none';
  }

  // líquidos simples (cores sólidas)
  else {
    const color =
      liq.type === 'lava' ? '#e65100' :
      liq.type === 'agua' ? '#039be5' :
      '#76ff03';
    drawRect(liq.x, liq.y, liq.w, liq.h, color, '#1a120c');
  }
}

// 🔒 Esconde quaisquer elementos antigos que não existem mais
for (let i = L.liquids.length; i < (draw.lavaEls?.length || 0); i++) {
  if (draw.lavaEls[i]) draw.lavaEls[i].style.display = 'none';
}
for (let i = L.liquids.length; i < (draw.aguaEls?.length || 0); i++) {
  if (draw.aguaEls[i]) draw.aguaEls[i].style.display = 'none';
}

  // --- Personagem mostrado como GIF/estático acima do canvas ---
  const SCALE = 2; // 2x maior (mude se quiser)
  if (!draw.playerEl){
    draw.playerEl = document.createElement('img');
    draw.playerEl.src = 'bonequin.gif';
    draw.playerAnimating = true;
    draw.playerStillURL = null;
    draw.playerEl.alt = 'jogador';
    draw.playerEl.style.position = 'absolute';
    draw.playerEl.style.pointerEvents = 'none';
    draw.playerEl.style.userSelect = 'none';
    draw.playerEl.style.imageRendering = 'pixelated';
    draw.playerEl.style.zIndex = '2'; // acima dos líquidos
    draw.playerEl.addEventListener('load', ()=>{
      if (draw.playerStillURL) return;
      try{
        const c = document.createElement('canvas');
        const iw = draw.playerEl.naturalWidth  || player.w*2;
        const ih = draw.playerEl.naturalHeight || player.h*2;
        c.width = iw; c.height = ih;
        const ictx = c.getContext('2d');
        ictx.drawImage(draw.playerEl, 0, 0, iw, ih);
        draw.playerStillURL = c.toDataURL('image/png');
      }catch(e){
        draw.playerStillURL = null;
      }
    }, { once:false });
    if (game.parentElement && getComputedStyle(game.parentElement).position === 'static'){
      game.parentElement.style.position = 'relative';
    }
    (game.parentElement || document.body).appendChild(draw.playerEl);
  }



const goingLeft  = key['ArrowLeft'] || key['KeyA'];
const goingRight = key['ArrowRight'] || key['KeyD'];
const goingUp    = key['ArrowUp'] || key['KeyW'];
const goingSpace = key['Space'];

const interacting = goingLeft || goingRight || goingUp || goingSpace;

// Atualiza a direção mesmo se estiver andando
if (goingLeft) {
  if (draw.lastDirection !== 'left') {
    draw.lastDirection = 'left';
    // Se já está andando, troca o GIF imediatamente
    if (draw.playerAnimating) {
      draw.playerEl.src = 'bonequinesquerda.gif';
    }
  }
} else if (goingRight) {
  if (draw.lastDirection !== 'right') {
    draw.lastDirection = 'right';
    // Se já está andando, troca o GIF imediatamente
    if (draw.playerAnimating) {
      draw.playerEl.src = 'bonequin.gif';
    }
  }
}

// Controle de animação
if (interacting) {
  if (!draw.playerAnimating) {
    if (draw.lastDirection === 'left') {
      draw.playerEl.src = 'Bonequinesquerda.gif';
    } else {
      draw.playerEl.src = 'bonequin.gif';
    }
    draw.playerAnimating = true;
  }
} else {
  if (draw.playerAnimating) {
    if (draw.lastDirection === 'left') {
      draw.playerEl.src = 'Bonequinesquerdaparado.png';
    } else {
      draw.playerEl.src = 'bonequindireitaparado.gif.png';
    }
    draw.playerAnimating = false;
  }
}




  // posicionamento do jogador com escala/offset corretos
  const vw = player.w * SCALE * sx;
  const vh = player.h * SCALE * sy;
  const vx = rect.left + (player.x + player.w/2) * sx - vw/2;
  const vy = rect.top  + (player.y + player.h)   * sy - vh;
  draw.playerEl.style.left = `${vx}px`;
  draw.playerEl.style.top  = `${vy}px`;
  draw.playerEl.style.width  = `${vw}px`;
  draw.playerEl.style.height = `${vh}px`;
  draw.playerEl.style.display = '';

  // --- HUD/objetos do nível ---
  for (const p of L.plates){ drawRect(p.x,p.y,p.w,p.h, p.pressed?'#01cf38ff':'#ff0000ff', '#1f150f'); }
  for (const l of L.levers){ drawRect(l.x,l.y,l.w,l.h, l.active?'#ffd54f':'#6d4c41', '#1f150f'); }
 // --- PORTAS (invisível quando fechada, aparece quando liberada) ---
if (!draw.doorEls) draw.doorEls = [];

for (let i = 0; i < L.doors.length; i++) {
  const d = L.doors[i];

  // cria o elemento de imagem se ainda não existir
  if (!draw.doorEls[i]) {
    const img = document.createElement('img');
    img.src = 'porta.png'; // imagem da porta bloqueando
    img.alt = 'porta';
    img.style.position = 'absolute';
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    img.style.imageRendering = 'pixelated';
    img.style.zIndex = '2';
    (game.parentElement || document.body).appendChild(img);
    draw.doorEls[i] = img;
  }

  const img = draw.doorEls[i];

  // posição e tamanho
  const lx = rect.left + d.x * sx;
  const ly = rect.top + d.y * sy;
  img.style.left = `${lx}px`;
  img.style.top = `${ly}px`;
  img.style.width = `${d.w * sx}px`;
  img.style.height = `${d.h * sy}px`;

  // se a porta estiver "liberada" (open = true), mostra
  // se estiver fechada (open = false), esconde
  img.style.display = d.open ? '' : 'none';
}


  // --- CRISTAIS como GIF animado (cristal.gif) ---
  if (!draw.crystalEls) draw.crystalEls = [];
  for (let i=0;i<L.crystals.length;i++){
    const c = L.crystals[i];
    if (c.got){
      if (draw.crystalEls[i]) draw.crystalEls[i].style.display='none';
      continue;
    }
    if (!draw.crystalEls[i]){
      const img = document.createElement('img');
      img.src = 'cristal.gif'; // animação do cristal
      img.alt = 'cristal';
      img.style.position = 'absolute';
      img.style.pointerEvents = 'none';
      img.style.userSelect = 'none';
      img.style.imageRendering = 'pixelated';
      img.style.zIndex = '2'; // acima dos líquidos; abaixo/igual ao player
      if (game.parentElement && getComputedStyle(game.parentElement).position === 'static'){
        game.parentElement.style.position = 'relative';
      }
      (game.parentElement || document.body).appendChild(img);
      draw.crystalEls[i] = img;
    }
    const img = draw.crystalEls[i];
    const cx = rect.left + c.x * sx;
    const cy = rect.top  + c.y * sy;
    img.style.left   = `${cx}px`;
    img.style.top    = `${cy}px`;
    img.style.width  = `${c.w * sx}px`;
    img.style.height = `${c.h * sy}px`;
    img.style.display = (state===State.GAME) ? '' : 'none';
  }

  // caixas
  for (const b of L.boxes){ drawRect(b.x,b.y,b.w,b.h,'#8d6e63','#1f150f'); }
}

let lastTick=0;

/**
 * loop(ts)
 */
function loop(ts){
  const dt=Math.min(50, ts-(lastTick||ts));
  lastTick=ts;
  update(dt);
  draw();
  if(state===State.GAME) frameId=requestAnimationFrame(loop);
}

btnRestart.addEventListener('click', restartLevel);
showMenu();
renderMap();
