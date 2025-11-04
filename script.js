const canvas = document.getElementById("gameCanvas"); // obtém o elemento canvas pelo id
const ctx = canvas.getContext("2d"); // obtém o contexto 2D para desenhar

canvas.width = 800; // define a largura do canvas
canvas.height = 500; // define a altura do canvas

// Jogador
const player = {
  x: 100, // posição X inicial do jogador
  y: 100, // posição Y inicial do jogador
  width: 40, // largura do jogador
  height: 40, // altura do jogador
  color: "#00f", // cor do jogador (azul)
  speed: 5, // velocidade horizontal do jogador
  velocityY: 0, // velocidade vertical atual (usada para gravidade/pulo)
  jumpPower: 12, // força do pulo
  gravity: 0.6, // aceleração da gravidade aplicada por frame
  onGround: false // flag que indica se o jogador está no chão
};

// Plataforma (chão + extras)
const platforms = [
  { x: 0, y: 460, width: 800, height: 40 }, // chão principal
  { x: 300, y: 360, width: 120, height: 20 }, // plataforma 1
  { x: 500, y: 280, width: 120, height: 20 } // plataforma 2
];

const keys = {
  left: false, // tecla esquerda pressionada
  right: false, // tecla direita pressionada
  up: false // tecla de pulo (não usada diretamente para manter pulo só quando onGround)
};

// Input
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = true; // seta movimento à esquerda
  if (e.key === "ArrowRight" || e.key === "d") keys.right = true; // seta movimento à direita
  if ((e.key === "ArrowUp" || e.key === "w" || e.key === " ") && player.onGround) {
    player.velocityY = -player.jumpPower; // aplica impulso de pulo (negativo porque o eixo Y aumenta para baixo)
    player.onGround = false; // marca que não está mais no chão
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = false; // libera tecla esquerda
  if (e.key === "ArrowRight" || e.key === "d") keys.right = false; // libera tecla direita
});

function checkCollision(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width && // verifica sobreposição horizontal (lado esquerdo)
    rect1.x + rect1.width > rect2.x && // verifica sobreposição horizontal (lado direito)
    rect1.y < rect2.y + rect2.height && // verifica sobreposição vertical (topo)
    rect1.y + rect1.height > rect2.y // verifica sobreposição vertical (base)
  ); // retorna true se os dois retângulos estiverem colidindo
}

function update() {
  // Movimento lateral
  if (keys.left) player.x -= player.speed; // move para a esquerda se a tecla estiver pressionada
  if (keys.right) player.x += player.speed; // move para a direita se a tecla estiver pressionada

  // Gravidade
  player.velocityY += player.gravity; // aplica gravidade à velocidade vertical
  player.y += player.velocityY; // atualiza a posição Y com a velocidade vertical
  player.onGround = false; // assume que não está no chão; será corrigido por detecção de colisão

  // Colisão com plataformas
  platforms.forEach(platform => {
    if (checkCollision(player, platform)) { // se houver colisão com a plataforma
      // Verifica se veio de cima
      if (player.velocityY > 0 && player.y + player.height - player.velocityY <= platform.y) {
        player.y = platform.y - player.height; // posiciona o jogador em cima da plataforma
        player.velocityY = 0; // zera a velocidade vertical
        player.onGround = true; // marca que o jogador está no chão
      }
      if (player.velocityY < 0 && player.y - player.velocityY >= platform.y + platform.height) {
        player.y = platform.y + platform.height; // posiciona o jogador abaixo da plataforma se bateu por baixo
        player.velocityY = 0; // zera a velocidade vertical ao bater abaixo
      }
      // Colisão lateral direita
      if (
        player.x + player.width > platform.x && // lado direito do jogador passou da borda esquerda da plataforma
        player.x < platform.x && // lado esquerdo do jogador está antes da borda esquerda da plataforma
        player.y + player.height > platform.y && // parte inferior do jogador está abaixo do topo da plataforma
        player.y < platform.y + platform.height // parte superior do jogador está acima da base da plataforma
      ) {
        player.x = platform.x - player.width; // ajusta X para encostar na borda esquerda da plataforma (bloqueia movimento lateral)
      }

      // Colisão lateral esquerda
      if (
        player.x < platform.x + platform.width && // lado esquerdo do jogador está antes da borda direita da plataforma
        player.x + player.width > platform.x + platform.width && // lado direito do jogador passou da borda direita da plataforma
        player.y + player.height > platform.y && // parte inferior do jogador está abaixo do topo da plataforma
        player.y < platform.y + platform.height // parte superior do jogador está acima da base da plataforma
      ) {
        player.x = platform.x + platform.width; // ajusta X para encostar na borda direita da plataforma (bloqueia movimento lateral)
      }
    }
  });
}

function drawPlayer() {
  ctx.fillStyle = player.color; // define a cor do jogador
  ctx.fillRect(player.x, player.y, player.width, player.height); // desenha o retângulo do jogador
}

function drawPlatforms() {
  ctx.fillStyle = "rgba(0, 0, 0, 1)"; // define a cor das plataformas (preto sólido)
  platforms.forEach(p => {
    ctx.fillRect(p.x, p.y, p.width, p.height); // desenha cada plataforma
  });
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height); // limpa o canvas a cada frame
  update(); // atualiza lógica do jogo (física, colisões, etc.)
  drawPlatforms(); // desenha plataformas
  drawPlayer(); // desenha jogador
  requestAnimationFrame(gameLoop); // pede o próximo frame (loop contínuo)
}

gameLoop(); // inicia o loop do jogo
