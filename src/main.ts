import { Application, BlurFilter, Container, Graphics, Text } from "pixi.js";
import "./style.css";
import settingsIcon from "lucide-static/icons/settings.svg?raw";
import musicIcon from "lucide-static/icons/music-2.svg?raw";
import effectIcon from "lucide-static/icons/audio-lines.svg?raw";
import volumeIcon from "lucide-static/icons/volume.svg?raw";
import restartIcon from "lucide-static/icons/rotate-ccw.svg?raw";
import closeIcon from "lucide-static/icons/x.svg?raw";
import trophyIcon from "lucide-static/icons/trophy.svg?raw";
import {
  isAllMuted,
  isBgmMuted,
  isSfxMuted,
  playSound,
  preloadAudio,
  setAllMuted,
  setBgmMuted,
  setSfxMuted,
  unlockAudio,
} from "./audio";
import { fetchTopRanking, normalizePlayerName, submitRanking, type RankingEntry } from "./ranking";
import { ObjectPool } from "./object-pool";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BLACK_HOLE_CAPTURE_RADIUS,
  BLACK_HOLE_CYCLE_DURATION,
  BLACK_HOLE_INFLUENCE_RADIUS,
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
  blackHolePullStrength,
  blackHolePresence,
  bombEffectFrame,
  brickHitEffectFrame,
  captureBallByBlackHole,
  collectItem,
  consumeLaserTriggers,
  createGame,
  finishVolley,
  hitBrickWithBall,
  laserEffectFrame,
  prepareVolley,
  relocateBlackHoles,
  resetGame,
  resolveCircleRectCollision,
  shieldRewindFrame,
  stabilizeBounce,
  traceAimPath,
  type Brick,
  type Item,
  type Vec2,
} from "./game";
import type { GameStatus } from "./game";

declare global {
  interface Window {
    resetBreakoutForDevelopment?: () => void;
  }
}

