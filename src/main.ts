import { Application, Container, Graphics, Text } from "pixi.js";
import "./style.css";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BRICK_HEIGHT,
  CELL_HEIGHT,
  DANGER_Y,
  GRID_TOP,
  GRID_COLUMNS,
  aimFromDrag,
  collectItem,
  createGame,
  finishVolley,
  hitBrickWithBall,
  prepareVolley,
  resetGame,
  traceAimPath,
  type Brick,
  type Item,
  type Vec2,
} from "./game";

const GRID_GAP = 4;
const GRID_MARGIN = 12;
const CELL_WIDTH = (BOARD_WIDTH - GRID_MARGIN * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
const BALL_RADIUS = 5;
const BALL_SPEED = 360;
const FLOOR_Y = 520;

interface ActiveBall extends Vec2 {
  vx: number;
  vy: number;
  delay: number;
}

const state = createGame();
let activeBalls: ActiveBall[] = [];
let aimStart: Vec2 | null = null;
let aimCurrent: Vec2 | null = null;
let lastDirection: Vec2 = { x: 0, y: -1 };
let firstLandingX: number | null = null;
let boardSignature = "";

const app = new Application();
await app.init({
  width: BOARD_WIDTH,
  height: BOARD_HEIGHT,
  backgroundColor: 0x091524,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio, 2),
});

const host = document.querySelector<HTMLDivElement>("#game-canvas")!;
host.appendChild(app.canvas);
app.canvas.style.width = "100%";
app.canvas.style.height = "100%";
app.canvas.setAttribute("role", "application");
app.canvas.setAttribute("aria-label", "아래에서 위로 드래그해 공을 발사하는 게임판");

const scene = new Graphics();
const labels = new Container();
const ballCounter = new Text({
  text: "×1",
  style: { fill: 0xc5d0e3, fontFamily: "system-ui", fontSize: 13, fontWeight: "700" },
});
ballCounter.anchor.set(0, 0.5);
const dangerLabel = new Text({
  text: "DANGER",
  style: { fill: 0xff718b, fontFamily: "system-ui", fontSize: 8, fontWeight: "800", letterSpacing: 1.5 },
});
dangerLabel.anchor.set(1, 1);
dangerLabel.position.set(BOARD_WIDTH - 12, DANGER_Y - 4);
app.stage.addChild(scene, labels, ballCounter, dangerLabel);

const stageEl = document.querySelector<HTMLElement>("#stage")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const ballsEl = document.querySelector<HTMLElement>("#balls")!;
const shieldEl = document.querySelector<HTMLElement>("#shield")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const statusDot = document.querySelector<HTMLElement>("#status-dot")!;
const result = document.querySelector<HTMLElement>("#result")!;
const resultScore = document.querySelector<HTMLElement>("#result-score")!;

const brickRect = (brick: Brick) => ({
  x: GRID_MARGIN + brick.column * (CELL_WIDTH + GRID_GAP),
  y: GRID_TOP + brick.row * CELL_HEIGHT,
  width: CELL_WIDTH,
  height: BRICK_HEIGHT,
});

const itemCenter = (item: Item) => ({
  x: GRID_MARGIN + item.column * (CELL_WIDTH + GRID_GAP) + CELL_WIDTH / 2,
  y: GRID_TOP + item.row * CELL_HEIGHT + BRICK_HEIGHT / 2,
});

function launch(direction = lastDirection): void {
  if (state.gameStatus !== "ready") return;
  lastDirection = direction;
  const count = prepareVolley(state);
  firstLandingX = null;
  activeBalls = Array.from({ length: count }, (_, index) => ({
    ...state.launchPosition,
    vx: direction.x * BALL_SPEED,
    vy: direction.y * BALL_SPEED,
    delay: index * 0.075,
  }));
  syncUi();
}

function reset(): void {
  resetGame(state);
  activeBalls = [];
  aimStart = null;
  aimCurrent = null;
  firstLandingX = null;
  boardSignature = "";
  syncUi();
}

function screenPoint(event: PointerEvent): Vec2 {
  const rect = app.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT,
  };
}

app.canvas.addEventListener("pointerdown", (event) => {
  if (state.gameStatus !== "ready") return;
  const point = screenPoint(event);
  if (point.y < BOARD_HEIGHT * 0.55) return;
  app.canvas.setPointerCapture(event.pointerId);
  aimStart = point;
  aimCurrent = point;
  state.gameStatus = "aiming";
  syncUi();
});

app.canvas.addEventListener("pointermove", (event) => {
  if (state.gameStatus === "aiming") aimCurrent = screenPoint(event);
});

app.canvas.addEventListener("pointerup", (event) => {
  if (state.gameStatus !== "aiming" || !aimStart) return;
  aimCurrent = screenPoint(event);
  const direction = aimFromDrag(aimStart, aimCurrent);
  aimStart = null;
  aimCurrent = null;
  state.gameStatus = "ready";
  if (direction) launch(direction);
  else syncUi();
});

