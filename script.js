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
let eventoJaOcorreu = false;

let tempoRetorno = 20000;
let timerPlataforma = 0;


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
let alavanca = false;
const mapCanvas = document.getElementById('map');
const mapCtx = mapCanvas.getContext('2d');



// --- Inicializa os sons ---
let audioInicial = new Audio("audioinicial.mp3");
audioInicial.loop = true;
audioInicial.volume = 0.4;

let audioFase = new Audio("audiofase.mp3");
audioFase.loop = true;
audioFase.volume = 0.5;

// 🔒 Ativa o som do menu só depois do primeiro clique do jogador
let somAtivado = false;
window.addEventListener("click", () => {
  if (!somAtivado) {
    somAtivado = true;
    // Toca o som inicial do menu
    audioInicial.play().catch(() => {});
  }
});

// ===== SISTEMA DE PARTÍCULAS =====
// Array para armazenar partículas de fogo
let fireParticles = [];

// Estrutura de dados para rastrear caixas em chamas
let burningBoxes = new Map(); // Map<box, {timer: number, particlesActive: boolean}>

// -------------------------
// Estados de tela do jogo
// -------------------------
const State = { MENU:0, MAP:1, GAME:2, RESULT:3 };
let state = State.MENU; 
// Adicione estas linhas perto de onde você declarou 'let state = State.MENU;'

let alavancaArmada = false;  // TRUE quando a alavanca da Fase 2 for acionada
let plataformaGirou = false; // TRUE quando a plataforma efetivamente girar
                // estado atual
let currentLevelIndex = -1;             // índice da fase ativa
let progress = { unlocked: 1, completed: [] }; // progresso (fases liberadas/concluídas)

let timeLeft = 0, frameId;
const key = {};
const imgPlataforma = new Image();
imgPlataforma.src = 'plataforma.png'; 

const imgLeverInactive = new Image();
imgLeverInactive.src = 'alavanca.png';
const imgLeverL3M = new Image();
imgLeverL3M.src = 'alavancamovers.png'; 
const imgLeverActive = new Image();
imgLeverActive.src = 'alavancaacionada.png';

// Variáveis para a mecânica da Fase 3 (Plataformas que somem)
// Variáveis para a mecânica da Fase 3 (Plataformas que somem)
const PLATAFORMAS_FASE3 = [1, 2, 3,4]; // Índices das plataformas afetadas
const TEMPO_ESCONDIDA = 20000; // 3 segundos (tempo que a plataforma fica invisível)
const TEMPO_PAUSA_VISIVEL = 20000; // 0.5 segundos (tempo que todas ficam visíveis)
const CICLO_TOTAL = TEMPO_ESCONDIDA + TEMPO_PAUSA_VISIVEL; // 3500 ms
// As outras variáveis globais (timerPlataforma3, plataformaAtualFase3, etc.) permanecem as mesmas.


let timerPlataforma3 = 0;
let plataformaAtualFase3 = -1; // Índice da plataforma atualmente escondida
let posicoesOriginaisFase3 = {}; // Para guardar o estado original das plataformas
let controllingMover = null; // guarda a plataforma sendo controlada


let somFogo = new Audio("fogobloco.mp3");
somFogo.loop = true;    // o som fica queimando enquanto a caixa pega fogo
somFogo.volume = 0.6;

// -------------------------
// Entrada via teclado
// - Armazena teclas pressionadas
// - ESC para voltar ao mapa
// - E para usar alavanca
// - R para reiniciar fase
// -------------------------
let playerOnMover = false;

window.addEventListener('keydown', (e) => {
  key[e.code] = true;

  if (e.code === 'Escape') gotoMap();
  if (e.code === 'KeyE') {
    const L = levels[currentLevelIndex];

    // Se estiver sobre a plataforma móvel, alterna entre "grudar" e "soltar"
    if (currentLevelIndex === 2) {
      const mover = L.movers.find(m => m.id === 'M3A');
      if (mover && aabb(player, {x: mover.x, y: mover.y - 4, w: mover.w, h: mover.h + 6})) {
        playerOnMover = !playerOnMover;
        if (playerOnMover) {
          player.vx = 0; player.vy = 0;
          player.onGround = true;
        }
      }
    }

    useLever(); // mantém função original
  }

  if (e.code === 'KeyR') {restartLevel()
    try {
      
      somFogo.pause();
      somFogo.currentTime = 0;
    } catch (e) {}
  };
});

window.addEventListener('keyup', (e)=> key[e.code] = false);

// -------------------------
// Física/utilidades
// -------------------------
const GRAV = 0.75, FRICTION = 0.85, MAX_FALL = 16;
let boxPushForce = 0.6; // força aplicada ao empurrar caixas

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
// ===== FUNÇÕES DO SISTEMA DE PARTÍCULAS =====

/**
 * Cria partículas de fogo em uma posição específica
 */
function createFireParticles(x, y, w, h) {
  const particleCount = 8; // número de partículas por frame
  for (let i = 0; i < particleCount; i++) {
    fireParticles.push({
      x: x + Math.random() * w,
      y: y + Math.random() * h,
      vx: (Math.random() - 0.5) * 2,
      vy: -Math.random() * 3 - 1, // movimento para cima
      life: 1.0, // vida da partícula (1.0 = 100%)
      size: Math.random() * 2 + 1, // tamanho variável
      color: Math.random() > 0.5 ? '#ff6600' : '#ff3300' // cores de fogo
    });
  }
}
function pararTodosSonsDeFogo() {
  for (const [box, data] of burningBoxes) {
    if (data.som) {
      try {
        data.som.pause();
        data.som.currentTime = 0;
      } catch (e) {}
    }
  }
  burningBoxes.clear(); // limpa o mapa (nenhuma caixa mais queimando)
}