const GRID_GAP = 4;
const GRID_MARGIN = 12;
const CELL_WIDTH = (BOARD_WIDTH - GRID_MARGIN * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
const BALL_RADIUS = 5;
const BALL_SPEED = 600;
const BLACK_HOLE_PULL_ACCELERATION = 4000;
const BLACK_HOLE_MAX_SPEED = BALL_SPEED * 1.75;
const BEST_SCORE_KEY = "swipe-breakout-best-score";
const PLAYER_NAME_KEY = "swipe-breakout-player-name";
interface ActiveBall extends Vec2 {
  vx: number;
  vy: number;
  delay: number;
  bounceCount: number;
}

interface PositionedEffect extends Vec2 {
  elapsed: number;
}

interface TimedEffect {
  elapsed: number;
}

type BallExit = "landed" | "captured" | null;

void startGame().catch((error: unknown) => {
  console.error("게임 렌더러 초기화에 실패했습니다.", error);
});

async function startGame(): Promise<void> {
const state = createGame();
const ballPool = new ObjectPool<ActiveBall>(
  () => ({ x: 0, y: 0, vx: 0, vy: 0, delay: 0, bounceCount: 0 }),
  (ball) => Object.assign(ball, { x: 0, y: 0, vx: 0, vy: 0, delay: 0, bounceCount: 0 }),
);
const positionedEffectPool = new ObjectPool<PositionedEffect>(
  () => ({ x: 0, y: 0, elapsed: 0 }),
  (effect) => Object.assign(effect, { x: 0, y: 0, elapsed: 0 }),
);
const timedEffectPool = new ObjectPool<TimedEffect>(
  () => ({ elapsed: 0 }),
  (effect) => { effect.elapsed = 0; },
);
let bestScore = loadBestScore();
let hasNewBestScore = false;
const activeBalls: ActiveBall[] = [];
let aimStart: Vec2 | null = null;
let aimCurrent: Vec2 | null = null;
let firstLandingX: number | null = null;
let boardSignature = "";
let helpOpen = false;
let optionsOpen = false;
let resetConfirmOpen = false;
let rankingOpen = false;
let rankingTrigger: HTMLButtonElement | null = null;
let rankingLoaded = false;
let rankingSubmitting = false;
let rankingRequestId = 0;
let rankingPanelRequestId = 0;
let purePlayTimeMs = 0;
let blackHoleTime = 0;
let blackHoleCycle = 0;
let blackHoleStage = state.stage;
let bombEffect: PositionedEffect | null = null;
let trapEffect: PositionedEffect | null = null;
const laserEffects: PositionedEffect[] = [];
let shieldRewindEffect: TimedEffect | null = null;
const brickHitEffects = new Map<string, TimedEffect>();

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
const brickHitGlow = new Graphics();
brickHitGlow.filters = [new BlurFilter({ strength: 7, quality: 3 })];
const labels = new Container();
const labelPool = new ObjectPool<Text>(
  () => {
    const label = new Text({
      text: "",
      style: { fill: 0xffffff, fontFamily: "system-ui", fontSize: 12, fontWeight: "800" },
    });
    label.anchor.set(0.5);
    return label;
  },
  (label) => {
    label.text = "";
    label.alpha = 1;
    label.position.set(0, 0);
  },
);
const activeLabels: Text[] = [];
const itemLabels = new Map<string, Text>();
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
app.stage.addChild(scene, effectGlow, brickHitGlow, labels, trapNotice, ballCounter, dangerLabel);

const stageEl = document.querySelector<HTMLElement>("#stage")!;
const scoreEl = document.querySelector<HTMLElement>("#score")!;
const ballsEl = document.querySelector<HTMLElement>("#balls")!;
const shieldEl = document.querySelector<HTMLElement>("#shield")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const statusDot = document.querySelector<HTMLElement>("#status-dot")!;
const result = document.querySelector<HTMLElement>("#result")!;
const resultScore = document.querySelector<HTMLElement>("#result-score")!;
const resultBestScore = document.querySelector<HTMLElement>("#result-best-score")!;
const resultDuration = document.querySelector<HTMLElement>("#result-duration")!;
const appRoot = document.querySelector<HTMLElement>(".app")!;
const entryScreen = document.querySelector<HTMLElement>("#entry-screen")!;
const entryForm = document.querySelector<HTMLFormElement>("#entry-form")!;
const entryNameInput = document.querySelector<HTMLInputElement>("#entry-name")!;
const entryFeedback = document.querySelector<HTMLElement>("#entry-feedback")!;
const entryRankingButton = document.querySelector<HTMLButtonElement>("#entry-ranking")!;
const rankingButton = document.querySelector<HTMLButtonElement>("#ranking-open")!;
const rankingDialog = document.querySelector<HTMLElement>("#ranking-panel")!;
const rankingCloseButton = document.querySelector<HTMLButtonElement>("#ranking-close")!;
const rankingPanelStatus = document.querySelector<HTMLElement>("#ranking-panel-status")!;
const rankingPanelList = document.querySelector<HTMLOListElement>("#ranking-panel-list")!;
const rankingStatus = document.querySelector<HTMLElement>("#ranking-status")!;
const rankingList = document.querySelector<HTMLOListElement>("#ranking-list")!;
const rankingForm = document.querySelector<HTMLFormElement>("#ranking-form")!;
const rankingNameInput = document.querySelector<HTMLInputElement>("#ranking-name")!;
const rankingSubmitButton = document.querySelector<HTMLButtonElement>("#ranking-submit")!;
const rankingFeedback = document.querySelector<HTMLElement>("#ranking-feedback")!;
const helpButton = document.querySelector<HTMLButtonElement>("#help")!;
const helpDialog = document.querySelector<HTMLElement>("#item-help")!;
const helpCloseButton = document.querySelector<HTMLButtonElement>("#item-help-close")!;
const optionsButton = document.querySelector<HTMLButtonElement>("#options")!;
const optionsDialog = document.querySelector<HTMLElement>("#options-panel")!;
const optionsCloseButton = document.querySelector<HTMLButtonElement>("#options-close")!;
const optionsRestartButton = document.querySelector<HTMLButtonElement>("#options-restart")!;
const bgmToggleButton = document.querySelector<HTMLButtonElement>("#bgm-toggle")!;
const sfxToggleButton = document.querySelector<HTMLButtonElement>("#sfx-toggle")!;
const allAudioToggleButton = document.querySelector<HTMLButtonElement>("#all-audio-toggle")!;
const allAudioStatus = document.querySelector<HTMLElement>("#all-audio-status")!;
const resetConfirmDialog = document.querySelector<HTMLElement>("#reset-confirm")!;
const resetCancelButton = document.querySelector<HTMLButtonElement>("#reset-cancel")!;
const resetConfirmButton = document.querySelector<HTMLButtonElement>("#reset-confirm-button")!;

const iconMarkup: Record<string, string> = {
  settings: settingsIcon,
  "music-2": musicIcon,
  "audio-lines": effectIcon,
  volume: volumeIcon,
  "rotate-ccw": restartIcon,
  x: closeIcon,
  trophy: trophyIcon,
};

document.querySelectorAll<HTMLElement>("[data-icon]").forEach((icon) => {
  icon.innerHTML = iconMarkup[icon.dataset.icon ?? ""] ?? "";
});

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
  const triggers = consumeLaserTriggers(state);
  if (triggers.length > 0) playSound("laser");
  triggers.forEach((trigger) => {
    laserEffects.push(Object.assign(positionedEffectPool.acquire(), itemCenter(trigger), { elapsed: 0 }));
  });
}

function launch(direction: Vec2): void {
  if (state.gameStatus !== "ready") return;
  const count = prepareVolley(state);
  firstLandingX = null;
  playSound("launch", { playbackRate: 1.08 });
  for (let index = 0; index < count; index += 1) {
    activeBalls.push(Object.assign(ballPool.acquire(), state.launchPosition, {
      vx: direction.x * BALL_SPEED,
      vy: direction.y * BALL_SPEED,
      delay: index * 0.075,
      bounceCount: 0,
    }));
  }
  syncUi();
}

function reset(): void {
  setResetConfirmOpen(false);
  setRankingOpen(false);
  ballPool.releaseAll(activeBalls);
  if (bombEffect) positionedEffectPool.release(bombEffect);
  if (trapEffect) positionedEffectPool.release(trapEffect);
  positionedEffectPool.releaseAll(laserEffects);
  if (shieldRewindEffect) timedEffectPool.release(shieldRewindEffect);
  brickHitEffects.forEach((effect) => timedEffectPool.release(effect));
  resetGame(state);
  hasNewBestScore = false;
  aimStart = null;
  aimCurrent = null;
  firstLandingX = null;
  boardSignature = "";
  blackHoleTime = 0;
  blackHoleCycle = 0;
  blackHoleStage = state.stage;
  bombEffect = null;
  trapEffect = null;
  shieldRewindEffect = null;
  brickHitEffects.clear();
  rankingLoaded = false;
  rankingSubmitting = false;
  rankingRequestId += 1;
  rankingPanelRequestId += 1;
  purePlayTimeMs = 0;
  rankingSubmitButton.disabled = false;
  rankingFeedback.textContent = "";
  setHelpOpen(false);
  setOptionsOpen(false);
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
  if (helpOpen || optionsOpen || resetConfirmOpen || shieldRewindEffect || state.gameStatus !== "ready") return;
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

document.querySelector("#result-restart")!.addEventListener("click", reset);
entryNameInput.value = loadPlayerName();
if (["127.0.0.1", "localhost"].includes(location.hostname)) {
  window.resetBreakoutForDevelopment = resetForDevelopment;
}
entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = normalizePlayerName(entryNameInput.value);
  if (!name) {
    entryFeedback.textContent = "닉네임을 입력하세요.";
    entryNameInput.focus();
    return;
  }
  savePlayerName(name);
  entryNameInput.value = name;
  rankingNameInput.value = name;
  entryFeedback.textContent = "";
  entryScreen.hidden = true;
  appRoot.hidden = false;
  syncUi();
});
entryRankingButton.addEventListener("click", () => setRankingOpen(true, entryRankingButton));
rankingButton.addEventListener("click", () => setRankingOpen(!rankingOpen, rankingButton));
rankingCloseButton.addEventListener("click", () => setRankingOpen(false));
rankingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitCurrentScore();
});
helpButton.addEventListener("click", () => {
  if (!resetConfirmOpen && !optionsOpen && !rankingOpen) setHelpOpen(!helpOpen);
});
helpCloseButton.addEventListener("click", () => setHelpOpen(false));
optionsButton.addEventListener("click", () => {
  if (!resetConfirmOpen && !rankingOpen) setOptionsOpen(!optionsOpen);
});
optionsCloseButton.addEventListener("click", () => setOptionsOpen(false));
optionsRestartButton.addEventListener("click", () => {
  setOptionsOpen(false);
  setResetConfirmOpen(true);
});
bgmToggleButton.addEventListener("click", () => {
  setBgmMuted(!isBgmMuted());
  syncAudioOptions();
  playSound("ui_click");
});
sfxToggleButton.addEventListener("click", () => {
  const nextMuted = !isSfxMuted();
  setSfxMuted(nextMuted);
  syncAudioOptions();
  if (!nextMuted && !isAllMuted()) playSound("ui_click");
});
allAudioToggleButton.addEventListener("click", () => {
  const nextMuted = !isAllMuted();
  setAllMuted(nextMuted);
  syncAudioOptions();
  if (!nextMuted && !isSfxMuted()) playSound("ui_click");
});
resetCancelButton.addEventListener("click", () => setResetConfirmOpen(false));
resetConfirmButton.addEventListener("click", reset);
document.querySelectorAll<HTMLButtonElement>("button:not([data-audio-control])").forEach((button) => {
  button.addEventListener("click", () => playSound("ui_click"));
});
document.addEventListener("pointerdown", () => void unlockAudio(), { once: true });

