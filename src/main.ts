import { Application, BlurFilter, Container, Graphics, Text } from "pixi.js";
import "./style.css";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BOMB_EFFECT_DURATION,
  BRICK_HIT_EFFECT_DURATION,
  BRICK_HEIGHT,
  CELL_HEIGHT,
  DANGER_Y,
  FLOOR_Y,
  GRID_TOP,
  GRID_COLUMNS,
  LASER_EFFECT_DURATION,
  SHIELD_REWIND_DURATION,
  aimFromDrag,
  bombEffectFrame,
  brickHitEffectFrame,
  collectItem,
  consumeLaserTriggers,
  createGame,
  finishVolley,
  hitBrickWithBall,
  laserEffectFrame,
  prepareVolley,
  resetGame,
  shieldRewindFrame,
  traceAimPath,
  type Brick,
  type Item,
  type Vec2,
} from "./game";

const GRID_GAP = 4;
const GRID_MARGIN = 12;
const CELL_WIDTH = (BOARD_WIDTH - GRID_MARGIN * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
const BALL_RADIUS = 5;
const BALL_SPEED = 600;
const BEST_SCORE_KEY = "swipe-breakout-best-score";
interface ActiveBall extends Vec2 {
  vx: number;
  vy: number;
  delay: number;
}

interface BombEffect extends Vec2 {
  elapsed: number;
}

interface LaserEffect extends Vec2 {
  elapsed: number;
}

interface ShieldRewindEffect {
  elapsed: number;
}

const state = createGame();
let bestScore = loadBestScore();
let hasNewBestScore = false;
let activeBalls: ActiveBall[] = [];
let aimStart: Vec2 | null = null;
let aimCurrent: Vec2 | null = null;
let firstLandingX: number | null = null;
let boardSignature = "";
let helpOpen = false;
let bombEffect: BombEffect | null = null;
let trapEffect: BombEffect | null = null;
let laserEffects: LaserEffect[] = [];
let shieldRewindEffect: ShieldRewindEffect | null = null;
const brickHitEffects = new Map<string, number>();

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
const effectGlow = new Graphics();
effectGlow.filters = [new BlurFilter({ strength: 10, quality: 3 })];
const labels = new Container();
const ballCounter = new Text({
  text: "×1",
  style: { fill: 0xc5d0e3, fontFamily: "system-ui", fontSize: 13, fontWeight: "700" },
});
ballCounter.anchor.set(0, 0.5);
const trapNotice = new Text({
  text: "−1",
  style: { fill: 0xff6b7f, fontFamily: "system-ui", fontSize: 18, fontWeight: "900" },
});
trapNotice.anchor.set(0.5);
trapNotice.visible = false;
const dangerLabel = new Text({
  text: "DANGER",
  style: { fill: 0xff718b, fontFamily: "system-ui", fontSize: 8, fontWeight: "800", letterSpacing: 1.5 },
});
dangerLabel.anchor.set(1, 0);
dangerLabel.position.set(BOARD_WIDTH - 12, DANGER_Y + 5);
app.stage.addChild(scene, effectGlow, labels, trapNotice, ballCounter, dangerLabel);

const stageEl = document.querySelector<HTMLElement>("#stage")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const ballsEl = document.querySelector<HTMLElement>("#balls")!;
const shieldEl = document.querySelector<HTMLElement>("#shield")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const statusDot = document.querySelector<HTMLElement>("#status-dot")!;
const result = document.querySelector<HTMLElement>("#result")!;
const resultScore = document.querySelector<HTMLElement>("#result-score")!;
const resultBestScore = document.querySelector<HTMLElement>("#result-best-score")!;
const helpButton = document.querySelector<HTMLButtonElement>("#help")!;
const helpDialog = document.querySelector<HTMLElement>("#item-help")!;
const helpCloseButton = document.querySelector<HTMLButtonElement>("#item-help-close")!;

const brickRect = (brick: Brick) => ({
  x: GRID_MARGIN + brick.column * (CELL_WIDTH + GRID_GAP),
  y: GRID_TOP + brick.row * CELL_HEIGHT,
  width: CELL_WIDTH,
  height: BRICK_HEIGHT,
});

const itemCenter = (item: Pick<Item, "row" | "column">) => ({
  x: GRID_MARGIN + item.column * (CELL_WIDTH + GRID_GAP) + CELL_WIDTH / 2,
  y: GRID_TOP + item.row * CELL_HEIGHT + BRICK_HEIGHT / 2,
});

function pullLaserEffects(): void {
  consumeLaserTriggers(state).forEach((trigger) => {
    laserEffects.push({ ...itemCenter(trigger), elapsed: 0 });
  });
}

function launch(direction: Vec2): void {
  if (state.gameStatus !== "ready") return;
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
  hasNewBestScore = false;
  activeBalls = [];
  aimStart = null;
  aimCurrent = null;
  firstLandingX = null;
  boardSignature = "";
  bombEffect = null;
  trapEffect = null;
  laserEffects = [];
  shieldRewindEffect = null;
  brickHitEffects.clear();
  setHelpOpen(false);
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
  if (helpOpen || shieldRewindEffect || state.gameStatus !== "ready") return;
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

document.querySelector("#restart")!.addEventListener("click", reset);
document.querySelector("#result-restart")!.addEventListener("click", reset);
helpButton.addEventListener("click", () => setHelpOpen(!helpOpen));
helpCloseButton.addEventListener("click", () => setHelpOpen(false));

function setHelpOpen(open: boolean): void {
  helpOpen = open;
  helpDialog.hidden = !open;
  helpButton.setAttribute("aria-expanded", String(open));
  if (open && state.gameStatus === "aiming") {
    aimStart = null;
    aimCurrent = null;
    state.gameStatus = "ready";
    syncUi();
  }
}

function loadBestScore(): number {
  try {
    const storedScore = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isFinite(storedScore) && storedScore > 0 ? Math.floor(storedScore) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  } catch {
    // 저장소를 사용할 수 없어도 현재 게임은 계속 진행합니다.
  }
}

function syncUi(): void {
  if (state.score > bestScore) {
    bestScore = state.score;
    hasNewBestScore = true;
    saveBestScore();
  }

  stageEl.textContent = String(state.stage).padStart(2, "0");
  scoreEl.textContent = state.score.toLocaleString("ko-KR");
  scoreEl.classList.toggle("new-best", hasNewBestScore);
  ballsEl.textContent = `× ${state.ballCount}`;
  shieldEl.textContent = state.shield ? "ON" : "OFF";
  shieldEl.classList.toggle("active", state.shield);

  const messages = {
    ready: state.powerTurns > 0 ? `강화볼 준비 · 공격력 ×${state.powerMultiplier}` : "공의 방향을 정하고 발사 하세요.",
    aiming: "손을 떼면 발사합니다",
    volley: state.powerTurns > 0 ? `강화볼 발사 중 · 공격력 ×${state.powerMultiplier}` : "공이 모두 돌아올 때까지 기다리세요",
    gameOver: "벽돌이 위험선에 닿았습니다",
  } as const;
  statusEl.textContent = shieldRewindEffect ? "보호막 발동 · 한 칸 되돌리는 중" : messages[state.gameStatus];
  statusDot.dataset.state = state.gameStatus;

  result.hidden = state.gameStatus !== "gameOver";
  if (state.gameStatus === "gameOver") {
    resultScore.textContent = state.score.toLocaleString("ko-KR");
    resultBestScore.textContent = bestScore.toLocaleString("ko-KR");
  }
}

function rebuildLabels(): void {
  const signature = `${state.stage}|${state.bricks.map((brick) => `${brick.id}:${brick.hp}:${brick.row}`).join(",")}|${state.items.map((item) => `${item.id}:${item.row}`).join(",")}`;
  if (signature === boardSignature) return;
  boardSignature = signature;
  labels.removeChildren().forEach((child) => child.destroy());

  state.bricks.forEach((brick) => {
    const rect = brickRect(brick);
    const text = brick.type === "laser" ? `↔${brick.hp}` : brick.type === "steel" ? "◆" : String(brick.hp);
    const label = new Text({
      text,
      style: { fill: 0xffffff, fontFamily: "system-ui", fontSize: brick.type === "normal" ? 14 : 12, fontWeight: "800" },
    });
    label.anchor.set(0.5);
    label.position.set(rect.x + rect.width / 2, rect.y + rect.height / 2);
    labels.addChild(label);
  });

  const itemLabel = { bomb: "B", multiball: "+1", shield: "S", power: "×2", power3: "×3", power4: "×4", trap: "−1" } as const;
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
  if (brick.type === "laser") return 0x10a9d4;
  if (brick.type === "steel") return 0x596579;
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
  effectGlow.clear();
  scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill(0x091524);
  const shieldFrame = shieldRewindEffect ? shieldRewindFrame(shieldRewindEffect.elapsed) : null;
  const boardOffset = shieldFrame?.offset ?? 0;
  labels.y = boardOffset;

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
    const logicalRect = brickRect(brick);
    const rect = { ...logicalRect, y: logicalRect.y + boardOffset };
    scene.roundRect(rect.x, rect.y, rect.width, rect.height, 8).fill(brickColor(brick));
    if (brick.type === "laser") {
      scene.moveTo(rect.x + 6, rect.y + rect.height / 2).lineTo(rect.x + rect.width - 6, rect.y + rect.height / 2)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
    } else if (brick.type === "steel") {
      scene.roundRect(rect.x + 3, rect.y + 3, rect.width - 6, rect.height - 6, 6)
        .stroke({ width: 2, color: 0xd7e0ec, alpha: 0.58 });
    }
  });

  const itemColors = { bomb: 0xffc145, multiball: 0x45d5a1, shield: 0x5db7ff, power: 0xb06cff, power3: 0xb06cff, power4: 0xb06cff, trap: 0xff405f } as const;
  state.items.forEach((item) => {
    const logicalCenter = itemCenter(item);
    const center = { ...logicalCenter, y: logicalCenter.y + boardOffset };
    scene.circle(center.x, center.y, 12).fill(itemColors[item.type]);
    scene.circle(center.x, center.y, 15).stroke({ width: 1, color: itemColors[item.type], alpha: 0.35 });
  });

  brickHitEffects.forEach((elapsed, brickId) => {
    const brick = state.bricks.find((candidate) => candidate.id === brickId);
    if (!brick) return;
    const frame = brickHitEffectFrame(elapsed);
    const logicalRect = brickRect(brick);
    const width = logicalRect.width * frame.scale;
    const height = logicalRect.height * frame.scale;
    const x = logicalRect.x - (width - logicalRect.width) / 2;
    const y = logicalRect.y + boardOffset - (height - logicalRect.height) / 2;
    effectGlow.roundRect(x, y, width, height, 9)
      .stroke({ width: 14, color: 0xff8a32, alpha: frame.alpha * 0.85 });
    scene.roundRect(x, y, width, height, 9)
      .stroke({ width: 3, color: 0xffc15d, alpha: frame.alpha });
  });

  if (bombEffect) {
    const frame = bombEffectFrame(bombEffect.elapsed);
    effectGlow.circle(bombEffect.x, bombEffect.y, frame.radius).stroke({ width: 20, color: 0xff8a32, alpha: frame.alpha * 0.72 });
    scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill({ color: 0xff8a32, alpha: frame.alpha * 0.055 });
    scene.circle(bombEffect.x, bombEffect.y, frame.radius).fill({ color: 0xff8a32, alpha: frame.alpha * 0.24 });
    scene.circle(bombEffect.x, bombEffect.y, frame.radius).stroke({ width: 6, color: 0xffc145, alpha: frame.alpha });
    scene.circle(bombEffect.x, bombEffect.y, frame.radius * 0.58).stroke({ width: 3, color: 0xffffff, alpha: frame.alpha * 0.85 });
  }

  if (trapEffect) {
    const frame = bombEffectFrame(trapEffect.elapsed);
    const radius = frame.radius * 0.55;
    effectGlow.circle(trapEffect.x, trapEffect.y, radius).stroke({ width: 18, color: 0xff405f, alpha: frame.alpha * 0.8 });
    scene.circle(trapEffect.x, trapEffect.y, radius).fill({ color: 0xff405f, alpha: frame.alpha * 0.12 });
    scene.circle(trapEffect.x, trapEffect.y, radius).stroke({ width: 5, color: 0xff6b7f, alpha: frame.alpha });
    trapNotice.visible = true;
    trapNotice.alpha = frame.alpha;
    trapNotice.position.set(trapEffect.x, trapEffect.y - 14 - (1 - frame.alpha) * 18);
  } else {
    trapNotice.visible = false;
  }

  laserEffects.forEach((effect) => {
    const frame = laserEffectFrame(effect.elapsed);
    const left = effect.x * frame.spread;
    const right = (BOARD_WIDTH - effect.x) * frame.spread;
    effectGlow.moveTo(effect.x - left, effect.y).lineTo(effect.x + right, effect.y)
      .stroke({ width: 32, color: 0x16cfff, alpha: frame.alpha * 0.82 });
    scene.rect(effect.x - left, effect.y - 10, left + right, 20).fill({ color: 0x11cfff, alpha: frame.alpha * 0.24 });
    scene.moveTo(effect.x - left, effect.y).lineTo(effect.x + right, effect.y)
      .stroke({ width: 16, color: 0x11bfe8, alpha: frame.alpha * 0.82 });
    scene.moveTo(effect.x - left, effect.y).lineTo(effect.x + right, effect.y)
      .stroke({ width: 4, color: 0xffffff, alpha: frame.alpha });
  });

  if (shieldFrame && shieldFrame.flash > 0) {
    effectGlow.roundRect(7, 7, BOARD_WIDTH - 14, BOARD_HEIGHT - 14, 18)
      .stroke({ width: 20, color: 0x38bfff, alpha: shieldFrame.flash * 0.95 });
    scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
      .fill({ color: 0x3fa9ff, alpha: shieldFrame.flash * 0.08 });
    scene.roundRect(7, 7, BOARD_WIDTH - 14, BOARD_HEIGHT - 14, 18)
      .stroke({ width: 5, color: 0xbcecff, alpha: shieldFrame.flash });
  }

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
      const destroyed = hitBrickWithBall(state, hitBrick.id);
      if (hitBrick.type !== "steel" && !destroyed) brickHitEffects.set(hitBrick.id, 0);
      else brickHitEffects.delete(hitBrick.id);
      pullLaserEffects();
      boardSignature = "";
      syncUi();
      break;
    }

    const hitItem = state.items.find((item) => {
      const center = itemCenter(item);
      return circleHitsRect(ball, center.x - 12, center.y - 12, 24, 24);
    });
    if (hitItem) {
      const center = itemCenter(hitItem);
      const itemType = collectItem(state, hitItem.id);
      if (itemType === "bomb") bombEffect = { ...center, elapsed: 0 };
      else if (itemType === "trap") trapEffect = { ...center, elapsed: 0 };
      pullLaserEffects();
      boardSignature = "";
      syncUi();
    }
  }

  return ball.y >= FLOOR_Y;
}