app.canvas.addEventListener("pointercancel", () => {
  if (state.gameStatus !== "aiming") return;
  aimStart = null;
  aimCurrent = null;
  state.gameStatus = "ready";
  syncUi();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    launch();
  }
});

document.querySelector("#restart")!.addEventListener("click", reset);
document.querySelector("#result-restart")!.addEventListener("click", reset);

function syncUi(): void {
  stageEl.textContent = String(state.stage).padStart(2, "0");
  scoreEl.textContent = state.score.toLocaleString("ko-KR");
  ballsEl.textContent = `× ${state.ballCount}`;
  shieldEl.textContent = state.shield ? "ON" : "OFF";
  shieldEl.classList.toggle("active", state.shield);

  const messages = {
    ready: state.powerTurns > 0 ? "강화볼 준비 · 공격력 ×2" : "아래에서 위로 드래그해 발사하세요",
    aiming: "손을 떼면 발사합니다",
    volley: state.powerTurns > 0 ? "강화볼 발사 중 · 공격력 ×2" : "공이 모두 돌아올 때까지 기다리세요",
    gameOver: "벽돌이 위험선에 닿았습니다",
  } as const;
  statusEl.textContent = messages[state.gameStatus];
  statusDot.dataset.state = state.gameStatus;

  result.hidden = state.gameStatus !== "gameOver";
  if (state.gameStatus === "gameOver") resultScore.textContent = state.score.toLocaleString("ko-KR");
}

function rebuildLabels(): void {
  const signature = `${state.stage}|${state.bricks.map((brick) => `${brick.id}:${brick.hp}:${brick.row}`).join(",")}|${state.items.map((item) => `${item.id}:${item.row}`).join(",")}`;
  if (signature === boardSignature) return;
  boardSignature = signature;
  labels.removeChildren().forEach((child) => child.destroy());

  state.bricks.forEach((brick) => {
    const rect = brickRect(brick);
    const label = new Text({
      text: String(brick.hp),
      style: { fill: 0xffffff, fontFamily: "system-ui", fontSize: 14, fontWeight: "700" },
    });
    label.anchor.set(0.5);
    label.position.set(rect.x + rect.width / 2, rect.y + rect.height / 2);
    labels.addChild(label);
  });

  const itemLabel = { bomb: "B", multiball: "+1", shield: "S", power: "P" } as const;
  state.items.forEach((item) => {
    const center = itemCenter(item);
    const label = new Text({
      text: itemLabel[item.type],
      style: { fill: 0xffffff, fontFamily: "system-ui", fontSize: item.type === "multiball" ? 10 : 12, fontWeight: "800" },
    });
    label.anchor.set(0.5);
    label.position.set(center.x, center.y);
    labels.addChild(label);
  });
}

function brickColor(brick: Brick): number {
  const ratio = brick.hp / brick.maxHp;
  if (ratio > 0.7) return 0xff4d6d;
  if (ratio > 0.35) return 0xff8a4c;
  return 0x6c7cff;
}

function drawAimSegment(start: Vec2, end: Vec2, reflection: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const unit = { x: dx / length, y: dy / length };
  const dash = reflection === 0 ? 10 : 7;
  const gap = reflection === 0 ? 6 : 9;
  for (let distance = 0; distance < length; distance += dash + gap) {
    const dashEnd = Math.min(distance + dash, length);
    scene
      .moveTo(start.x + unit.x * distance, start.y + unit.y * distance)
      .lineTo(start.x + unit.x * dashEnd, start.y + unit.y * dashEnd);
  }
  scene.stroke({
    width: reflection === 0 ? 3.4 : 2.2,
    color: 0xffffff,
    alpha: [0.92, 0.44, 0.28][reflection],
  });
}