function syncAudioOptions(): void {
  const bgmMuted = isBgmMuted();
  const sfxMuted = isSfxMuted();
  const allMuted = isAllMuted();
  allAudioStatus.textContent = allMuted ? "모든 소리를 끕니다" : "개별 설정 유지";
  bgmToggleButton.setAttribute("aria-checked", String(!(allMuted || bgmMuted)));
  sfxToggleButton.setAttribute("aria-checked", String(!(allMuted || sfxMuted)));
  allAudioToggleButton.setAttribute("aria-checked", String(!allMuted));
}

function setRankingOpen(open: boolean, trigger?: HTMLButtonElement): void {
  const wasOpen = rankingOpen;
  if (open && trigger) rankingTrigger = trigger;
  rankingOpen = open;
  rankingDialog.hidden = !open;
  entryRankingButton.setAttribute("aria-expanded", String(open));
  rankingButton.setAttribute("aria-expanded", String(open));
  if (open) {
    setHelpOpen(false);
    setOptionsOpen(false);
    if (state.gameStatus === "aiming") {
      aimStart = null;
      aimCurrent = null;
      state.gameStatus = "ready";
      syncUi();
    }
    rankingCloseButton.focus();
    void loadRankingPanel();
  } else {
    rankingPanelRequestId += 1;
    if (wasOpen) (rankingTrigger ?? rankingButton).focus();
    rankingTrigger = null;
  }
  if (wasOpen !== open) playSound("ui_panel", { playbackRate: open ? 1 : 0.9 });
}