/**
 * Atualiza as partículas de fogo
 */
function updateFireParticles(dt) {
  for (let i = fireParticles.length - 1; i >= 0; i--) {
    const p = fireParticles[i];
    
    // Atualiza posição
    p.x += p.vx;
    p.y += p.vy;
    
    // Reduz vida da partícula
    p.life -= 0.02 * (dt / 16);
    
    // Remove partículas mortas
    if (p.life <= 0) {
      fireParticles.splice(i, 1);
    }
  }
}

/**
 * Desenha as partículas de fogo
 */
function drawFireParticles() {
  for (const p of fireParticles) {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// -------------------------
// Mapa de fases: nós e ligações (arvore)
// -------------------------
const treeNodes = [
  { id: 1, x: 150, y: 330 }, // fase 1 — esquerda
  { id: 2, x: 450, y: 230 }, // fase 2 — centro
  { id: 3, x: 750, y: 130 }  // fase 3 — mais alta à direita
];

const treeEdges = [
  [1, 2],
  [2, 3]
];


/** Mostra a tela de menu */
function showMenu(){ 
  document.querySelector('.hud').classList.remove('show');

  try {
      
      somFogo.pause();
      somFogo.currentTime = 0;
    } catch (e) {}
  state=State.MENU; screenMenu.classList.add('show');
if (audioFase && !audioFase.paused) audioFase.pause();
  if (audioInicial && audioInicial.paused) {
    audioInicial.currentTime = 0;
    audioInicial.play().catch(() => {});
  }
 }

/** Esconde todas as telas (menu, mapa, resultado) */
function hideAll(){
  screenMenu.classList.remove('show');
  screenMap.classList.remove('show');
  screenResult.classList.remove('show');
}

/** Vai para a tela de mapa; se estava jogando, cancela o frame atual */
function gotoMap(){
  document.querySelector('.hud').classList.remove('show');

  try {
      
      somFogo.pause();
      somFogo.currentTime = 0;
    } catch (e) {}
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
  const w = mapCanvas.width, h = mapCanvas.height;
  mapCtx.clearRect(0, 0, w, h);

  // 🔹 Fundo com imagem personalizada
  const bg = new Image();
  bg.src = 'fundomapa.png';
  bg.onload = () => {
    mapCtx.drawImage(bg, 0, 0, w, h);

    // Agora desenha o resto normalmente (linhas e nós)
    drawMapElements();
  };
}

// 🔸 Move o restante do código de renderização (arestas e nós) para esta função auxiliar
function drawMapElements() {
  const w = mapCanvas.width, h = mapCanvas.height;

  // ramos (ligações)
  mapCtx.strokeStyle = '#a07a3b';
  mapCtx.lineWidth = 8;
  mapCtx.lineCap = 'round';
  mapCtx.beginPath();
  for (const [a, b] of treeEdges) {
    const na = treeNodes.find(n => n.id === a),
          nb = treeNodes.find(n => n.id === b);
    mapCtx.moveTo(na.x, na.y);
    mapCtx.lineTo(nb.x, nb.y);
  }
  mapCtx.stroke();

  // nós
  for (const n of treeNodes) {
    const unlocked = n.id <= progress.unlocked;
    const done = progress.completed.includes(n.id);
    mapCtx.beginPath();
    mapCtx.arc(n.x, n.y, 16, 0, Math.PI * 2);
    mapCtx.fillStyle = done ? '#00e676' : (unlocked ? '#fdd835' : '#666');
    mapCtx.fill();
    mapCtx.lineWidth = 3;
    mapCtx.strokeStyle = '#2c1e12';
    mapCtx.stroke();
    mapCtx.fillStyle = '#1b1412';
    mapCtx.font = 'bold 13px system-ui';
    mapCtx.textAlign = 'center';
    mapCtx.fillText(String(n.id), n.x, n.y + 4);
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
      {x:120,y:410,w:160,h:16, imgPlataforma},  // Plataforma secundária
      {x:320,y:350,w:120,h:16, imgPlataforma},  // ...
      {x:500,y:320,w:120,h:16, imgPlataforma},
      {x:680,y:270,w:140,h:16, imgPlataforma},
      {x:820,y:430,w:120,h:16,imgPlataforma}
    ],

    movers: [], // Plataformas móveis (ainda não há nenhuma nesta fase)

    // Líquidos — podem ser lava, água ou ácido
    // type:'aguaGif' indica que será renderizada como GIF animado
    liquids: [
      {x:420,y:499,w:140,h:20,type:'aguaGif'}, // Lago de água
      {x:620,y:499,w:200,h:30,type:'aguaGif'}  // Outro pequeno lago
    ],

    // Cristais — itens coletáveis (aumentam pontuação ou completam objetivos)
    crystals: [
      {x:370,y:370,w:15,h:15},
      {x:535,y:280,w:15,h:15},
      {x:710,y:230,w:15,h:15}
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
      {x:737,y:264,w:26,h:26,vx:0,vy:0,img:'blocofase1.png'}
    ]
  },

  {
    //FASE 2
  name: 'Fase 2 — Câmara da Alavanca',
  timeLimit: 90,
  spawn: {x:70, y:450},

  // Plataformas
  platforms: [
    {x:0,y:500,w:960,h:40,img:'chaolava.png'},    // Chão principal (ocupa toda a base)
    {x:80,y:420,w:140,h:16},          // Plataforma 1: Primeira plataforma normal
    {x:280,y:340,w:140,h:16},         // Plataforma 2: Segunda plataforma
    {x:420,y:240,w:140,h:16},         // Plataforma 3: A mais alta, no meio
    {x:620,y:360,w:140,h:16}          // Plataforma 4: Depois da 3, mais baixa
  ],

  movers: [], // Nenhum móvel nesta fase

  // Lava (só muda eixo X, Y permanece 499)
  liquids: [
    {x:270,y:499,w:120,h:20,type:'lava'},   // Lava 1
    {x:600,y:499,w:350,h:20,type:'lava'}   // Lava 2
       // Lava 3
  ],

  // Cristais
  crystals: [
    {x:320,y:370,w:15,h:15},          // Cristal 1: Perto da plataforma 2
    {x:450,y:100,w:15,h:15},          // Cristal 2: Perto da plataforma 3 (a mais alta)
    {x:790,y:210,w:15,h:15}           // Cristal 3: Perto da plataforma 4
  ],

  // Porta no meio, em cima da plataforma 3
  doors: [
    {id:'D2',x:460,y:172,w:36,h:70,open:false,requires:['L1']}
  ],

  // Alavanca na base da plataforma 4, embaixo das plataformas 2 e 3
  levers: [
    {id:'L1',x:650,y:335,w:30,h:30,active:false,toggles:['D2']}
  ],

  // Placa de pressão na plataforma 1
  plates: [],

  // Caixa empurrável
  boxes: [
    {x:500,y:414,w:26,h:26,vx:0,vy:0, img:'blocofase3.png'}
  ]
},

  // ===== FASE 3 =====
  { 
    name: 'Fase 3 — Peso do Destino',
    timeLimit: 100,
    spawn: {x:60, y:450},

    // Plataformas
    platforms: [
      {x:0,y:500,w:960,h:40,img: 'chaofase3.png'},    // Chão principal (ocupa toda a base)
      {x:120,y:420,w:100,h:16}, //plataforma 1
      {x:310,y:330,w:100,h:16},//plataforma 2
      {x:320,y:150,w:100,h:16}, //plataforma 3
      {x:480,y:380,w:150,h:16}, //plataforma 4
      {x:120,y:130,w:100,h:16}, //plataforma 5
      {x:700,y:310,w:150,h:16}, //plataforma 6  
      {x:820,y:430,w:120,h:16},
      // NOVO: Plataforma de suporte fora do canvas
{id: 'SUPORTE_BLOCO_3', x: 260 - 26, y: -26, w: 52, h: 16,} 

    ],

    movers: [
  { id: 'M3A', x: 500, y: 240, w: 100, h: 16, speed: 2, dir: 1, active: false }
],


    // Lava estática (não animada)
    liquids: [
      {x:130,y:499,w:810,h:20,type:'lava'},  
    ],

    // Cristais
    crystals: [
      {x:0,y:0,w:15,h:15},
      {x:900,y:90,w:15,h:15},
      {x:530,y:300,w:15,h:15}
    ],

    // Porta que precisa de uma alavanca e uma placa
    
    doors: [
      {id:'D3',x:150,y:62,w:36,h:70,open:false,requires:['P3','L3']}
    ],

    // Alavanca que faz parte do mecanismo da porta
    levers: [
      {id:'L3',x:720,y:282,w:30,h:30,active:false,toggles:['D3']},
      { id: 'L3M', x: 520, y: 220, w: 30, h: 30, active: false, attachedTo: 'M3A' }

    ],

    // Placa de chão que também abre a porta
    plates: [
      {id:'P3',x:850,y:424,w:40,h:8,pressed:false,opens:['D3']}
    ],

    // Uma caixa que pode ser usada para ativar a placa
  // Uma caixa que pode ser usada para ativar a placa
boxes: [
  // NOVO BLOCO: Posicionado em cima da plataforma de suporte
{id: 'BLOCO_SOLTO_3', x: 260, y:-35, w: 26, h: 26, vx: 0, vy: 0, img: 'blocofase3.png'}

]

  },

];

// === Inicialização de áudio ===
if (!audioInicial) {
  audioInicial = document.createElement('audio');
  audioInicial.src = 'audioinicial.mp3';
  audioInicial.loop = true;
  audioInicial.volume = 0.4;
  document.body.appendChild(audioInicial);
}

if (!audioFase) {
  audioFase = document.createElement('audio');
  audioFase.src = 'audiofase.mp3';
  audioFase.loop = true;
  audioFase.volume = 0.5;
  document.body.appendChild(audioFase);
}

// Guarda uma cópia imutável de cada fase
const baseLevels = JSON.parse(JSON.stringify(levels));



let triggers={};
const player={x:0,y:0,w:24,h:32,vx:0,vy:0,onGround:false,crystals:0,alive:true};

/**
 * startLevel(idx)
 */
function startLevel(idx) {
  currentLevelIndex = idx;
  alavancaArmada = false;
  plataformaGirou = false;
eventoJaOcorreu = false; 

tempoRetorno = 10000
timerPlataforma = 0
  // 🧱 Faz uma cópia profunda do nível para resetar tudo
  const original = baseLevels[idx] || levels[idx]; // baseLevels será o modelo original
  const L = JSON.parse(JSON.stringify(original));

  levels[idx] = L; // substitui o nível atual por uma nova cópia limpa
// Ajustar velocidade da caixa conforme a fase
// Ajustar força de empurrão conforme a fase
if (idx === 1) {          // Fase 2
  boxPushForce = 3;       // Mais leve (empurra rápido)
} 
else if (idx === 2) {     // Fase 3
  boxPushForce = 0.1;     // Mais pesado (empurra devagar)
} 
else {
  boxPushForce = 0.6;     // Padrão
}

  triggers = {};
  (L.levers || []).forEach(l => triggers[l.id] = l.active);
  (L.plates || []).forEach(p => triggers[p.id] = p.pressed);
  (L.doors || []).forEach(d => triggers[d.id] = d.open);

  player.x = L.spawn.x;
  player.y = L.spawn.y;
  player.vx = player.vy = 0;
  player.onGround = false;
  player.crystals = 0;
    // Limpa sistema de partículas e caixas em chamas
  fireParticles = [];
  burningBoxes.clear();

  player.alive = true;

  timeLeft = L.timeLimit;
  hudLevel.textContent = L.name;
  hudCrystals.textContent = '♦ 0';
  hudTimer.textContent = '⏱ ' + formatTime(timeLeft);

  hideAll();
  state = State.GAME;
  document.querySelector('.hud').classList.add('show');

  lastTick = performance.now();
  frameId = requestAnimationFrame(loop);

  if (game.parentElement && getComputedStyle(game.parentElement).position === 'static') {
    game.parentElement.style.position = 'relative';
  }
  if (draw.playerEl) draw.playerEl.style.display = '';
  if (draw.lavaEls) draw.lavaEls.forEach(el => el.style.display = 'none');
  if (draw.aguaEls) draw.aguaEls.forEach(el => el.style.display = 'none');
  if (draw.crystalEls) draw.crystalEls.forEach(el => el.style.display = 'none');

  // Reset da mecânica da Fase 3
    timerPlataforma3 = 0;
    plataformaAtualFase3 = -1;
    posicoesOriginaisFase3 = {}; // Limpa o cache de posições
    
    // Se for a Fase 3, armazena as posições originais
    if (currentLevelIndex === 2) {
        const L = levels[currentLevelIndex];
        for (const index of PLATAFORMAS_FASE3) {
            const plat = L.platforms[index];
            posicoesOriginaisFase3[index] = { x: plat.x, y: plat.y, w: plat.w, h: plat.h };
        }
    }
      
// 🎵 Troca para o áudio das fases
  if (audioInicial && !audioInicial.paused) audioInicial.pause();
  if (audioFase && audioFase.paused) {
    audioFase.currentTime = 0;
    audioFase.play().catch(() => {}); // evita erro de autoplay bloqueado
  }


}


/** Reinicia a fase atual corretamente */
function restartLevel() {
  // 🧹 Esconde tela de morte, se existir
     try {
      
      somFogo.pause();
      somFogo.currentTime = 0;
    } catch (e) {}
   controllingMover = null;
  alavanca = false;
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
  if (draw.playerEl) draw.playerEl.style.display='none';
  if (progress.unlocked<5 && currentLevelIndex+2>progress.unlocked)
    progress.unlocked=currentLevelIndex+2;

  resTitle.textContent='Vitória!';
  resInfo.textContent=`Cristais: ${player.crystals} | Tempo restante: ${formatTime(timeLeft)}`;
  state=State.RESULT;
  screenResult.classList.add('show');
  
  if (draw.lavaEls) draw.lavaEls.forEach(el => el.style.display='none');
  if (draw.aguaEls) draw.aguaEls.forEach(el => el.style.display='none');
  if (draw.crystalEls) draw.crystalEls.forEach(el => el.style.display='none');
}

/** Derrota */
function failLevel(reason='Tempo esgotado!'){
     try {
      
      somFogo.pause();
      somFogo.currentTime = 0;
    } catch (e) {}
   if (draw.playerEl) draw.playerEl.style.display='none';
  cancelAnimationFrame(frameId);
  
  resTitle.textContent='Derrota';
  resInfo.textContent=reason;
  state=State.RESULT;
  screenResult.classList.add('show');
 
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
function useLever() {
  if (state !== State.GAME) return false;
  const L = levels[currentLevelIndex];


  // 🔹 Se o jogador já está controlando a plataforma (fase 3),
  // apertar 'E' novamente faz ele sair, mesmo sem estar tocando a alavanca.
  if (currentLevelIndex === 2 && controllingMover) {
  controllingMover = null;
  player.onGround = true;
  player.vx = 0;
  player.vy = 0;

  // 🔹 NOVO TRECHO: ao sair do controle, reseta a alavanca e o mover
  const mover = L.movers.find(m => m.id === 'M3A');
  const lever = L.levers.find(l => l.id === 'L3M');
  if (mover) {
    mover.active = false;
    mover.img = 'movers.png'; // volta para imagem normal
  }
  if (lever) {
    lever.active = false;
    lever.img = 'alavanca.png'; // volta para alavanca padrão
  }

  return true;
}


  // 🔹 Caso normal — procurar alavancas e acionar
  for (const lever of L.levers) {
    if (aabb(player, lever)) {
      const somAlavanca = new Audio('alavanca.mp3');
  somAlavanca.volume = 1;
  somAlavanca.play().catch(() => {});
    lever.active = !lever.active;
    // --- Controle da alavanca L3M que ativa o mover M3A ---
if (lever.id === 'L3M') {
  const mover = L.movers.find(m => m.id === lever.attachedTo);
  if (mover) {
    mover.active = lever.active;

    // muda a imagem do mover conforme o estado
    mover.img = lever.active ? 'moversverde.png' : 'movers.png';
  }

  // muda também o sprite da própria alavanca
  lever.img = lever.active ? 'alavancamoversacionou.png' : 'alavancamovers.png';
}

      triggers[lever.id] = lever.active;

      // 🔸 Fase 3 — soltar o bloco ao acionar a alavanca L3
      if (currentLevelIndex === 2 && lever.id === 'L3' && lever.active) {
        const suporteIndex = L.platforms.findIndex(p => p.id === 'SUPORTE_BLOCO_3');
        if (suporteIndex !== -1) {
          L.platforms.splice(suporteIndex, 1);
          console.log('🧱 Plataforma de suporte removida (Fase 3)');
        }
      }

      // 🔸 Fase 3 — entrar no modo de controle
      if (currentLevelIndex === 2 && lever.id === 'L3M') {
        const mover = L.movers.find(m => m.id === 'M3A');
        if (mover) {
          controllingMover = mover;
          mover.active = false;
          player.vx = 0;
          player.vy = 0;
          player.x = mover.x + mover.w / 2 - player.w / 2;
          player.y = mover.y - player.h;
          player.onGround = true;
        }
      }
    
  

if (currentLevelIndex === 2 && lever.id === 'L3' && lever.active && !wasActive) {
  // Encontra a plataforma de suporte
  const suporteIndex = L.platforms.findIndex(p => p.id === 'SUPORTE_BLOCO_3');
  
  // Se a plataforma de suporte existir, remove-a
  if (suporteIndex !== -1) {
    L.platforms.splice(suporteIndex, 1);
  }
}



      updateDoors();
      return true;
    }
  }

  return false;
}




/**
 * update(dt)
 */
function update(dt){
  const L=levels[currentLevelIndex];

  timeLeft -= dt/1000;
  if (timeLeft<=0) return failLevel('Tempo esgotado!');
  hudTimer.textContent='⏱ '+formatTime(timeLeft);
// --- Movimento do jogador e controle da plataforma ---

const left  = key['ArrowLeft'] || key['KeyA'];
const right = key['ArrowRight'] || key['KeyD'];
const jumpKey = key['ArrowUp'] || key['Space'] || key['KeyW'];

if (controllingMover) {
  // 🔹 Controle manual da plataforma (fase 3)
  const mover = controllingMover;
  // --- NOVO: Limitação de borda para a plataforma controlada ---
  const W = game.width; // Pega a largura do canvas
  if (mover.x < 0) {
    mover.x = 0;
  } else if (mover.x + mover.w > W) {
    mover.x = W - mover.w;
  }

  if (left) mover.x -= mover.speed * (dt / 16);
  if (right) mover.x += mover.speed * (dt / 16);

  // Mantém o jogador em cima da plataforma
  player.vx = 0;
  player.vy = 0;
  player.x = mover.x + mover.w / 2 - player.w / 2;
  player.y = mover.y - player.h;
  player.onGround = true;

  // 🔸 Força o gif do personagem a ficar parado
  if (player.sprite) {
    player.sprite = playerSprites.idle;
  }

} else {
  // 🔹 Movimento normal do personagem
  if (left) player.vx -= 0.9;
  if (right) player.vx += 0.9;
  player.vx *= FRICTION;
  player.vx = clamp(player.vx, -4.2, 4.2);

  player.vy += GRAV;
  player.vy = clamp(player.vy, -999, MAX_FALL);

  if (jumpKey && player.onGround) {
    player.vy = -12.5;
    player.onGround = false;
  }

  // Atualiza sprite (andar/parado)
  if (player.sprite) {
    if (Math.abs(player.vx) > 0.1) player.sprite = playerSprites.walk;
    else player.sprite = playerSprites.idle;
  }
}



//movers pra fazer andar
for (const m of L.movers) {
  if (!m.active) continue;
  m.t += m.speed * (dt / 16);
  const u = 0.5 - 0.5 * Math.cos((m.t % (Math.PI * 2)));
  m.x = m.ax + (m.bx - m.ax) * u;
  m.y = m.ay + (m.by - m.ay) * u;
}


// 🔹 Faz alavancas grudadas se moverem junto
for (const lever of L.levers) {
  if (lever.attachedTo) {
    const mover = L.movers.find(m => m.id === lever.attachedTo);
    if (mover) {
      lever.x = mover.x + 20;
      lever.y = mover.y - 25;
    }
  }
}





  player.x += player.vx;
  for (const r of [...L.platforms, ...L.movers]) collideRects(player,r);

  player.onGround=false;
  player.y += player.vy;
  for (const r of [...L.platforms, ...L.movers]){
    // --- DETECTA SAÍDA DA PLATAFORMA 2 PARA A DIREITA ---
// >>> INÍCIO DO NOVO CÓDIGO <<<

// >>> INÍCIO DO CÓDIGO CORRIGIDO E UNIFICADO <<<

// --- LÓGICA PARA A FASE 1 ---
if (currentLevelIndex === 0) {
    const L = levels[currentLevelIndex];
    const plat2 = L.platforms[2];
    const plat3 = L.platforms[3];

    // Verifica se o jogador cruzou a plat2 e se o evento ainda não ocorreu
    // Usamos 'plataformaGirou' para consistência
    if (!plataformaGirou && (player.x + player.w) > (plat2.x + plat2.w) && player.vx > 0) {
        plataformaGirou = true; // Marca que o evento aconteceu
        timerPlataforma = tempoRetorno;

        // Lógica de rotação para a plat3
        const centerX = plat3.x + plat3.w / 2;
        const centerY = plat3.y + plat3.h / 2;
        const newW = plat3.h;
        const newH = plat3.w;
        plat3.w = newW;
        plat3.h = newH;
        plat3.x = centerX - plat3.w / 2;
        plat3.y = centerY - plat3.h / 2;
    }
}
// --- LÓGICA PARA A FASE 2 ---
else if (currentLevelIndex === 1) {
    const L = levels[currentLevelIndex];
    const plat1 = L.platforms[1];
    const plat2 = L.platforms[2];

    // 1. "Arma" a mecânica quando a alavanca é acionada
    if (!alavancaArmada) {
        const alavancaFase2 = L.levers.find(l => l.id === 'L1');
        if (alavancaFase2 && alavancaFase2.active) {
            alavancaArmada = true;
        }
    }

    // 2. Dispara o evento ao entrar na "zona de ativação"
    const zonaDeAtivacao = { x: plat1.x + plat1.w, w: plat2.x - (plat1.x + plat1.w) };
    const jogadorNaZona = (player.x + player.w > zonaDeAtivacao.x) && (player.x < zonaDeAtivacao.x + zonaDeAtivacao.w);

    if (alavancaArmada && !plataformaGirou && player.vx > 0 && jogadorNaZona) {
        plataformaGirou = true;
        timerPlataforma = tempoRetorno;

        // Lógica de rotação para a plat2
        const centerX = plat2.x + plat2.w / 2;
        const centerY = plat2.y + plat2.h / 2;
        const newW = plat2.h;
        const newH = plat2.w;
        plat2.w = newW;
        plat2.h = newH;
        plat2.x = centerX - plat2.w / 2;
        plat2.y = centerY - plat2.h / 2;
    }
}
// --- LÓGICA PARA A FASE 3 (Plataformas que somem) ---
// --- LÓGICA PARA A FASE 3 (Plataformas que somem) ---
else if (currentLevelIndex === 2) {
    const L = levels[currentLevelIndex];
    timerPlataforma3 -= dt;

    // --- MOVIMENTO DO BLOCO SOLTO JUNTO COM A PLATAFORMA MÓVEL ---
    const mover = L.movers.find(m => m.id === 'M3A');
    const bloco = L.boxes.find(b => b.id === 'BLOCO_SOLTO_3');

    if (mover && bloco) {
        // Detecta se o bloco está apoiado na plataforma móvel
        const estaSobre =
            bloco.y + bloco.h <= mover.y + 4 && // encostado por cima
            bloco.y + bloco.h >= mover.y - 6 &&
            bloco.x + bloco.w > mover.x &&
            bloco.x < mover.x + mover.w;

        if (estaSobre) {
            // Move o bloco na mesma distância que a plataforma andou
            bloco.x += (mover.x - (mover.prevX || mover.x));
            bloco.y = mover.y - bloco.h;
            bloco.vy = 0;
            bloco.onGround = true;
        }

        // Armazena a posição anterior da plataforma
        mover.prevX = mover.x;
    }

    // --- 1. GESTÃO DA TRANSIÇÃO E REAPARECIMENTO ---
    if (timerPlataforma3 <= TEMPO_PAUSA_VISIVEL) {

        // Se uma plataforma estava escondida, REAPARECE ELA AGORA
        if (plataformaAtualFase3 !== -1) {
            const index = plataformaAtualFase3;
            const original = posicoesOriginaisFase3[index];
            const plat = L.platforms[index];

            // Restaura a plataforma para sua posição original
            plat.x = original.x;
            plat.y = original.y;
            plat.w = original.w;
            plat.h = original.h;
        }

        // Se o timer zerou, é hora de começar um novo ciclo (esconder a próxima)
        if (timerPlataforma3 <= 0) {
            // 2. ESCONDER uma nova plataforma aleatória
            const ultimaPlataforma = plataformaAtualFase3; 
            let plataformasDisponiveis = PLATAFORMAS_FASE3.filter(index => index !== ultimaPlataforma);

            if (plataformasDisponiveis.length === 0) {
                plataformasDisponiveis = PLATAFORMAS_FASE3;
            }

            const novoIndice = plataformasDisponiveis[Math.floor(Math.random() * plataformasDisponiveis.length)];
            plataformaAtualFase3 = novoIndice;

            const plat = L.platforms[novoIndice];
            plat.w = 0;
            plat.h = 0;
            
            // 3. REINICIA o timer para o próximo ciclo
            timerPlataforma3 = CICLO_TOTAL;
        }
    }
}



// --- TIMER UNIVERSAL DE REVERSÃO (FORA DOS BLOCOS DE FASE) ---
if (timerPlataforma > 0) {
    timerPlataforma -= dt;

    if (timerPlataforma <= 0) {
        // Só reverta se uma plataforma de fato girou
        if (plataformaGirou) {
            const L = levels[currentLevelIndex];
            let platParaReverter = null;

            // Decide qual plataforma reverter com base na fase
            if (currentLevelIndex === 0) {
                platParaReverter = L.platforms[3];
            } else if (currentLevelIndex === 1) {
                platParaReverter = L.platforms[2];
            }

            // Se encontramos uma plataforma, reverta-a
            if (platParaReverter) {
                const centerX = platParaReverter.x + platParaReverter.w / 2;
                const centerY = platParaReverter.y + platParaReverter.h / 2;
                const newW = platParaReverter.h;
                const newH = platParaReverter.w;
                platParaReverter.w = newW;
                platParaReverter.h = newH;
                platParaReverter.x = centerX - platParaReverter.w / 2;
                platParaReverter.y = centerY - platParaReverter.h / 2;
            }
        }
        // Zera o timer e reseta o estado para a próxima tentativa (se necessário)
        timerPlataforma = 0;
        // Se você quiser que o evento possa acontecer de novo na mesma vida,
        // você resetaria `plataformaGirou = false;` aqui.
        // Mas é melhor resetar apenas no `startLevel`.
    }
}

// >>> FIM DO CÓDIGO CORRIGIDO E UNIFICADO <<<


// O código do Timer de Reversão pode continuar o mesmo que na versão anterior.

// >>> FIM DO CÓDIGO FINAL <<<


// colisões normais ...
const side = collideRects(player, r);
if (side === 'top') {
  player.onGround = true;
  if (L.movers.includes(r)) {
    player.x += (r.x - (r._px || r.x));
    player.y += (r.y - (r._py || r.y));
  }
}
r._px = r.x; r._py = r.y;

// ... (continua seu código de caixas/placas/liquidos etc)



  }




  
    for (const b of L.boxes){
    // aplica atrito vertical/horizontal e gravidade na caixa
    b.vx *= 0.9;
    b.vy += GRAV;
    b.vy = clamp(b.vy, -999, MAX_FALL);

    // --- colisão jogador <-> caixa ---
  if (aabb(player, b)) {

  // Posições anteriores (para detectar se veio de cima)
  const prevY = player.y - player.vy;
  const prevBottom = prevY + player.h;

  // Checa se encostou pela parte de cima da caixa
  let isTopCollision = false;
  if (player.vy >= 0 && prevBottom <= b.y) {
    // Jogador está em cima da caixa
    player.y = b.y - player.h;
    player.vy = 0;
    player.onGround = true;
    isTopCollision = true;
  }

  // Se NÃO está em cima → só aí pode empurrar
  if (!isTopCollision) {

    // Calcula penetração lateral mínima
    const penLeft  = (player.x + player.w) - b.x;
    const penRight = (b.x + b.w) - player.x;

    if (penLeft <= penRight) {
  // bateu do lado esquerdo da caixa
  player.x = b.x - player.w;
  b.vx += boxPushForce; // empurra caixa para a direita (velocidade varia por fase)
} else {
  // bateu do lado direito da caixa
  player.x = b.x + b.w;
  b.vx -= boxPushForce; // empurra caixa para a esquerda (velocidade varia por fase)
}
  }
}


    // movimento da caixa e colisões com plataformas/movers
    b.x += b.vx;
    for (const r of [...L.platforms, ...L.movers]) collideRects(b, r);

    b.y += b.vy;
    for (const r of [...L.platforms, ...L.movers]) {
      const side = collideRects(b, r);
      if (side === 'top') { b.vy = 0; }
    }

    // limitações nas bordas do canvas
    if (b.x < 0) { b.x = 0; b.vx = 0; }
    if (b.x + b.w > W) { b.x = W - b.w; b.vx = 0; }
    if (b.y + b.h > H) { b.y = H - b.h; b.vy = 0; }
      // ===== NOVO: DETECÇÃO DE COLISÃO CAIXA-LAVA (FASE 2) =====
    if (currentLevelIndex === 1 || currentLevelIndex === 2) { // Fase 2 ou 3
  for (const liq of L.liquids) {
    if (liq.type === 'lava' && aabb(b, liq)) {
          // Se a caixa tocou na lava e ainda não está queimando
    
          if (!burningBoxes.has(b)) {
            burningBoxes.set(b, {
              timer: 5000, // 5 segundos em ms
              particlesActive: true
              
            });try {
      somFogo.currentTime = 0;
      somFogo.play();
    } catch (e) {}
          }
        }
      }
    }

  }

  
  for (const p of L.plates){
        const prev = p.pressed;
    p.pressed = false; // Redefine o estado da placa para 'não pressionada' no início de cada quadro

    // Verifica se o jogador ou alguma caixa está sobre a placa
    if (aabb(player, {x: p.x, y: p.y - 2, w: p.w, h: p.h + 6})) {
      p.pressed = true;
    }
    for (const b of L.boxes) {
      if (aabb(b, {x: p.x, y: p.y - 2, w: p.w, h: p.h + 6})) {
        p.pressed = true;
      }
    }
  
  
  // Atualiza partículas de fogo
  updateFireParticles(dt);

    // Apenas atualiza as portas se o estado da placa mudou (de pressionada para não pressionada, ou vice-versa)
    if (prev !== p.pressed) {

      triggers[p.id]=p.pressed;
      updateDoors();
    }
  }
// ===== ATUALIZA CAIXAS EM CHAMAS =====
  for (const [box, data] of burningBoxes.entries()) {
    if (data.particlesActive) {
      // Cria partículas de fogo na posição da caixa
      createFireParticles(box.x, box.y, box.w, box.h);
      
      // Reduz o timer
      data.timer -= dt;
      
      // Se o timer acabou, remove a caixa
      if (data.timer <= 0) {
        // Remove a caixa do array de caixas do nível
        const idx = L.boxes.indexOf(box);
        if (idx !== -1) {
          L.boxes.splice(idx, 1);
        }
        burningBoxes.delete(box);
        try {
    somFogo.pause();
    somFogo.currentTime = 0;
  } catch (e) {}
      }
    }
  }
updateFireParticles(dt);

  for (const liq of L.liquids){
    if (aabb(player, liq)){
      const name = (liq.type==='lavaGif' ? 'lava' : (liq.type==='aguaGif' ? 'água' : liq.type));
      return failLevel('Você caiu na '+name+'!' + ' Burro');
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
// Temporizador para desfazer o giro




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
    alavanca= true;
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
      draw.bgVideo.src = 'fundocenario1.mp4';
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

   } else if (currentLevelIndex === 2) {
    // fundo (vídeo no nível 3)
    if (!draw.bgVideo3) {
      draw.bgVideo3 = document.createElement('video');
      draw.bgVideo3.src = 'fundocristal.mp4'; // Nome do arquivo de vídeo
      draw.bgVideo3.loop = true;
      draw.bgVideo3.muted = true;
      draw.bgVideo3.play();
    }
    try {
      ctx.drawImage(draw.bgVideo3, 0, 0, W, H);
    } catch (e) {
      // Fallback para gradiente se o vídeo não carregar
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#2b221b'); g.addColorStop(1,'#100d0c');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    }
  } else {
    // fundo padrão para as demais fases (4 e 5)
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#2b221b'); g.addColorStop(1,'#100d0c');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }



for (const p of L.platforms) {
  if (!p.img) {
    if (currentLevelIndex === 1) {
      p.img = 'plataformafase2.png'; // Imagem para a Fase 2
    } else if (currentLevelIndex === 2) { // Use 'else if' aqui
      p.img = 'plataformafase3.png'; // Imagem para a Fase 3
    } else { // E o 'else' final para todas as outras fases
      p.img = 'plataforma.png'; // Imagem padrão para outras fases
    }
  }
  
  // O restante do seu código de desenho:
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


for (const m of L.movers) {
  const moverImg = new Image();
  moverImg.src = m.img || 'movers.png';
  ctx.drawImage(moverImg, m.x, m.y, m.w, m.h);
}


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
  if (liq.type === 'lava') {
    if (!draw.lavaEls[i]) createLiquidElement(draw.lavaEls, 'lava3.gif', 'lava');
    const img = draw.lavaEls[i];
    const lx = rect.left + liq.x * sx;
    const ly = rect.top  + liq.y * sy;
    img.style.left = `${lx}px`;
    img.style.top = `${ly}px`;
    img.style.width = `${liq.w * sx}px`;
    img.style.height = `${liq.h * sy}px`;
    img.style.display = (state === State.GAME || state === State.RESULT) ? '' : 'none';

  }

  // água animada (aguaGif)
  else if (liq.type === 'aguaGif') {
    if (!draw.aguaEls[i]) createLiquidElement(draw.aguaEls, 'agua5.gif', 'água');
    const img = draw.aguaEls[i];
    const lx = rect.left + liq.x * sx;
    const ly = rect.top  + liq.y * sy;
    img.style.left = `${lx}px`;
    img.style.top = `${ly}px`;
    img.style.width = `${liq.w * sx}px`;
    img.style.height = `${liq.h * sy}px`;
    img.style.display = (state === State.GAME || state === State.RESULT) ? '' : 'none';

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
    img.style.display = (state === State.GAME || state === State.RESULT) ? '' : 'none';

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
      draw.playerEl.src = 'Bonequinesquerda.gif';
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
if (!draw.doorEls) draw.doorEls = [];

for (let i = 0; i < L.doors.length; i++) {
  const d = L.doors[i];

  // cria o elemento de imagem se ainda não existir
  if (!draw.doorEls[i]) {
    const img = document.createElement('img');
    img.src = 'portafechada.png'; // imagem inicial: porta fechada
    img.alt = 'porta';
    img.style.position = 'absolute';
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    img.style.imageRendering = 'pixelated';
    img.style.zIndex = '1';
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

  // comportamento visual:
  // porta fechada → mostra portafechada.png
  // porta abrindo → troca pra porta.png (gif)
  // porta aberta (liberada) → some
// Linhas 1028-1040
  if (!d.open) {
    // Porta Fechada: mostra a imagem de porta fechada
    img.src = 'portafechada.png';
  } else {
    // Porta Aberta: mostra a imagem de porta aberta
    img.src = 'porta.png';
  }

  // Garante que a porta esteja sempre visível
  img.style.display = '';
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
  draw.playerEl.style.display = (state === State.GAME) ? '' : 'none';

  // --- HUD/objetos do nível ---
  for (const p of L.plates){ drawRect(p.x,p.y,p.w,p.h, p.pressed?'#01cf38ff':'#ff0000ff', '#1f150f'); }
// Desenhar alavancas com imagens PNG
for (const l of L.levers) {
  const img = new Image();

  // Verifica se é a alavanca especial dos movers
  if (l.id && l.id.includes('L3M')) {
    img.src = l.active ? 'alavancamoversacionou.png' : 'alavancamovers.png';
  } 
  // Caso contrário, é uma alavanca comum
  else {
    img.src = l.active ? 'alavancaacionada.png' : 'alavanca.png';
  }

  ctx.drawImage(img, l.x, l.y, l.w, l.h);
}



 // --- PORTAS (invisível quando fechada, aparece quando liberada) ---


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
    img.style.display = (state === State.GAME || state === State.RESULT) ? '' : 'none';

  }

  // --- CAIXAS (agora com imagem) ---
  if (!draw.boxImgs) {
    draw.boxImgs = {}; // Usar um objeto para armazenar imagens por nome
  }

    for (const b of L.boxes) {
    // Usa a imagem definida na caixa (b.img) ou 'bloco6.png' como padrão
    const imgPath = b.img || 'bloco6.png'; 
    
    if (!draw.boxImgs[imgPath]) {
      draw.boxImgs[imgPath] = new Image();
      draw.boxImgs[imgPath].src = imgPath;
    }

    const img = draw.boxImgs[imgPath];
    if (img.complete) {
      ctx.drawImage(img, b.x, b.y, b.w, b.h);
    } else {
      // Fallback: desenha um retângulo se a imagem ainda não carregou
      drawRect(b.x, b.y, b.w, b.h, '#8d6e63', '#1f150f');
    }
  }

   // ===== NOVO: DESENHA PARTÍCULAS DE FOGO =====
  drawFireParticles();

}

let lastTick=0;

/**
 * loop(ts)
 */
function loop(ts){
  const dt=Math.min(50, ts-(lastTick||ts));
  lastTick=ts;
  if(state===State.GAME) { // Apenas atualiza a lógica do jogo no estado GAME
    update(dt);
  }
  draw();
  // O loop só continua se estiver no estado GAME. Se estiver em RESULT, ele para.
  if(state===State.GAME) frameId=requestAnimationFrame(loop); 
}



btnRestart.addEventListener('click', restartLevel);
showMenu();
renderMap();
