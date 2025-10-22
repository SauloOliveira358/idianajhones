const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 500;

// Jogador
const player = {
  x: 100,
  y: 100,
  width: 40,
  height: 40,
  color: "#00f",
  speed: 5,
  velocityY: 0,
  jumpPower: 12,
  gravity: 0.6,
  onGround: false
};

// Plataforma (chão + extras)
const platforms = [
  { x: 0, y: 460, width: 800, height: 40 }, // chão
  { x: 300, y: 360, width: 120, height: 20 },
  { x: 500, y: 280, width: 120, height: 20 }
];

const keys = {
  left: false,
  right: false,
  up: false
};

// Input
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = true;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = true;
  if ((e.key === "ArrowUp" || e.key === "w" || e.key === " ") && player.onGround) {
    player.velocityY = -player.jumpPower;
    player.onGround = false;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
});

function checkCollision(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

function update() {
  // Movimento lateral
  if (keys.left) player.x -= player.speed;
  if (keys.right) player.x += player.speed;

  // Gravidade
  player.velocityY += player.gravity;
  player.y += player.velocityY;
  player.onGround = false;

  // Colisão com plataformas
  platforms.forEach(platform => {
    if (checkCollision(player, platform)) {
      // Verifica se veio de cima
      if (player.velocityY > 0 && player.y + player.height - player.velocityY <= platform.y) {
        player.y = platform.y - player.height;
        player.velocityY = 0;
        player.onGround = true;
      }
      if (player.velocityY < 0 && player.y - player.velocityY >= platform.y + platform.height) {
  player.y = platform.y + platform.height;
  player.velocityY = 0;
}
// Colisão lateral direita
if (
  player.x + player.width > platform.x &&
  player.x < platform.x &&
  player.y + player.height > platform.y &&
  player.y < platform.y + platform.height
) {
  player.x = platform.x - player.width;
}

// Colisão lateral esquerda
if (
  player.x < platform.x + platform.width &&
  player.x + player.width > platform.x + platform.width &&
  player.y + player.height > platform.y &&
  player.y < platform.y + platform.height
) {
  player.x = platform.x + platform.width;
}
    }
  });
}

function drawPlayer() {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawPlatforms() {
  ctx.fillStyle = "#0f0";
  platforms.forEach(p => {
    ctx.fillRect(p.x, p.y, p.width, p.height);
  });
}

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  update();
  drawPlatforms();
  drawPlayer();
  requestAnimationFrame(gameLoop);
}

gameLoop();