function setResetConfirmOpen(open: boolean): void {
  const wasOpen = resetConfirmOpen;
  resetConfirmOpen = open;
  resetConfirmDialog.hidden = !open;
  if (open) {
    setHelpOpen(false);
    setOptionsOpen(false);
    setRankingOpen(false);
    if (state.gameStatus === "aiming") {
      aimStart = null;
      aimCurrent = null;
      state.gameStatus = "ready";
      syncUi();
    }
    resetCancelButton.focus();
  } else if (wasOpen) {
    optionsButton.focus();
  }
  if (wasOpen !== open) playSound("ui_panel", { playbackRate: open ? 1 : 0.9 });
}

function setHelpOpen(open: boolean): void {
  const wasOpen = helpOpen;
  helpOpen = open;
  helpDialog.hidden = !open;
  helpButton.setAttribute("aria-expanded", String(open));
  if (open) {
    setOptionsOpen(false);
    setRankingOpen(false);
  }
  if (open && state.gameStatus === "aiming") {
    aimStart = null;
    aimCurrent = null;
    state.gameStatus = "ready";
    syncUi();
  }
  if (wasOpen !== open) playSound("ui_panel", { playbackRate: open ? 1 : 0.9 });
}

function setOptionsOpen(open: boolean): void {
  const wasOpen = optionsOpen;
  optionsOpen = open;
  optionsDialog.hidden = !open;
  optionsButton.setAttribute("aria-expanded", String(open));
  if (open) {
    setHelpOpen(false);
    setRankingOpen(false);
    syncAudioOptions();
    optionsCloseButton.focus();
  } else if (wasOpen) {
    optionsButton.focus();
  }
  if (wasOpen !== open) playSound("ui_panel", { playbackRate: open ? 1 : 0.9 });
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

function loadPlayerName(): string {
  try {
    return normalizePlayerName(localStorage.getItem(PLAYER_NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

function savePlayerName(name: string): void {
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {
    // 저장소를 사용할 수 없어도 현재 게임은 계속 진행합니다.
  }
}

function resetForDevelopment(): void {
  if (!["127.0.0.1", "localhost"].includes(location.hostname)) return;
  try {
    localStorage.removeItem(BEST_SCORE_KEY);
    localStorage.removeItem(PLAYER_NAME_KEY);
  } catch {
    // 저장소를 사용할 수 없어도 페이지를 다시 불러옵니다.
  }
  location.reload();
}

function formatPlayTime(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return "기록 없음";
  const centiseconds = Math.floor(durationMs / 10);
  const seconds = Math.floor(centiseconds / 100);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function renderRanking(entries: RankingEntry[], list: HTMLOListElement): void {
  list.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "ranking-empty";
    empty.textContent = "아직 등록된 기록이 없습니다.";
    list.append(empty);
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("li");
    const rank = document.createElement("span");
    const name = document.createElement("strong");
    const score = document.createElement("span");
    rank.className = "ranking-rank";
    name.className = "ranking-name";
    score.className = "ranking-score";
    rank.textContent = String(entry.rank).padStart(2, "0");
    name.textContent = entry.name;
    score.textContent = `${entry.score.toLocaleString("ko-KR")} · Lv.${entry.stage} · ${formatPlayTime(entry.durationMs)}`;
    row.append(rank, name, score);
    list.append(row);
  });
}

async function loadRanking(): Promise<void> {
  const requestId = ++rankingRequestId;
  rankingStatus.textContent = "불러오는 중";
  rankingList.replaceChildren();
  const loading = document.createElement("li");
  loading.className = "ranking-empty";
  loading.textContent = "랭킹을 불러오는 중입니다.";
  rankingList.append(loading);

  const entries = await fetchTopRanking(10);
  if (requestId !== rankingRequestId) return;
  if (entries === null) {
    rankingStatus.textContent = "연결 안 됨";
    rankingList.replaceChildren();
    const unavailable = document.createElement("li");
    unavailable.className = "ranking-empty";
    unavailable.textContent = "랭킹 서버에 연결할 수 없습니다.";
    rankingList.append(unavailable);
    return;
  }
  rankingStatus.textContent = entries.length > 0 ? `상위 ${entries.length}명` : "기록 없음";
  renderRanking(entries, rankingList);
}

async function loadRankingPanel(): Promise<void> {
  const requestId = ++rankingPanelRequestId;
  rankingPanelStatus.textContent = "불러오는 중";
  rankingPanelList.replaceChildren();
  const loading = document.createElement("li");
  loading.className = "ranking-empty";
  loading.textContent = "랭킹을 불러오는 중입니다.";
  rankingPanelList.append(loading);

  const entries = await fetchTopRanking(30);
  if (requestId !== rankingPanelRequestId || !rankingOpen) return;
  if (entries === null) {
    rankingPanelStatus.textContent = "연결 안 됨";
    rankingPanelList.replaceChildren();
    const unavailable = document.createElement("li");
    unavailable.className = "ranking-empty";
    unavailable.textContent = "랭킹 서버에 연결할 수 없습니다.";
    rankingPanelList.append(unavailable);
    return;
  }
  rankingPanelStatus.textContent = entries.length > 0 ? `${entries.length}명` : "기록 없음";
  renderRanking(entries, rankingPanelList);
}

async function submitCurrentScore(): Promise<void> {
  if (rankingSubmitting) return;
  const name = normalizePlayerName(rankingNameInput.value);
  if (!name) {
    rankingFeedback.textContent = "닉네임을 입력하세요.";
    rankingNameInput.focus();
    return;
  }
  if (state.score < 1) {
    rankingFeedback.textContent = "등록할 점수가 없습니다.";
    return;
  }

  savePlayerName(name);
  rankingNameInput.value = name;
  rankingSubmitting = true;
  rankingSubmitButton.disabled = true;
  rankingFeedback.textContent = "등록 중...";
  const requestId = ++rankingRequestId;
  const response = await submitRanking({
    name,
    score: state.score,
    stage: state.stage,
    durationMs: Math.max(0, Math.round(purePlayTimeMs)),
  });
  if (requestId !== rankingRequestId || state.gameStatus !== "gameOver") return;

  rankingSubmitting = false;
  rankingSubmitButton.disabled = false;
  if (!response) {
    rankingFeedback.textContent = "랭킹 서버에 연결할 수 없습니다.";
    return;
  }
  rankingFeedback.textContent = response.ranked
    ? `${response.rank}위로 등록되었습니다.`
    : (response.message ?? "상위 랭킹에 들지 못했습니다.");
  await loadRanking();
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
    resultDuration.textContent = formatPlayTime(Math.round(purePlayTimeMs));
    if (!rankingLoaded) {
      rankingLoaded = true;
      rankingNameInput.value = loadPlayerName();
      rankingFeedback.textContent = "";
      void loadRanking();
    }
  }
}

function rebuildLabels(): void {
  const signature = `${state.stage}|${state.bricks.map((brick) => `${brick.id}:${brick.hp}:${brick.row}`).join(",")}|${state.items.map((item) => `${item.id}:${item.row}:${item.column}:${item.charges ?? ""}`).join(",")}`;
  if (signature === boardSignature) return;
  boardSignature = signature;
  labels.removeChildren();
  labelPool.releaseAll(activeLabels);
  itemLabels.clear();

  state.bricks.forEach((brick) => {
    const rect = brickRect(brick);
    const text = brick.type === "laser" ? `↔${brick.hp}` : brick.type === "steel" ? "◆" : String(brick.hp);
    const label = labelPool.acquire();
    label.text = text;
    label.style.fontSize = brick.type === "normal" ? 14 : 12;
    label.position.set(rect.x + rect.width / 2, rect.y + rect.height / 2);
    labels.addChild(label);
    activeLabels.push(label);
  });

  const itemLabel = { bomb: "B", multiball: "+1", shield: "S", power: "×2", power3: "×3", power4: "×4", trap: "−1" } as const;
  state.items.forEach((item) => {
    const center = itemCenter(item);
    const label = labelPool.acquire();
    label.text = item.type === "blackhole" ? String(item.charges ?? 1) : itemLabel[item.type];
    label.style.fontSize = item.type === "multiball" || item.type === "blackhole" ? 10 : 12;
    label.position.set(center.x, center.y);
    labels.addChild(label);
    activeLabels.push(label);
    itemLabels.set(item.id, label);
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
  brickHitGlow.clear();
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
    if (item.type === "blackhole") {
      const presence = blackHolePresence(blackHoleTime);
      const pulse = (Math.sin(blackHoleTime * 5) + 1) / 2;
      const label = itemLabels.get(item.id);
      if (label) label.alpha = presence;
      if (presence <= 0) return;

      effectGlow.ellipse(center.x, center.y, 22 + pulse * 2, 7 + pulse * 0.7)
        .stroke({ width: 12, color: 0xe55216, alpha: presence * 0.48 });
      effectGlow.circle(center.x, center.y, BLACK_HOLE_INFLUENCE_RADIUS)
        .stroke({ width: 8, color: 0xd9470e, alpha: presence * 0.08 });
      scene.ellipse(center.x, center.y, 21 + pulse * 1.5, 6 + pulse * 0.6)
        .stroke({ width: 2.5, color: 0xff6a19, alpha: presence * 0.92 });
      scene.circle(center.x, center.y, 17).fill({ color: 0xa92d08, alpha: presence * 0.74 });
      scene.circle(center.x, center.y, 13).fill({ color: 0x010101, alpha: presence });
      scene.circle(center.x, center.y, 15 + pulse * 2)
        .stroke({ width: 2, color: 0xf05a16, alpha: presence * 0.9 });
      for (let orbit = 0; orbit < 2; orbit += 1) {
        const angle = blackHoleTime * (2.3 + orbit * 0.45) + orbit * Math.PI;
        const radius = 20 + orbit * 4;
        scene.circle(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, 2.2 - orbit * 0.35)
          .fill({ color: 0xff8a32, alpha: presence * (0.9 - orbit * 0.2) });
      }
      return;
    }
    scene.circle(center.x, center.y, 12).fill(itemColors[item.type]);
    scene.circle(center.x, center.y, 15).stroke({ width: 1, color: itemColors[item.type], alpha: 0.35 });
  });

  brickHitEffects.forEach((effect, brickId) => {
    const brick = state.bricks.find((candidate) => candidate.id === brickId);
    if (!brick) return;
    const frame = brickHitEffectFrame(effect.elapsed);
    const logicalRect = brickRect(brick);
    const width = logicalRect.width * frame.scale;
    const height = logicalRect.height * frame.scale;
    const x = logicalRect.x - (width - logicalRect.width) / 2;
    const y = logicalRect.y + boardOffset - (height - logicalRect.height) / 2;
    brickHitGlow.roundRect(x, y, width, height, 9)
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

  let queuedBalls = 0;
  activeBalls.forEach((ball) => {
    if (ball.delay > 0) queuedBalls += 1;
  });
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

function applyBlackHolePull(ball: ActiveBall, delta: number): boolean {
  const presence = blackHolePresence(blackHoleTime);
  if (presence <= 0) return false;

  let nearest: { item: Item; center: Vec2; distance: number } | null = null;
  state.items.forEach((item) => {
    if (item.type !== "blackhole") return;
    const center = itemCenter(item);
    const distance = Math.hypot(center.x - ball.x, center.y - ball.y);
    if (distance <= BLACK_HOLE_INFLUENCE_RADIUS && (!nearest || distance < nearest.distance)) {
      nearest = { item, center, distance };
    }
  });
  if (!nearest) return false;

  const target = nearest as { item: Item; center: Vec2; distance: number };
  if (target.distance <= BLACK_HOLE_CAPTURE_RADIUS && presence >= 0.7) {
    const remaining = captureBallByBlackHole(state, target.item.id);
    if (remaining !== null) {
      playSound("blackhole_capture");
      boardSignature = "";
      syncUi();
      return true;
    }
  }

  const acceleration = BLACK_HOLE_PULL_ACCELERATION * blackHolePullStrength(target.distance) * presence;
  if (target.distance > 0) {
    ball.vx += ((target.center.x - ball.x) / target.distance) * acceleration * delta;
    ball.vy += ((target.center.y - ball.y) / target.distance) * acceleration * delta;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > BLACK_HOLE_MAX_SPEED) {
      ball.vx = (ball.vx / speed) * BLACK_HOLE_MAX_SPEED;
      ball.vy = (ball.vy / speed) * BLACK_HOLE_MAX_SPEED;
    }
  }
  return false;
}

function updateBall(ball: ActiveBall, delta: number): BallExit {
  if (ball.delay > 0) {
    ball.delay -= delta;
    return null;
  }

  const steps = 2;
  for (let step = 0; step < steps; step += 1) {
    if (applyBlackHolePull(ball, delta / steps)) return "captured";
    ball.x += (ball.vx * delta) / steps;
    ball.y += (ball.vy * delta) / steps;

    let bounced = false;
    if (ball.x <= BALL_RADIUS || ball.x >= BOARD_WIDTH - BALL_RADIUS) {
      ball.x = Math.max(BALL_RADIUS, Math.min(BOARD_WIDTH - BALL_RADIUS, ball.x));
      ball.vx *= -1;
      bounced = true;
    }
    if (ball.y <= BALL_RADIUS) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy);
      bounced = true;
    }
    if (bounced) {
      ball.bounceCount += 1;
      const velocity = stabilizeBounce({ x: ball.vx, y: ball.vy }, ball.bounceCount);
      ball.vx = velocity.x;
      ball.vy = velocity.y;
    }

    const hitBrick = state.bricks.find((brick) => {
      const rect = brickRect(brick);
      return circleHitsRect(ball, rect.x, rect.y, rect.width, rect.height);
    });
    if (hitBrick) {
      const rect = brickRect(hitBrick);
      const collision = resolveCircleRectCollision(ball, { x: ball.vx, y: ball.vy }, rect, BALL_RADIUS)!;
      ball.x = collision.position.x;
      ball.y = collision.position.y;
      ball.bounceCount = hitBrick.type === "steel" ? ball.bounceCount + 1 : 0;
      const velocity = stabilizeBounce(collision.velocity, ball.bounceCount);
      ball.vx = velocity.x;
      ball.vy = velocity.y;
      const destroyed = hitBrickWithBall(state, hitBrick.id);
      if (hitBrick.type === "steel") playSound("steel_hit");
      else playSound("brick_hit", { playbackRate: destroyed ? 1.06 : 1 });
      const hitEffect = brickHitEffects.get(hitBrick.id);
      if (hitBrick.type !== "steel" && !destroyed) {
        if (hitEffect) hitEffect.elapsed = 0;
        else brickHitEffects.set(hitBrick.id, timedEffectPool.acquire());
      } else if (hitEffect) {
        brickHitEffects.delete(hitBrick.id);
        timedEffectPool.release(hitEffect);
      }
      pullLaserEffects();
      boardSignature = "";
      syncUi();
      break;
    }

    const hitItem = state.items.find((item) => {
      const center = itemCenter(item);
      return item.type !== "blackhole" && circleHitsRect(ball, center.x - 12, center.y - 12, 24, 24);
    });
    if (hitItem) {
      const center = itemCenter(hitItem);
      const itemType = collectItem(state, hitItem.id);
      if (itemType) ball.bounceCount = 0;
      if (itemType === "bomb") {
        playSound("bomb");
        if (bombEffect) positionedEffectPool.release(bombEffect);
        bombEffect = Object.assign(positionedEffectPool.acquire(), center, { elapsed: 0 });
      } else if (itemType === "trap") {
        playSound("trap");
        if (trapEffect) positionedEffectPool.release(trapEffect);
        trapEffect = Object.assign(positionedEffectPool.acquire(), center, { elapsed: 0 });
      } else if (itemType) {
        const playbackRate = itemType === "multiball" ? 1.08 : itemType === "shield" ? 0.94 : 1;
        playSound("item_collect", { playbackRate });
      }
      pullLaserEffects();
      boardSignature = "";
      syncUi();
    }
  }

  return ball.y >= FLOOR_Y ? "landed" : null;
}

function update(delta: number): void {
  const paused = helpOpen || optionsOpen || resetConfirmOpen || rankingOpen;
  if (!paused && (state.gameStatus === "aiming" || state.gameStatus === "volley")) {
    purePlayTimeMs += Math.min(delta, 0.032) * 1000;
  }
  if (!paused) {
    brickHitEffects.forEach((effect, brickId) => {
      effect.elapsed += delta;
      if (effect.elapsed >= BRICK_HIT_EFFECT_DURATION) {
        brickHitEffects.delete(brickId);
        timedEffectPool.release(effect);
      }
    });
  }
  if (!paused && shieldRewindEffect) {
    shieldRewindEffect.elapsed += delta;
    if (shieldRewindEffect.elapsed >= SHIELD_REWIND_DURATION) {
      timedEffectPool.release(shieldRewindEffect);
      shieldRewindEffect = null;
      syncUi();
    }
  }
  if (!paused && bombEffect) {
    bombEffect.elapsed += delta;
    if (bombEffect.elapsed >= BOMB_EFFECT_DURATION) {
      positionedEffectPool.release(bombEffect);
      bombEffect = null;
    }
  }
  if (!paused && trapEffect) {
    trapEffect.elapsed += delta;
    if (trapEffect.elapsed >= BOMB_EFFECT_DURATION) {
      positionedEffectPool.release(trapEffect);
      trapEffect = null;
    }
  }
  if (!paused) {
    for (let index = laserEffects.length - 1; index >= 0; index -= 1) {
      const effect = laserEffects[index];
      effect.elapsed += delta;
      if (effect.elapsed >= LASER_EFFECT_DURATION) {
        laserEffects.splice(index, 1);
        positionedEffectPool.release(effect);
      }
    }
  }
  if (!paused && state.gameStatus !== "gameOver") {
    if (blackHoleStage !== state.stage) {
      blackHoleStage = state.stage;
      blackHoleTime = 0;
      blackHoleCycle = 0;
    } else {
      blackHoleTime += delta;
      const nextCycle = Math.floor(blackHoleTime / BLACK_HOLE_CYCLE_DURATION);
      if (nextCycle > blackHoleCycle) {
        blackHoleCycle = nextCycle;
        if (relocateBlackHoles(state, blackHoleCycle)) boardSignature = "";
      }
    }
  }
  if (!paused && state.gameStatus === "volley") {
    const safeDelta = Math.min(delta, 0.032);
    for (let index = activeBalls.length - 1; index >= 0; index -= 1) {
      const ball = activeBalls[index];
      const exit = updateBall(ball, safeDelta);
      if (state.gameStatus !== "volley") break;
      if (exit) {
        if (exit === "landed") firstLandingX ??= ball.x;
        activeBalls.splice(index, 1);
        ballPool.release(ball);
      }
    }

    if (state.gameStatus === "volley" && activeBalls.length === 0) {
      const previousStage = state.stage;
      const shieldRewound = finishVolley(state, firstLandingX ?? state.launchPosition.x);
      if (shieldRewound) {
        shieldRewindEffect = timedEffectPool.acquire();
        playSound("shield_rewind");
      } else if (state.stage > previousStage) {
        playSound("stage_clear");
      } else if ((state.gameStatus as GameStatus) === "gameOver") {
        playSound("game_over");
      }
      firstLandingX = null;
      boardSignature = "";
      syncUi();
    }
  }
  draw();
}

if (["127.0.0.1", "localhost"].includes(location.hostname) && location.search === "?bounce-repro") {
  Object.assign(state, {
    stage: 7,
    score: 12250,
    ballCount: 30,
    bricks: [
      { id: "repro-normal", row: 4, column: 0, hp: 5, maxHp: 8, type: "normal" },
      { id: "repro-steel", row: 3, column: 5, hp: 0, maxHp: 0, type: "steel" },
    ],
    items: [],
    gameStatus: "volley",
    powerTurns: 2,
    powerMultiplier: 2,
  });
  const slope = (GRID_TOP + 3 * CELL_HEIGHT - BALL_RADIUS * 2) / (BOARD_WIDTH - BALL_RADIUS * 2);
  const vx = BALL_SPEED / Math.hypot(1, slope);
  for (let index = 0; index < state.ballCount; index += 1) {
    activeBalls.push(Object.assign(ballPool.acquire(), {
      x: 121,
      y: BALL_RADIUS + 0.01,
      vx,
      vy: vx * slope,
      delay: index * 0.075,
      bounceCount: 0,
    }));
  }
  window.setTimeout(() => location.reload(), 7000);
}

app.ticker.add((ticker) => update(ticker.deltaMS / 1000));
syncAudioOptions();
void preloadAudio();
syncUi();
}