function update(delta: number): void {
  if (!helpOpen) {
    brickHitEffects.forEach((elapsed, brickId) => {
      const nextElapsed = elapsed + delta;
      if (nextElapsed >= BRICK_HIT_EFFECT_DURATION) brickHitEffects.delete(brickId);
      else brickHitEffects.set(brickId, nextElapsed);
    });
  }
  if (!helpOpen && shieldRewindEffect) {
    shieldRewindEffect.elapsed += delta;
    if (shieldRewindEffect.elapsed >= SHIELD_REWIND_DURATION) {
      shieldRewindEffect = null;
      syncUi();
    }
  }
  if (!helpOpen && bombEffect) {
    bombEffect.elapsed += delta;
    if (bombEffect.elapsed >= BOMB_EFFECT_DURATION) bombEffect = null;
  }
  if (!helpOpen && trapEffect) {
    trapEffect.elapsed += delta;
    if (trapEffect.elapsed >= BOMB_EFFECT_DURATION) trapEffect = null;
  }
  if (!helpOpen) {
    laserEffects.forEach((effect) => (effect.elapsed += delta));
    laserEffects = laserEffects.filter((effect) => effect.elapsed < LASER_EFFECT_DURATION);
  }
  if (!helpOpen && state.gameStatus === "volley") {
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
      const shieldRewound = finishVolley(state, firstLandingX ?? state.launchPosition.x);
      if (shieldRewound) shieldRewindEffect = { elapsed: 0 };
      firstLandingX = null;
      boardSignature = "";
      syncUi();
    }
  }
  draw();
}

app.ticker.add((ticker) => update(ticker.deltaMS / 1000));
syncUi();
