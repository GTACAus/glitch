const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const keys = {};
const player = { x: 240, y: 180, size: 20, speed: 3 };
let dot = newDot();
let score = 0;

addEventListener("keydown", (e) => (keys[e.key] = true));
addEventListener("keyup", (e) => (keys[e.key] = false));

function newDot() {
  return { x: 20 + Math.random() * 440, y: 20 + Math.random() * 320 };
}

function update() {
  if (keys.ArrowLeft) player.x -= player.speed;
  if (keys.ArrowRight) player.x += player.speed;
  if (keys.ArrowUp) player.y -= player.speed;
  if (keys.ArrowDown) player.y += player.speed;
  player.x = Math.max(0, Math.min(canvas.width - player.size, player.x));
  player.y = Math.max(0, Math.min(canvas.height - player.size, player.y));

  const dx = player.x + player.size / 2 - dot.x;
  const dy = player.y + player.size / 2 - dot.y;
  if (Math.hypot(dx, dy) < player.size) {
    score++;
    dot = newDot();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#06d6a0";
  ctx.fillRect(player.x, player.y, player.size, player.size);
  ctx.fillStyle = "white";
  ctx.font = "16px system-ui";
  ctx.fillText(`Score: ${score}  (use the arrow keys)`, 12, 24);
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}
loop();