function draw(): void {
  scene.clear();
  scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill(0x091524);

  scene
    .roundRect(8, FLOOR_Y + 7, BOARD_WIDTH - 16, BOARD_HEIGHT - FLOOR_Y - 10, 11)
    .fill(0x14263d);
  scene
    .moveTo(14, FLOOR_Y + 7)
    .lineTo(BOARD_WIDTH - 14, FLOOR_Y + 7)
    .stroke({ width: 3, color: 0x365274, alpha: 0.95 });
  scene
    .roundRect(state.launchPosition.x - 19, FLOOR_Y + 4, 38, 8, 4)
    .fill({ color: 0x6c7cff, alpha: 0.75 });

  for (let x = 10; x < BOARD_WIDTH - 10; x += 16) {
    scene.moveTo(x, DANGER_Y).lineTo(Math.min(x + 8, BOARD_WIDTH - 10), DANGER_Y);
  }
  scene.stroke({ width: 1.5, color: 0xff4d6d, alpha: 0.7 });

  state.bricks.forEach((brick) => {
    const rect = brickRect(brick);
    scene.roundRect(rect.x, rect.y, rect.width, rect.height, 8).fill(brickColor(brick));
  });

  const itemColors = { bomb: 0xffc145, multiball: 0x45d5a1, shield: 0x5db7ff, power: 0xb06cff } as const;
  state.items.forEach((item) => {
    const center = itemCenter(item);
    scene.circle(center.x, center.y, 12).fill(itemColors[item.type]);
    scene.circle(center.x, center.y, 15).stroke({ width: 1, color: itemColors[item.type], alpha: 0.35 });
  });

  const queuedBalls = activeBalls.filter((ball) => ball.delay > 0).length;
  const ballColor = state.powerTurns > 0 ? 0xc58cff : 0xffffff;
  const showLaunchBall = state.gameStatus === "ready" || state.gameStatus === "aiming" || queuedBalls > 0;
  if (showLaunchBall) {
    scene.circle(state.launchPosition.x, state.launchPosition.y, 8).fill(ballColor);
    scene.circle(state.launchPosition.x, state.launchPosition.y, 13).stroke({ width: 1, color: 0x6c7cff, alpha: 0.7 });
  }

  const displayedBallCount = state.gameStatus === "volley" ? queuedBalls : state.ballCount;
  ballCounter.visible = showLaunchBall;
  ballCounter.text = `×${displayedBallCount}`;
  ballCounter.position.set(state.launchPosition.x + 16, state.launchPosition.y);

  const direction = aimStart && aimCurrent ? aimFromDrag(aimStart, aimCurrent) : null;
  if (direction) {
    traceAimPath(
      state.launchPosition,
      direction,
      { minX: BALL_RADIUS, maxX: BOARD_WIDTH - BALL_RADIUS, minY: BALL_RADIUS, maxY: FLOOR_Y },
      state.bricks.map(brickRect),
      2,
      BALL_RADIUS,
    ).forEach((segment, reflection) => {
      drawAimSegment(segment.start, segment.end, reflection);
      if (reflection < 2) scene.circle(segment.end.x, segment.end.y, 2.5).fill({ color: 0xffffff, alpha: [0.75, 0.4][reflection] });
    });
  }

  activeBalls.forEach((ball) => {
    if (ball.delay <= 0) scene.circle(ball.x, ball.y, BALL_RADIUS).fill(ballColor);
  });
  rebuildLabels();
}

function circleHitsRect(ball: ActiveBall, x: number, y: number, width: number, height: number, radius = BALL_RADIUS): boolean {
  const nearestX = Math.max(x, Math.min(ball.x, x + width));
  const nearestY = Math.max(y, Math.min(ball.y, y + height));
  return (ball.x - nearestX) ** 2 + (ball.y - nearestY) ** 2 <= radius ** 2;
}

function updateBall(ball: ActiveBall, delta: number): boolean {
  if (ball.delay > 0) {
    ball.delay -= delta;
    return false;
  }

  const steps = 2;
  for (let step = 0; step < steps; step += 1) {
    const previous = { x: ball.x, y: ball.y };
    ball.x += (ball.vx * delta) / steps;
    ball.y += (ball.vy * delta) / steps;

    if (ball.x <= BALL_RADIUS || ball.x >= BOARD_WIDTH - BALL_RADIUS) {
      ball.x = Math.max(BALL_RADIUS, Math.min(BOARD_WIDTH - BALL_RADIUS, ball.x));
      ball.vx *= -1;
    }
    if (ball.y <= BALL_RADIUS) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy);
    }

    const hitBrick = state.bricks.find((brick) => {
      const rect = brickRect(brick);
      return circleHitsRect(ball, rect.x, rect.y, rect.width, rect.height);
    });
    if (hitBrick) {
      const rect = brickRect(hitBrick);
      const cameFromSide = previous.x + BALL_RADIUS <= rect.x || previous.x - BALL_RADIUS >= rect.x + rect.width;
      ball.x = previous.x;
      ball.y = previous.y;
      if (cameFromSide) ball.vx *= -1;
      else ball.vy *= -1;
      hitBrickWithBall(state, hitBrick.id);
      boardSignature = "";
      syncUi();
      break;
    }

    const hitItem = state.items.find((item) => {
      const center = itemCenter(item);
      return circleHitsRect(ball, center.x - 12, center.y - 12, 24, 24);
    });
    if (hitItem) {
      collectItem(state, hitItem.id);
      boardSignature = "";
      syncUi();
    }
  }

  return ball.y >= FLOOR_Y;
}

function update(delta: number): void {
  if (state.gameStatus === "volley") {
    const safeDelta = Math.min(delta, 0.032);
    for (let index = activeBalls.length - 1; index >= 0; index -= 1) {
      const ball = activeBalls[index];
      const returned = updateBall(ball, safeDelta);
      if (state.gameStatus !== "volley") break;
      if (returned) {
        firstLandingX ??= ball.x;
        activeBalls.splice(index, 1);
      }
    }

    if (state.gameStatus === "volley" && activeBalls.length === 0) {
      finishVolley(state, firstLandingX ?? state.launchPosition.x);
      firstLandingX = null;
      boardSignature = "";
      syncUi();
    }
  }
  draw();
}

app.ticker.add((ticker) => update(ticker.deltaMS / 1000));
syncUi();
