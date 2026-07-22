import { Application, BlurFilter, Container, Graphics, Text } from "pixi.js";
import "./style.css";
import settingsIcon from "lucide-static/icons/settings.svg?raw";
import musicIcon from "lucide-static/icons/music-2.svg?raw";
import effectIcon from "lucide-static/icons/audio-lines.svg?raw";
import volumeIcon from "lucide-static/icons/volume.svg?raw";
import restartIcon from "lucide-static/icons/rotate-ccw.svg?raw";
import homeIcon from "lucide-static/icons/house.svg?raw";
import closeIcon from "lucide-static/icons/x.svg?raw";
import trophyIcon from "lucide-static/icons/trophy.svg?raw";
import gaugeIcon from "lucide-static/icons/gauge.svg?raw";
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
import { estimateRankingPosition, fetchTopRanking, normalizePlayerName, submitRanking, type RankingEntry } from "./ranking";
import { ObjectPool } from "./object-pool";
import { FPS_SAMPLE_INTERVAL_MS, formatFps, getFpsLevel } from "./fps-monitor";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BLACK_HOLE_CAPTURE_RADIUS,
  BLACK_HOLE_CLEAR_FADE_DURATION,
  BLACK_HOLE_CYCLE_DURATION,
  BLACK_HOLE_INFLUENCE_RADIUS,
  BOMB_EFFECT_DURATION,
  BRICK_HIT_EFFECT_DURATION,
  BRICK_HEIGHT,
  CELL_HEIGHT,
  DANGER_ROW,
  DANGER_Y,
  FLOOR_Y,
  GRID_TOP,
  GRID_COLUMNS,
  LASER_EFFECT_DURATION,
  SHIELD_REWIND_DURATION,
  aimFromDrag,
  blackHoleClearFade,
  blackHoleDeflectionAngle,
  blackHolePullStrength,
  blackHolePresence,
  bombEffectFrame,
  brickHitEffectFrame,
  captureBallByBlackHole,
  acceptUltimateReward,
  collectItem,
  consumeLaserTriggers,
  createGame,
  discardUltimateReward,
  finishVolley,
  hitBrickWithBall,
  isGrowthUltimate,
  laserEffectFrame,
  maxBallsForStage,
  orbitalLaserStartColumn,
  prepareVolley,
  relocateBlackHoles,
  resetGame,
  resolveUltimateHits,
  resolveCircleRectCollision,
  shieldRewindFrame,
  stabilizeBounce,
  traceAimPath,
  ultimateItemLevel,
  ultimateItemType,
  useUltimateItem,
  volleySpeedMultiplier,
  type Brick,
  type FieldItem,
  type GameState,
  type UltimateActivation,
  type UltimateItemType,
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
const FPS_VISIBLE_KEY = "swipe-breakout-fps-visible";
const ULTIMATE_EFFECT_DURATIONS: Record<UltimateItemType, number> = {
  antimatter: 1.05,
  orbitalLaser: 0.95,
  chainLightning: 1.05,
  meteorImpact: 1.15,
  blackHoleCollapse: 1.3,
  crossfire: 1.05,
  fusionChain: 1.25,
  missileBarrage: 1.3,
};
const ANTIMATTER_IMPACT_PROGRESS = 0.4;
const ORBITAL_LASER_IMPACT_PROGRESS = 0.34;
const CHAIN_LIGHTNING_REVEAL_RATE = 2.4;
const METEOR_IMPACT_PROGRESS = 0.38;
const BLACK_HOLE_IMPACT_PROGRESS = 0.72;
const CROSSFIRE_IMPACT_PROGRESS = 0.4;
const FUSION_IGNITION_SPAN = 0.62;
const FUSION_IMPACT_OFFSET = 0.06;
const MISSILE_LAUNCH_SPAN = 0.32;
const MISSILE_LOCAL_DURATION = 0.62;
const MISSILE_IMPACT_LOCAL_PROGRESS = 0.76;
const ULTIMATE_RESULT_DELAY = 0.35;
const MULTIBALL_TRAIL_DISTANCE = BALL_RADIUS * 2 + 2;
interface ActiveBall extends Vec2 {
  vx: number;
  vy: number;
  delay: number;
  bounceCount: number;
  blackHoleId: string | null;
}

interface PositionedEffect extends Vec2 {
  elapsed: number;
}

interface TimedEffect {
  elapsed: number;
}

interface UltimateEffect extends PositionedEffect {
  type: UltimateItemType;
  targets: Vec2[];
  activation: UltimateActivation;
}

interface DebugSnapshot {
  bricks: Brick[];
  score: number;
  stageScore: number;
  stageUltimateUseCount: number;
  gameStatus: GameStatus;
  ultimateInventory: GameState["ultimateInventory"];
  pendingUltimateReward: GameState["pendingUltimateReward"];
  stageResult: GameState["stageResult"];
  pendingLaserTriggers: GameState["pendingLaserTriggers"];
}

type BallExit = "landed" | "captured" | null;

void startGame().catch((error: unknown) => {
  console.error("게임 렌더러 초기화에 실패했습니다.", error);
});

async function startGame(): Promise<void> {
const state = createGame();
const ballPool = new ObjectPool<ActiveBall>(
  () => ({ x: 0, y: 0, vx: 0, vy: 0, delay: 0, bounceCount: 0, blackHoleId: null }),
  (ball) => Object.assign(ball, { x: 0, y: 0, vx: 0, vy: 0, delay: 0, bounceCount: 0, blackHoleId: null }),
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
let rankingSubmitted = false;
let rankingRequestId = 0;
let rankingPanelRequestId = 0;
let rewardReplacementOpen = false;
let selectedUltimateSlot: number | null = null;
let debugUltimateActive = false;
let debugSnapshot: DebugSnapshot | null = null;
let purePlayTimeMs = 0;
let fpsVisible = loadFpsVisibility();
let fpsSampleElapsedMs = 0;
let lastClearedStage = 0;
let lastClearedScore = 0;
let lastClearedDurationMs = 0;
let challengeAbandoned = false;
let resetConfirmAction: "reset" | "exit" | "home" | "abandon" = "reset";
let blackHoleTime = 0;
let blackHoleCycle = 0;
let blackHoleStage = state.stage;
let blackHoleClearFadeTime = 0;
let bombEffect: PositionedEffect | null = null;
let trapEffect: PositionedEffect | null = null;
let ultimateEffect: UltimateEffect | null = null;
let ultimateResultDelay = 0;
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
const boardBackground = new Graphics().rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill(0x091524);
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
    label.visible = true;
    label.rotation = 0;
    label.scale.set(1);
    label.position.set(0, 0);
  },
);
const activeLabels: Text[] = [];
const brickLabels = new Map<string, Text>();
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
app.stage.addChild(boardBackground, effectGlow, scene, brickHitGlow, labels, trapNotice, ballCounter, dangerLabel);

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
const resultExitButton = document.querySelector<HTMLButtonElement>("#result-exit")!;
const appRoot = document.querySelector<HTMLElement>(".app")!;
const entryScreen = document.querySelector<HTMLElement>("#entry-screen")!;
const entryForm = document.querySelector<HTMLFormElement>("#entry-form")!;
const entryNameInput = document.querySelector<HTMLInputElement>("#entry-name")!;
const entryFeedback = document.querySelector<HTMLElement>("#entry-feedback")!;
const entryRankingButton = document.querySelector<HTMLButtonElement>("#entry-ranking")!;
const entryAudioToggleButton = document.querySelector<HTMLButtonElement>("#entry-audio-toggle")!;
const entryAudioStatus = document.querySelector<HTMLElement>("#entry-audio-status")!;
const rankingButton = document.querySelector<HTMLButtonElement>("#ranking-open")!;
const rankingDialog = document.querySelector<HTMLElement>("#ranking-panel")!;
const rankingCloseButton = document.querySelector<HTMLButtonElement>("#ranking-close")!;
const rankingPanelStatus = document.querySelector<HTMLElement>("#ranking-panel-status")!;
const rankingPanelList = document.querySelector<HTMLOListElement>("#ranking-panel-list")!;
const rankingStatus = document.querySelector<HTMLElement>("#ranking-status")!;
const rankingList = document.querySelector<HTMLOListElement>("#ranking-list")!;
const rankingPrediction = document.querySelector<HTMLElement>("#ranking-prediction")!;
const rankingForm = document.querySelector<HTMLFormElement>("#ranking-form")!;
const rankingNameInput = document.querySelector<HTMLInputElement>("#ranking-name")!;
const rankingSubmitButton = document.querySelector<HTMLButtonElement>("#ranking-submit")!;
const rankingFeedback = document.querySelector<HTMLElement>("#ranking-feedback")!;
const helpButton = document.querySelector<HTMLButtonElement>("#help")!;
const helpDialog = document.querySelector<HTMLElement>("#item-help")!;
const helpCloseButton = document.querySelector<HTMLButtonElement>("#item-help-close")!;
const debugStageTools = document.querySelector<HTMLElement>("#debug-stage-tools")!;
const debugTools = document.querySelector<HTMLElement>("#debug-tools")!;
const debugStageForm = document.querySelector<HTMLFormElement>("#debug-stage-form")!;
const debugStageInput = document.querySelector<HTMLInputElement>("#debug-stage-input")!;
const debugBallCountInput = document.querySelector<HTMLInputElement>("#debug-ball-count-input")!;
const debugUltimateButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-debug-ultimate]")];
const optionsButton = document.querySelector<HTMLButtonElement>("#options")!;
const optionsDialog = document.querySelector<HTMLElement>("#options-panel")!;
const optionsCloseButton = document.querySelector<HTMLButtonElement>("#options-close")!;
const optionsRestartButton = document.querySelector<HTMLButtonElement>("#options-restart")!;
const optionsHomeButton = document.querySelector<HTMLButtonElement>("#options-home")!;
const challengeAbandonButton = document.querySelector<HTMLButtonElement>("#challenge-abandon")!;
const bgmToggleButton = document.querySelector<HTMLButtonElement>("#bgm-toggle")!;
const sfxToggleButton = document.querySelector<HTMLButtonElement>("#sfx-toggle")!;
const allAudioToggleButton = document.querySelector<HTMLButtonElement>("#all-audio-toggle")!;
const allAudioStatus = document.querySelector<HTMLElement>("#all-audio-status")!;
const fpsToggleButton = document.querySelector<HTMLButtonElement>("#fps-toggle")!;
const fpsMonitor = document.querySelector<HTMLOutputElement>("#fps-monitor")!;
const fpsValue = document.querySelector<HTMLElement>("#fps-value")!;
const resetConfirmDialog = document.querySelector<HTMLElement>("#reset-confirm")!;
const resetConfirmTitle = document.querySelector<HTMLElement>("#reset-confirm-title")!;
const resetConfirmDescription = document.querySelector<HTMLElement>("#reset-confirm-description")!;
const resetCancelButton = document.querySelector<HTMLButtonElement>("#reset-cancel")!;
const resetConfirmButton = document.querySelector<HTMLButtonElement>("#reset-confirm-button")!;
const rewardDialog = document.querySelector<HTMLElement>("#stage-reward")!;
const rewardCard = rewardDialog.querySelector<HTMLElement>(".reward-card")!;
const rewardStage = document.querySelector<HTMLElement>("#reward-stage")!;
const rewardStars = document.querySelector<HTMLElement>("#reward-stars")!;
const rewardTime = document.querySelector<HTMLElement>("#reward-time")!;
const rewardTargetTime = document.querySelector<HTMLElement>("#reward-target-time")!;
const rewardScore = document.querySelector<HTMLElement>("#reward-score")!;
const rewardTargetScore = document.querySelector<HTMLElement>("#reward-target-score")!;
const rewardResult = document.querySelector<HTMLElement>("#reward-result")!;
const rewardResultSymbol = document.querySelector<HTMLElement>("#reward-result-symbol")!;
const rewardResultImage = document.querySelector<HTMLImageElement>("#reward-result-image")!;
const rewardResultLevel = document.querySelector<HTMLElement>("#reward-result-level")!;
const rewardResultName = document.querySelector<HTMLElement>("#reward-result-name")!;
const rewardResultCopy = document.querySelector<HTMLElement>("#reward-result-copy")!;
const rewardActions = document.querySelector<HTMLElement>("#reward-actions")!;
const rewardStoreButton = document.querySelector<HTMLButtonElement>("#reward-store")!;
const rewardSkipButton = document.querySelector<HTMLButtonElement>("#reward-skip")!;
const rewardReplaceSkipButton = document.querySelector<HTMLButtonElement>("#reward-replace-skip")!;
const rewardReplacement = document.querySelector<HTMLElement>("#reward-replacement")!;
const rewardReplacementName = document.querySelector<HTMLElement>("#reward-replacement-name")!;
const rewardBackButton = document.querySelector<HTMLButtonElement>("#reward-back")!;
const rewardReplacementButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-replace-slot]")];
const ultimateSlotButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-ultimate-slot]")];
const ultimateSlotCount = document.querySelector<HTMLElement>("#ultimate-slot-count")!;

const ultimateImage = (fileName: string) => `${import.meta.env.BASE_URL}images/ultimates/${fileName}`;
type UltimateDetail = { name: string; symbol: string; className: string; image: string | null };
const ultimateDetails: Record<UltimateItemType, UltimateDetail> = {
  antimatter: { name: "반물질 폭탄", symbol: "◎", className: "ultimate-antimatter", image: ultimateImage("antimatter.png") },
  orbitalLaser: { name: "궤도 레이저", symbol: "▥", className: "ultimate-orbital", image: ultimateImage("orbital-laser.png") },
  chainLightning: { name: "연쇄 번개", symbol: "ϟ", className: "ultimate-lightning", image: ultimateImage("chain-lightning.png") },
  meteorImpact: { name: "운석 충돌", symbol: "☄", className: "ultimate-meteor", image: ultimateImage("meteor-impact.png") },
  blackHoleCollapse: { name: "블랙홀 붕괴", symbol: "●", className: "ultimate-blackhole", image: ultimateImage("black-hole-collapse.png") },
  crossfire: { name: "십자포화", symbol: "✚", className: "ultimate-crossfire", image: ultimateImage("crossfire.png") },
  fusionChain: { name: "핵융합 연쇄", symbol: "✹", className: "ultimate-fusion", image: ultimateImage("fusion-chain.png") },
  missileBarrage: { name: "미사일 포화", symbol: "➤", className: "ultimate-missile", image: ultimateImage("missile-barrage.png") },
};

Object.entries(ultimateDetails).forEach(([type, detail]) => {
  const imageSource = detail.image;
  if (!imageSource) return;
  document.querySelectorAll<HTMLImageElement>(`[data-ultimate-image="${type}"]`).forEach((image) => {
    image.src = imageSource;
    image.alt = detail.name;
  });
});

const iconMarkup: Record<string, string> = {
  settings: settingsIcon,
  "music-2": musicIcon,
  "audio-lines": effectIcon,
  volume: volumeIcon,
  "rotate-ccw": restartIcon,
  house: homeIcon,
  x: closeIcon,
  trophy: trophyIcon,
  gauge: gaugeIcon,
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

const itemCenter = (item: Pick<FieldItem, "row" | "column">) => ({
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
  const speed = BALL_SPEED * volleySpeedMultiplier(count);
  const launchDelay = 2.25 / count;
  firstLandingX = null;
  playSound("launch", { playbackRate: 1.08 });
  for (let index = 0; index < count; index += 1) {
    activeBalls.push(Object.assign(ballPool.acquire(), state.launchPosition, {
      vx: direction.x * speed,
      vy: direction.y * speed,
      delay: index * launchDelay,
      bounceCount: 0,
      blackHoleId: null,
    }));
  }
  syncUi();
}

function reset(stage = 1, ballCount = 1): void {
  setResetConfirmOpen(false);
  setRankingOpen(false);
  ballPool.releaseAll(activeBalls);
  if (bombEffect) positionedEffectPool.release(bombEffect);
  if (trapEffect) positionedEffectPool.release(trapEffect);
  positionedEffectPool.releaseAll(laserEffects);
  if (shieldRewindEffect) timedEffectPool.release(shieldRewindEffect);
  brickHitEffects.forEach((effect) => timedEffectPool.release(effect));
  resetGame(state, stage, ballCount);
  rewardReplacementOpen = false;
  selectedUltimateSlot = null;
  debugUltimateActive = false;
  debugSnapshot = null;
  hasNewBestScore = false;
  aimStart = null;
  aimCurrent = null;
  firstLandingX = null;
  boardSignature = "";
  blackHoleTime = 0;
  blackHoleCycle = 0;
  blackHoleStage = state.stage;
  blackHoleClearFadeTime = 0;
  bombEffect = null;
  trapEffect = null;
  ultimateEffect = null;
  ultimateResultDelay = 0;
  shieldRewindEffect = null;
  brickHitEffects.clear();
  rankingLoaded = false;
  rankingSubmitting = false;
  rankingSubmitted = false;
  rankingRequestId += 1;
  rankingPanelRequestId += 1;
  purePlayTimeMs = 0;
  lastClearedStage = 0;
  lastClearedScore = 0;
  lastClearedDurationMs = 0;
  challengeAbandoned = false;
  rankingSubmitButton.disabled = false;
  rankingFeedback.textContent = "";
  rankingPrediction.textContent = "계산 중";
  setHelpOpen(false);
  setOptionsOpen(false);
  syncUi();
}

function returnToEntryScreen(): void {
  reset();
  showEntryScreen();
  entryNameInput.focus();
}

function showEntryScreen(): void {
  entryNameInput.value = loadPlayerName();
  entryFeedback.textContent = "";
  entryScreen.hidden = false;
  appRoot.hidden = true;
}

function screenPoint(event: PointerEvent): Vec2 {
  const rect = app.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * BOARD_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * BOARD_HEIGHT,
  };
}

function ultimateHitCount(effect: UltimateEffect, progress: number): number {
  const total = effect.targets.length;
  if (effect.type === "chainLightning") {
    return Math.max(1, Math.ceil(total * Math.min(1, progress * CHAIN_LIGHTNING_REVEAL_RATE)));
  }
  if (effect.type === "fusionChain") {
    return effect.targets.reduce((count, _, index) => count
      + Number(progress >= index / total * FUSION_IGNITION_SPAN + FUSION_IMPACT_OFFSET), 0);
  }
  if (effect.type === "missileBarrage") {
    return effect.targets.reduce((count, _, index) => count
      + Number(progress >= index / total * MISSILE_LAUNCH_SPAN + MISSILE_LOCAL_DURATION * MISSILE_IMPACT_LOCAL_PROGRESS), 0);
  }
  const impactProgress = effect.type === "antimatter" ? ANTIMATTER_IMPACT_PROGRESS
    : effect.type === "orbitalLaser" ? ORBITAL_LASER_IMPACT_PROGRESS
      : effect.type === "meteorImpact" ? METEOR_IMPACT_PROGRESS
        : effect.type === "blackHoleCollapse" ? BLACK_HOLE_IMPACT_PROGRESS
          : CROSSFIRE_IMPACT_PROGRESS;
  return progress >= impactProgress ? total : 0;
}

function beginUltimateEffect(activation: UltimateActivation, target: Pick<Brick, "row" | "column">): void {
  const effectTarget = activation.type === "orbitalLaser"
    ? { ...target, column: orbitalLaserStartColumn(target.column) + 1 }
    : target;
  ultimateEffect = {
    ...itemCenter(effectTarget),
    elapsed: 0,
    type: activation.type,
    targets: activation.targets.map(itemCenter),
    activation,
  };
  selectedUltimateSlot = null;
  syncUi();
}

function useSelectedUltimate(point: Vec2): void {
  if (selectedUltimateSlot === null) return;
  const target = {
    row: Math.max(0, Math.min(DANGER_ROW - 1, Math.floor((point.y - GRID_TOP) / CELL_HEIGHT))),
    column: Math.max(0, Math.min(GRID_COLUMNS - 1, Math.floor((point.x - GRID_MARGIN) / (CELL_WIDTH + GRID_GAP)))),
  };
  const activation = useUltimateItem(state, selectedUltimateSlot, target, true);
  if (!activation) return;
  beginUltimateEffect(activation, target);
}

function restoreDebugState(): void {
  const snapshot = debugSnapshot;
  if (!snapshot) return;
  debugSnapshot = null;
  debugUltimateActive = false;
  positionedEffectPool.releaseAll(laserEffects);
  state.bricks = snapshot.bricks;
  state.score = snapshot.score;
  state.stageScore = snapshot.stageScore;
  state.stageUltimateUseCount = snapshot.stageUltimateUseCount;
  state.gameStatus = snapshot.gameStatus;
  state.ultimateInventory = [...snapshot.ultimateInventory];
  state.pendingUltimateReward = snapshot.pendingUltimateReward;
  state.stageResult = snapshot.stageResult;
  state.pendingLaserTriggers = [...snapshot.pendingLaserTriggers];
  selectedUltimateSlot = null;
  ultimateResultDelay = 0;
  boardSignature = "";
  syncUi();
}

function startDebugUltimate(type: UltimateItemType): void {
  if (state.gameStatus !== "ready" || debugUltimateActive || ultimateEffect) return;
  const targetBrick = state.bricks
    .filter((brick) => brick.type !== "steel")
    .sort((a, b) => b.row - a.row || Math.abs(a.column - (GRID_COLUMNS - 1) / 2) - Math.abs(b.column - (GRID_COLUMNS - 1) / 2))[0];
  if (!targetBrick) return;
  debugSnapshot = {
    bricks: state.bricks.map((brick) => ({ ...brick })),
    score: state.score,
    stageScore: state.stageScore,
    stageUltimateUseCount: state.stageUltimateUseCount,
    gameStatus: state.gameStatus,
    ultimateInventory: [...state.ultimateInventory],
    pendingUltimateReward: state.pendingUltimateReward,
    stageResult: state.stageResult ? { ...state.stageResult } : null,
    pendingLaserTriggers: [...state.pendingLaserTriggers],
  };
  debugUltimateActive = true;
  state.ultimateInventory[0] = isGrowthUltimate(type) ? { type, level: 4 } : type;
  const target = { row: targetBrick.row, column: targetBrick.column };
  const activation = useUltimateItem(state, 0, target, true);
  if (!activation) {
    restoreDebugState();
    return;
  }
  beginUltimateEffect(activation, target);
}

app.canvas.addEventListener("pointerdown", (event) => {
  if (helpOpen || optionsOpen || resetConfirmOpen || shieldRewindEffect || ultimateEffect || state.gameStatus !== "ready") return;
  const point = screenPoint(event);
  if (selectedUltimateSlot !== null) {
    useSelectedUltimate(point);
    return;
  }
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

document.querySelector("#result-restart")!.addEventListener("click", () => reset());

function exitFromGameOver(): void {
  if (state.gameStatus !== "gameOver") return;
  if (rankingSubmitted || state.score < 1) {
    returnToEntryScreen();
    return;
  }
  setResetConfirmOpen(true, "exit");
}

resultExitButton.addEventListener("click", exitFromGameOver);

function abandonChallenge(): void {
  if (state.gameStatus === "reward" || state.gameStatus === "gameOver") return;
  ballPool.releaseAll(activeBalls);
  aimStart = null;
  aimCurrent = null;
  challengeAbandoned = true;
  state.gameStatus = "gameOver";
  state.stage = Math.max(1, lastClearedStage);
  state.score = lastClearedScore;
  purePlayTimeMs = lastClearedDurationMs;
  setOptionsOpen(false);
  syncUi();
}

showEntryScreen();
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
entryAudioToggleButton.addEventListener("click", () => {
  const nextMuted = !isAllMuted();
  setAllMuted(nextMuted);
  syncAudioOptions();
  if (!nextMuted && !isSfxMuted()) playSound("ui_click");
});
rankingButton.addEventListener("click", () => setRankingOpen(!rankingOpen, rankingButton));
rankingCloseButton.addEventListener("click", () => setRankingOpen(false));
rankingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitCurrentScore();
});
helpButton.addEventListener("click", () => {
  if (!resetConfirmOpen && !optionsOpen && !rankingOpen && state.gameStatus !== "reward") setHelpOpen(!helpOpen);
});
helpCloseButton.addEventListener("click", () => setHelpOpen(false));
if (import.meta.env.MODE === "stage-fixture") {
  debugStageTools.hidden = false;
  const syncDebugBallCountLimit = () => {
    const limit = maxBallsForStage(Number(debugStageInput.value));
    debugBallCountInput.max = String(limit);
    if (Number(debugBallCountInput.value) > limit) debugBallCountInput.value = String(limit);
  };
  syncDebugBallCountLimit();
  debugStageInput.addEventListener("input", syncDebugBallCountLimit);
  debugStageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    syncDebugBallCountLimit();
    if (!debugStageForm.reportValidity()) return;
    reset(Number(debugStageInput.value), Number(debugBallCountInput.value));
  });
} else {
  debugStageTools.remove();
}
if (import.meta.env.MODE === "ultimate-fixture") {
  debugTools.hidden = false;
  debugUltimateButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.dataset.debugUltimate as UltimateItemType;
      if (type in ultimateDetails) startDebugUltimate(type);
    });
  });
} else {
  debugTools.remove();
}
optionsButton.addEventListener("click", () => {
  if (!resetConfirmOpen && !rankingOpen && state.gameStatus !== "reward") setOptionsOpen(!optionsOpen);
});
optionsCloseButton.addEventListener("click", () => setOptionsOpen(false));
optionsRestartButton.addEventListener("click", () => {
  setOptionsOpen(false);
  setResetConfirmOpen(true, "reset");
});
optionsHomeButton.addEventListener("click", () => setResetConfirmOpen(true, "home"));
challengeAbandonButton.addEventListener("click", () => setResetConfirmOpen(true, "abandon"));
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
fpsToggleButton.addEventListener("click", () => {
  fpsVisible = !fpsVisible;
  saveFpsVisibility();
  syncFpsOption();
});
resetCancelButton.addEventListener("click", () => setResetConfirmOpen(false));
resetConfirmButton.addEventListener("click", () => {
  const action = resetConfirmAction;
  setResetConfirmOpen(false);
  if (action === "exit" || action === "home") returnToEntryScreen();
  else if (action === "abandon") abandonChallenge();
  else reset();
});
rewardStoreButton.addEventListener("click", () => {
  if (acceptUltimateReward(state)) {
    rewardReplacementOpen = false;
    syncUi();
    return;
  }
  rewardReplacementOpen = true;
  syncUi();
});
rewardReplacementButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const slot = Number(button.dataset.replaceSlot);
    if (!acceptUltimateReward(state, slot)) return;
    rewardReplacementOpen = false;
    syncUi();
  });
});
rewardBackButton.addEventListener("click", () => {
  rewardReplacementOpen = false;
  syncUi();
});
[rewardSkipButton, rewardReplaceSkipButton].forEach((button) => {
  button.addEventListener("click", () => {
    if (!discardUltimateReward(state)) return;
    rewardReplacementOpen = false;
    syncUi();
  });
});
ultimateSlotButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    if (state.gameStatus !== "ready" || !state.ultimateInventory[index]) return;
    selectedUltimateSlot = selectedUltimateSlot === index ? null : index;
    syncUi();
  });
});
document.querySelectorAll<HTMLButtonElement>("button:not([data-audio-control])").forEach((button) => {
  button.addEventListener("click", () => playSound("ui_click"));
});
document.addEventListener("pointerdown", () => void unlockAudio(), { once: true });

function syncAudioOptions(): void {
  const bgmMuted = isBgmMuted();
  const sfxMuted = isSfxMuted();
  const allMuted = isAllMuted();
  allAudioStatus.textContent = allMuted ? "모든 소리를 끕니다" : "개별 설정 유지";
  entryAudioStatus.textContent = allMuted ? "전체 사운드 꺼짐" : "전체 사운드 켜짐";
  entryAudioToggleButton.setAttribute("aria-checked", String(!allMuted));
  bgmToggleButton.setAttribute("aria-checked", String(!(allMuted || bgmMuted)));
  sfxToggleButton.setAttribute("aria-checked", String(!(allMuted || sfxMuted)));
  allAudioToggleButton.setAttribute("aria-checked", String(!allMuted));
}

function syncFpsOption(): void {
  fpsToggleButton.setAttribute("aria-checked", String(fpsVisible));
  fpsMonitor.hidden = !fpsVisible;
  if (!fpsVisible) {
    fpsSampleElapsedMs = 0;
    fpsValue.textContent = "--";
    delete fpsMonitor.dataset.level;
  }
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

function setResetConfirmOpen(open: boolean, action: "reset" | "exit" | "home" | "abandon" = "reset"): void {
  const wasOpen = resetConfirmOpen;
  if (open) resetConfirmAction = action;
  resetConfirmOpen = open;
  resetConfirmDialog.hidden = !open;
  if (open) {
    const copy = {
      reset: ["정말 다시 시작할까요?", "현재 점수와 진행 상황이 사라집니다.", "다시 시작"],
      exit: ["랭킹을 등록하지 않고 나갈까요?", "이번 게임 기록은 저장되지 않습니다.", "나가기"],
      home: ["처음 화면으로 돌아갈까요?", "현재 게임 진행이 사라집니다.", "처음 화면 가기"],
      abandon: ["챌린지를 포기할까요?", "마지막 클리어 기록 기준으로 게임오버 처리됩니다.", "챌린지 포기"],
    }[resetConfirmAction];
    resetConfirmTitle.textContent = copy[0];
    resetConfirmDescription.textContent = copy[1];
    resetConfirmButton.textContent = copy[2];
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
    syncFpsOption();
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

function loadFpsVisibility(): boolean {
  try {
    return localStorage.getItem(FPS_VISIBLE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveFpsVisibility(): void {
  try {
    localStorage.setItem(FPS_VISIBLE_KEY, String(fpsVisible));
  } catch {
    // 저장소를 사용할 수 없어도 현재 설정은 유지합니다.
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
    const details = document.createElement("span");
    const name = document.createElement("strong");
    const score = document.createElement("span");
    rank.className = "ranking-rank";
    details.className = "ranking-details";
    name.className = "ranking-name";
    score.className = "ranking-score";
    rank.textContent = String(entry.rank).padStart(2, "0");
    name.textContent = entry.name;
    score.textContent = `${entry.score.toLocaleString("ko-KR")} · Lv.${entry.stage} · ${formatPlayTime(entry.durationMs)}`;
    details.append(name, score);
    row.append(rank, details);
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

  const entries = await fetchTopRanking(30);
  if (requestId !== rankingRequestId) return;
  if (entries === null) {
    rankingStatus.textContent = "연결 안 됨";
    rankingPrediction.textContent = "확인할 수 없음";
    rankingList.replaceChildren();
    const unavailable = document.createElement("li");
    unavailable.className = "ranking-empty";
    unavailable.textContent = "랭킹 서버에 연결할 수 없습니다.";
    rankingList.append(unavailable);
    return;
  }
  const score = challengeAbandoned ? lastClearedScore : state.score;
  rankingStatus.textContent = entries.length > 3 ? "상위 3명" : entries.length > 0 ? `상위 ${entries.length}명` : "기록 없음";
  if (score < 1) {
    rankingPrediction.textContent = "등록 불가";
  } else {
    const predictedRank = estimateRankingPosition(entries, score);
    rankingPrediction.textContent = entries.length === 30 && predictedRank > entries.length
      ? `${predictedRank}위 이하`
      : `${predictedRank}위`;
  }
  renderRanking(entries.slice(0, 3), rankingList);
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
  const score = challengeAbandoned ? lastClearedScore : state.score;
  const stage = challengeAbandoned ? Math.max(1, lastClearedStage) : state.stage;
  const durationMs = challengeAbandoned ? lastClearedDurationMs : Math.max(0, Math.round(purePlayTimeMs));
  if (score < 1) {
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
    score,
    stage,
    durationMs,
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
  rankingSubmitted = true;
  await loadRanking();
}

function syncUi(): void {
  if (state.stageResult) {
    lastClearedStage = state.stage;
    lastClearedScore = state.score;
    lastClearedDurationMs = Math.max(0, Math.round(purePlayTimeMs));
  }
  if (!debugUltimateActive && state.score > bestScore) {
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

  const selectedUltimate = selectedUltimateSlot === null ? null : state.ultimateInventory[selectedUltimateSlot];
  const messages = {
    ready: selectedUltimate
      ? `${ultimateDetails[ultimateItemType(selectedUltimate)].name} · 터뜨릴 위치를 선택하세요`
      : state.powerTurns > 0 ? `강화볼 준비 · 공격력 ×${state.powerMultiplier}` : "공의 방향을 정하고 발사 하세요.",
    aiming: "손을 떼면 발사합니다",
    volley: state.powerTurns > 0 ? `강화볼 발사 중 · 공격력 ×${state.powerMultiplier}` : "공이 모두 돌아올 때까지 기다리세요",
    reward: "스테이지 클리어 · 보상을 확인하세요",
    gameOver: "벽돌이 위험선에 닿았습니다",
  } as const;
  statusEl.textContent = debugUltimateActive
    ? "디버그 궁극기 테스트 중 · 잠시 후 벽돌을 복구합니다"
    : shieldRewindEffect ? "보호막 발동 · 한 칸 되돌리는 중" : messages[state.gameStatus];
  statusDot.dataset.state = state.gameStatus;
  debugUltimateButtons.forEach((button) => {
    button.disabled = state.gameStatus !== "ready" || debugUltimateActive;
  });

  result.hidden = state.gameStatus !== "gameOver";
  syncUltimateUi();
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

function syncUltimateUi(): void {
  if (state.gameStatus !== "ready") selectedUltimateSlot = null;
  host.classList.toggle("ultimate-targeting", selectedUltimateSlot !== null);
  const stored = state.ultimateInventory.filter(Boolean).length;
  ultimateSlotCount.textContent = `${stored} / ${state.ultimateInventory.length}`;
  ultimateSlotButtons.forEach((button, index) => {
    const item = state.ultimateInventory[index];
    const type = item ? ultimateItemType(item) : null;
    const itemLevel = item ? ultimateItemLevel(item) : null;
    const symbol = button.querySelector<HTMLElement>(".ultimate-slot-symbol")!;
    const image = button.querySelector<HTMLImageElement>(".ultimate-slot-image")!;
    const level = button.querySelector<HTMLElement>(".ultimate-level-badge")!;
    const name = button.querySelector<HTMLElement>("strong")!;
    const hint = button.querySelector<HTMLElement>("small")!;
    symbol.className = "ultimate-slot-symbol";
    button.classList.toggle("selected", selectedUltimateSlot === index);
    button.setAttribute("aria-pressed", String(selectedUltimateSlot === index));
    if (!type) {
      symbol.textContent = "+";
      symbol.hidden = false;
      image.hidden = true;
      image.removeAttribute("src");
      level.hidden = true;
      name.textContent = "비어 있음";
      hint.textContent = "클리어 보상";
      button.classList.remove("filled");
      button.disabled = true;
      return;
    }
    const detail = ultimateDetails[type];
    level.hidden = itemLevel === null;
    if (itemLevel !== null) {
      level.textContent = `LV.${itemLevel}`;
      level.dataset.level = String(itemLevel);
    }
    symbol.textContent = detail.symbol;
    symbol.classList.add(detail.className);
    if (detail.image) {
      symbol.hidden = true;
      image.src = detail.image;
      image.hidden = false;
    } else {
      symbol.hidden = false;
      image.hidden = true;
      image.removeAttribute("src");
    }
    name.textContent = detail.name;
    hint.textContent = selectedUltimateSlot === index ? "게임판 위치 선택" : "발동 준비";
    button.classList.add("filled");
    button.disabled = state.gameStatus !== "ready";
  });

  rewardDialog.hidden = state.gameStatus !== "reward" || ultimateEffect !== null || ultimateResultDelay > 0;
  if (state.gameStatus !== "reward") return;
  rewardActions.hidden = rewardReplacementOpen;
  rewardReplacement.hidden = !rewardReplacementOpen;
  rewardCard.classList.toggle("replacing", rewardReplacementOpen);
  const stageResult = state.stageResult;
  if (!stageResult) return;
  rewardStage.textContent = String(state.stage).padStart(2, "0");
  rewardStars.textContent = `${"★".repeat(stageResult.stars)}${"☆".repeat(5 - stageResult.stars)}`;
  rewardStars.setAttribute("aria-label", `별 ${stageResult.stars}개`);
  rewardTime.textContent = formatPlayTime(stageResult.timeMs);
  rewardTargetTime.textContent = `/ ${formatPlayTime(stageResult.targetTimeMs)}`;
  rewardScore.textContent = stageResult.score.toLocaleString("ko-KR");
  rewardTargetScore.textContent = `/ ${stageResult.targetScore.toLocaleString("ko-KR")}`;
  rewardResultSymbol.className = "ultimate-symbol";
  rewardResultLevel.hidden = true;
  rewardResultImage.hidden = true;
  rewardResultImage.removeAttribute("src");
  rewardResult.classList.toggle("no-reward", !state.pendingUltimateReward);
  if (state.pendingUltimateReward) {
    const rewardType = ultimateItemType(state.pendingUltimateReward);
    const rewardLevel = ultimateItemLevel(state.pendingUltimateReward);
    const detail = ultimateDetails[rewardType];
    rewardResultLevel.hidden = rewardLevel === null;
    if (rewardLevel !== null) {
      rewardResultLevel.textContent = `LV.${rewardLevel}`;
      rewardResultLevel.dataset.level = String(rewardLevel);
    }
    rewardResultSymbol.textContent = detail.symbol;
    rewardResultSymbol.classList.add(detail.className);
    if (detail.image) {
      rewardResultSymbol.hidden = true;
      rewardResultImage.src = detail.image;
      rewardResultImage.alt = detail.name;
      rewardResultImage.hidden = false;
    } else {
      rewardResultSymbol.hidden = false;
      rewardResultImage.hidden = true;
    }
    rewardResultName.textContent = detail.name;
    rewardResultCopy.textContent = "궁극기 보상을 획득했습니다.";
    rewardReplacementName.textContent = detail.name;
    rewardStoreButton.textContent = "슬롯에 저장";
    rewardSkipButton.hidden = false;
  } else {
    rewardResultSymbol.hidden = false;
    rewardResultSymbol.textContent = "—";
    rewardResultName.textContent = "보상 없음";
    rewardResultCopy.textContent = "다음 스테이지에서 더 좋은 활약을 노려보세요.";
    rewardStoreButton.textContent = "다음 스테이지";
    rewardSkipButton.hidden = true;
  }
  rewardReplacementButtons.forEach((button, index) => {
    const storedItem = state.ultimateInventory[index];
    button.textContent = storedItem
      ? `${index + 1}번 · ${ultimateDetails[ultimateItemType(storedItem)].name} 교체`
      : `${index + 1}번 · 빈 슬롯`;
  });
}

function rebuildLabels(): void {
  const signature = `${state.stage}|${state.bricks.map((brick) => `${brick.id}:${brick.hp}:${brick.row}`).join(",")}|${state.items.map((item) => `${item.id}:${item.row}:${item.column}:${item.charges ?? ""}`).join(",")}`;
  if (signature === boardSignature) return;
  boardSignature = signature;
  labels.removeChildren();
  labelPool.releaseAll(activeLabels);
  brickLabels.clear();
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
    brickLabels.set(brick.id, label);
  });

  const itemLabel = { bomb: "B", multiball: "+1", shield: "S", power: "×2", power3: "×3", power4: "×4", trap: "−1" } as const;
  state.items.forEach((item) => {
    if (item.type === "blackhole" && (item.charges ?? 1) <= 0) return;
    const center = itemCenter(item);
    const label = labelPool.acquire();
    label.text = item.type === "blackhole" ? String(item.charges ?? 1) : itemLabel[item.type];
    label.style.fontSize = item.type === "multiball" || item.type === "blackhole" ? 10 : 12;
    if (item.type === "blackhole") {
      label.alpha = blackHolePresence(blackHoleTime) * blackHoleClearFade(blackHoleClearFadeTime);
    }
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

function lightningPath(start: Vec2, end: Vec2, seed: number, progress: number, segments: number, amplitude: number): Vec2[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const points = [start];
  for (let index = 1; index < segments; index += 1) {
    const t = index / segments;
    const jitter = Math.sin(seed * 19.17 + index * 11.31 + progress * 48) * amplitude * Math.sin(Math.PI * t);
    points.push({
      x: start.x + dx * t + normal.x * jitter,
      y: start.y + dy * t + normal.y * jitter,
    });
  }
  points.push(end);
  return points;
}

function strokeLightning(graphics: Graphics, points: Vec2[], width: number, color: number, alpha: number): void {
  graphics.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => graphics.lineTo(point.x, point.y));
  graphics.stroke({ width, color, alpha });
}

function drawLightningBolt(glow: Graphics, core: Graphics, start: Vec2, end: Vec2, seed: number, progress: number, fade: number): void {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const segments = Math.max(4, Math.min(7, Math.round(length / 34)));
  const points = lightningPath(start, end, seed, progress, segments, Math.min(24, Math.max(9, length * 0.12)));
  strokeLightning(glow, points, 13, 0x2cbfff, fade * 0.58);
  strokeLightning(core, points, 4, 0xfff1a1, fade * 0.98);

  for (let index = 1; index < points.length - 1; index += 1) {
    const anchor = points[index];
    const previous = points[index - 1];
    const next = points[index + 1];
    const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
    const direction = (seed + index) % 2 === 0 ? 1 : -1;
    const normal = {
      x: -(next.y - previous.y) / tangentLength,
      y: (next.x - previous.x) / tangentLength,
    };
    const branchLength = Math.min(55, Math.max(22, length * 0.38)) * (0.75 + Math.abs(Math.sin(seed + index)) * 0.25);
    const branchEnd = {
      x: anchor.x + normal.x * branchLength * direction,
      y: anchor.y + normal.y * branchLength * direction,
    };
    const branch = lightningPath(anchor, branchEnd, seed + index * 2.7, progress, 3, branchLength * 0.22);
    strokeLightning(glow, branch, 10, 0x2bc7ff, fade * 0.5);
    strokeLightning(core, branch, 3, 0x8cecff, fade * 0.94);
  }
}

function drawMissile(glow: Graphics, core: Graphics, position: Vec2, velocity: Vec2, alpha: number): void {
  const length = Math.hypot(velocity.x, velocity.y) || 1;
  const direction = { x: velocity.x / length, y: velocity.y / length };
  const normal = { x: -direction.y, y: direction.x };
  const tail = { x: position.x - direction.x * 18, y: position.y - direction.y * 18 };
  const flame = { x: tail.x - direction.x * 13, y: tail.y - direction.y * 13 };
  glow.moveTo(flame.x, flame.y).lineTo(position.x, position.y)
    .stroke({ width: 12, color: 0xff4f47, alpha: alpha * 0.52 });
  core.moveTo(flame.x, flame.y).lineTo(tail.x, tail.y)
    .stroke({ width: 5, color: 0xffc35a, alpha });
  core.moveTo(position.x, position.y)
    .lineTo(tail.x + normal.x * 5, tail.y + normal.y * 5)
    .lineTo(tail.x - direction.x * 2, tail.y - direction.y * 2)
    .lineTo(tail.x - normal.x * 5, tail.y - normal.y * 5)
    .closePath()
    .fill({ color: 0xf2f5ff, alpha })
    .stroke({ width: 2, color: 0xff5a62, alpha });
  core.moveTo(tail.x + normal.x * 5, tail.y + normal.y * 5)
    .lineTo(tail.x - direction.x * 6 + normal.x * 8, tail.y - direction.y * 6 + normal.y * 8)
    .lineTo(tail.x - direction.x * 3, tail.y - direction.y * 3)
    .fill({ color: 0xff566f, alpha });
  core.moveTo(tail.x - normal.x * 5, tail.y - normal.y * 5)
    .lineTo(tail.x - direction.x * 6 - normal.x * 8, tail.y - direction.y * 6 - normal.y * 8)
    .lineTo(tail.x - direction.x * 3, tail.y - direction.y * 3)
    .fill({ color: 0xff566f, alpha });
}

function draw(): void {
  scene.clear();
  effectGlow.clear();
  brickHitGlow.clear();
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

  const blackHoleTargetIds = ultimateEffect?.type === "blackHoleCollapse" && !ultimateEffect.activation.resolved
    ? new Set(ultimateEffect.activation.hits.map(({ brickId }) => brickId))
    : null;
  state.bricks.forEach((brick) => {
    const logicalRect = brickRect(brick);
    const label = brickLabels.get(brick.id);
    if (label) {
      label.visible = true;
      label.alpha = 1;
      label.rotation = 0;
      label.scale.set(1);
      label.position.set(logicalRect.x + logicalRect.width / 2, logicalRect.y + logicalRect.height / 2);
    }
    if (blackHoleTargetIds?.has(brick.id)) {
      if (label) label.visible = false;
      return;
    }
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
      const presence = (item.charges ?? 1) > 0
        ? blackHolePresence(blackHoleTime) * blackHoleClearFade(blackHoleClearFadeTime)
        : 0;
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

  if (ultimateEffect) {
    const progress = Math.min(1, ultimateEffect.elapsed / ULTIMATE_EFFECT_DURATIONS[ultimateEffect.type]);
    const alpha = 1 - progress;
    if (ultimateEffect.type === "antimatter") {
      const collapse = Math.min(1, progress / ANTIMATTER_IMPACT_PROGRESS);
      const collapseAlpha = Math.max(0, 1 - Math.max(0, progress - 0.34) / 0.22);
      const centerX = ultimateEffect.x;
      const centerY = ultimateEffect.y;
      scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill({ color: 0x3d0b70, alpha: collapseAlpha * 0.08 });
      for (let ring = 0; ring < 3; ring += 1) {
        const radius = 116 - collapse * (82 + ring * 8) + ring * 14;
        effectGlow.circle(ultimateEffect.x, ultimateEffect.y, radius)
          .stroke({ width: 10 - ring * 2, color: ring === 1 ? 0xff73ee : 0x9d55ff, alpha: collapseAlpha * (0.5 - ring * 0.08) });
        scene.circle(ultimateEffect.x, ultimateEffect.y, radius)
          .stroke({ width: 2, color: ring === 1 ? 0xffb2f4 : 0xd9c2ff, alpha: collapseAlpha * 0.85 });
      }
      ultimateEffect.targets.forEach((target, index) => {
        const spiral = (1 - collapse) * 15;
        const x = target.x + (centerX - target.x) * collapse + Math.sin(index * 2.3 + collapse * 12) * spiral;
        const y = target.y + (centerY - target.y) * collapse + Math.cos(index * 1.7 + collapse * 12) * spiral;
        const size = Math.max(2, 11 * (1 - collapse));
        scene.roundRect(x - size / 2, y - size / 3, size, size * 0.66, 2)
          .fill({ color: index % 2 === 0 ? 0xd081ff : 0x7755ff, alpha: collapseAlpha * 0.72 });
      });
      effectGlow.circle(ultimateEffect.x, ultimateEffect.y, 18 + collapse * 12)
        .fill({ color: 0xb45cff, alpha: collapseAlpha * 0.62 });
      scene.circle(ultimateEffect.x, ultimateEffect.y, 12 + collapse * 15)
        .fill({ color: 0x010107, alpha: collapseAlpha * 0.98 })
        .stroke({ width: 3, color: 0xf6d7ff, alpha: collapseAlpha });

      const burstProgress = Math.max(0, (progress - ANTIMATTER_IMPACT_PROGRESS) / (1 - ANTIMATTER_IMPACT_PROGRESS));
      if (burstProgress > 0) {
        const burst = 1 - (1 - burstProgress) ** 3;
        const burstAlpha = 1 - burstProgress;
        const radius = 18 + burst * 140;
        scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
          .fill({ color: 0xf1d8ff, alpha: Math.max(0, 0.18 - burstProgress * 0.5) });
        effectGlow.circle(ultimateEffect.x, ultimateEffect.y, radius)
          .stroke({ width: 28, color: 0xc565ff, alpha: burstAlpha * 0.64 });
        scene.circle(ultimateEffect.x, ultimateEffect.y, radius)
          .stroke({ width: 6, color: 0xf7d7ff, alpha: burstAlpha });
        scene.circle(ultimateEffect.x, ultimateEffect.y, radius * 0.62)
          .stroke({ width: 2, color: 0xffffff, alpha: burstAlpha * 0.78 });
        scene.circle(ultimateEffect.x, ultimateEffect.y, 28 * (1 - burst) + 4)
          .fill({ color: 0xffffff, alpha: burstAlpha });
        for (let index = 0; index < 14; index += 1) {
          const angle = index / 14 * Math.PI * 2 + Math.sin(index * 4.17) * 0.16;
          const inner = 16 + burst * (19 + index % 2 * 8);
          const outer = 25 + burst * (64 + index % 4 * 14);
          const start = {
            x: ultimateEffect.x + Math.cos(angle) * inner,
            y: ultimateEffect.y + Math.sin(angle) * inner,
          };
          const end = {
            x: ultimateEffect.x + Math.cos(angle + Math.sin(index * 2.7) * 0.09) * outer,
            y: ultimateEffect.y + Math.sin(angle + Math.sin(index * 2.7) * 0.09) * outer,
          };
          const ray = lightningPath(start, end, index + 31, progress, 3, 5 + index % 3 * 2);
          strokeLightning(effectGlow, ray, 11, 0xc15cff, burstAlpha * 0.5);
          strokeLightning(scene, ray, index % 2 === 0 ? 3 : 2, index % 2 === 0 ? 0xffffff : 0xdc83ff, burstAlpha * 0.86);
        }
      }
    } else if (ultimateEffect.type === "orbitalLaser") {
      const charge = Math.min(1, progress / 0.24);
      const beamProgress = Math.max(0, (progress - 0.2) / 0.8);
      const beamOpen = Math.min(1, beamProgress * 5);
      const beamAlpha = beamOpen * Math.min(1, (1 - progress) / 0.22);
      scene.moveTo(ultimateEffect.x, 0).lineTo(ultimateEffect.x, BOARD_HEIGHT)
        .stroke({ width: 1, color: 0x67e9ff, alpha: (1 - beamOpen) * charge * 0.72 });
      scene.circle(ultimateEffect.x, ultimateEffect.y, 23 - charge * 12)
        .stroke({ width: 2, color: 0x8cf4ff, alpha: (1 - beamOpen) * charge });
      effectGlow.ellipse(ultimateEffect.x, 3, 18 + charge * 34, 5 + charge * 9)
        .stroke({ width: 15, color: 0x4ee6ff, alpha: Math.max(beamAlpha, charge * 0.42) });
      scene.ellipse(ultimateEffect.x, 3, 18 + charge * 34, 5 + charge * 9)
        .stroke({ width: 3, color: 0xd9fbff, alpha: Math.max(beamAlpha, charge * 0.8) });

      if (beamProgress > 0) {
        const width = (CELL_WIDTH * 3 + GRID_GAP * 2) * beamOpen;
        effectGlow.rect(ultimateEffect.x - width * 0.62, 0, width * 1.24, BOARD_HEIGHT)
          .fill({ color: 0x22dfff, alpha: beamAlpha * 0.62 });
        scene.rect(ultimateEffect.x - width / 2, 0, width, BOARD_HEIGHT)
          .fill({ color: 0x0a93cf, alpha: beamAlpha * 0.42 });
        scene.rect(ultimateEffect.x - width * 0.28, 0, width * 0.56, BOARD_HEIGHT)
          .fill({ color: 0x76f1ff, alpha: beamAlpha * 0.74 });
        scene.rect(ultimateEffect.x - Math.max(3, width * 0.09), 0, Math.max(6, width * 0.18), BOARD_HEIGHT)
          .fill({ color: 0xffffff, alpha: beamAlpha });
        for (let index = 0; index < 8; index += 1) {
          const y = (beamProgress * BOARD_HEIGHT * 2.4 + index * BOARD_HEIGHT / 8) % BOARD_HEIGHT;
          const side = index % 2 === 0 ? -1 : 1;
          scene.moveTo(ultimateEffect.x + side * width * 0.25, y)
            .lineTo(ultimateEffect.x + side * width * 0.48, y - 18)
            .stroke({ width: 2, color: 0xc8faff, alpha: beamAlpha * 0.7 });
        }
        scene.circle(ultimateEffect.x, ultimateEffect.y, 12 + beamOpen * 28)
          .stroke({ width: 4, color: 0xffffff, alpha: beamAlpha * 0.82 });
      }
    } else if (ultimateEffect.type === "chainLightning") {
      const visibleTargets = Math.max(1, Math.ceil(ultimateEffect.targets.length * Math.min(1, progress * CHAIN_LIGHTNING_REVEAL_RATE)));
      const lightningAlpha = alpha * (0.72 + Math.abs(Math.sin(progress * 52)) * 0.28);
      scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
        .fill({ color: 0x2b9cff, alpha: lightningAlpha * 0.035 });
      let previous = { x: ultimateEffect.x, y: ultimateEffect.y };
      ultimateEffect.targets.slice(0, visibleTargets).forEach((target, index) => {
        drawLightningBolt(effectGlow, scene, previous, target, index + 1, progress, lightningAlpha);
        scene.circle(target.x, target.y, 3.5).fill({ color: 0xffffff, alpha: lightningAlpha });
        scene.moveTo(target.x - 7, target.y).lineTo(target.x + 7, target.y)
          .moveTo(target.x, target.y - 7).lineTo(target.x, target.y + 7)
          .stroke({ width: 2, color: index % 2 === 0 ? 0xffe672 : 0x67dcff, alpha: lightningAlpha * 0.82 });
        previous = target;
      });
      effectGlow.circle(ultimateEffect.x, ultimateEffect.y, 15 + Math.sin(progress * 44) * 3)
        .fill({ color: 0x54dfff, alpha: lightningAlpha * 0.62 });
      scene.circle(ultimateEffect.x, ultimateEffect.y, 6)
        .fill({ color: 0xffffff, alpha: lightningAlpha });
    } else if (ultimateEffect.type === "meteorImpact") {
      const approachSide = ultimateEffect.x < BOARD_WIDTH / 2 ? 1 : -1;
      const start = {
        x: Math.max(28, Math.min(BOARD_WIDTH - 28, ultimateEffect.x + approachSide * 130)),
        y: -28,
      };
      const dx = ultimateEffect.x - start.x;
      const dy = ultimateEffect.y - start.y;
      const distance = Math.hypot(dx, dy) || 1;
      const direction = { x: dx / distance, y: dy / distance };
      const normal = { x: -direction.y, y: direction.x };
      const flightProgress = Math.min(1, progress / METEOR_IMPACT_PROGRESS);
      const flight = flightProgress ** 1.65;

      if (flightProgress < 1) {
        const meteor = { x: start.x + dx * flight, y: start.y + dy * flight };
        const tailLength = 72 + (1 - flightProgress) * 35;
        const tail = { x: meteor.x - direction.x * tailLength, y: meteor.y - direction.y * tailLength };
        effectGlow.moveTo(tail.x, tail.y).lineTo(meteor.x, meteor.y)
          .stroke({ width: 30, color: 0xff5b24, alpha: 0.42 });
        scene.moveTo(tail.x, tail.y).lineTo(meteor.x, meteor.y)
          .stroke({ width: 13, color: 0xff7b2d, alpha: 0.74 });
        scene.moveTo(tail.x + normal.x * 4, tail.y + normal.y * 4).lineTo(meteor.x, meteor.y)
          .stroke({ width: 5, color: 0xffe079, alpha: 0.95 });

        for (let index = 0; index < 7; index += 1) {
          const trailDistance = 20 + index * 13 + Math.sin(progress * 38 + index * 2.1) * 5;
          const spread = Math.sin(index * 4.7 + progress * 25) * (5 + index * 1.8);
          const emberX = meteor.x - direction.x * trailDistance + normal.x * spread;
          const emberY = meteor.y - direction.y * trailDistance + normal.y * spread;
          scene.circle(emberX, emberY, 1.5 + (index % 3))
            .fill({ color: index % 2 === 0 ? 0xffd76a : 0xff6230, alpha: 0.7 - index * 0.065 });
        }

        effectGlow.circle(meteor.x, meteor.y, 19).fill({ color: 0xff6428, alpha: 0.58 });
        scene.circle(meteor.x + direction.x * 4, meteor.y + direction.y * 4, 13).fill(0xff9b42);
        scene.circle(meteor.x - direction.x * 3, meteor.y - direction.y * 3, 11)
          .fill(0x4a2926)
          .stroke({ width: 2, color: 0xffc05b, alpha: 0.9 });
        scene.circle(meteor.x - direction.x * 5 + normal.x * 3, meteor.y - direction.y * 5 + normal.y * 3, 3)
          .fill(0x241b20);
      }

      const impactProgress = Math.max(0, (progress - METEOR_IMPACT_PROGRESS) / (1 - METEOR_IMPACT_PROGRESS));
      if (impactProgress > 0) {
        const impact = 1 - (1 - impactProgress) ** 3;
        const impactAlpha = 1 - impactProgress;
        const radius = 18 + 112 * impact;
        scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
          .fill({ color: 0xff8b35, alpha: Math.max(0, 0.13 - impactProgress * 0.26) });
        effectGlow.circle(ultimateEffect.x, ultimateEffect.y, radius)
          .stroke({ width: 24, color: 0xff5428, alpha: impactAlpha * 0.58 });
        scene.circle(ultimateEffect.x, ultimateEffect.y, radius)
          .fill({ color: 0xd94320, alpha: impactAlpha * 0.16 })
          .stroke({ width: 5, color: 0xffba55, alpha: impactAlpha });
        scene.circle(ultimateEffect.x, ultimateEffect.y, radius * 0.62)
          .stroke({ width: 3, color: 0xfff0a0, alpha: impactAlpha * 0.82 });
        scene.circle(ultimateEffect.x, ultimateEffect.y, 25 * (1 - impact) + 5)
          .fill({ color: 0xffffff, alpha: impactAlpha * 0.9 });

        for (let index = 0; index < 12; index += 1) {
          const angle = index / 12 * Math.PI * 2 + Math.sin(index * 8.3) * 0.13;
          const travel = impact * (45 + index % 4 * 11);
          const startRadius = 8 + index % 3 * 3;
          const sparkStart = {
            x: ultimateEffect.x + Math.cos(angle) * startRadius,
            y: ultimateEffect.y + Math.sin(angle) * startRadius,
          };
          const sparkEnd = {
            x: ultimateEffect.x + Math.cos(angle) * travel,
            y: ultimateEffect.y + Math.sin(angle) * travel,
          };
          scene.moveTo(sparkStart.x, sparkStart.y).lineTo(sparkEnd.x, sparkEnd.y)
            .stroke({ width: index % 3 === 0 ? 3 : 2, color: index % 2 === 0 ? 0xffe37c : 0xff7038, alpha: impactAlpha * 0.9 });
          scene.circle(sparkEnd.x, sparkEnd.y, 2 + index % 2)
            .fill({ color: 0xffc35b, alpha: impactAlpha * 0.8 });
        }
        for (let index = 0; index < 7; index += 1) {
          const angle = index / 7 * Math.PI * 2 + 0.3;
          const debrisDistance = impact * (24 + index % 3 * 10);
          const x = ultimateEffect.x + Math.cos(angle) * debrisDistance;
          const y = ultimateEffect.y + Math.sin(angle) * debrisDistance;
          const size = 3 + index % 3;
          scene.poly([x, y - size, x + size, y + size, x - size, y + size * 0.6], true)
            .fill({ color: 0x3c2522, alpha: impactAlpha * 0.9 })
            .stroke({ width: 1, color: 0xff8b42, alpha: impactAlpha * 0.8 });
        }
      }
    } else if (ultimateEffect.type === "blackHoleCollapse") {
      const blackHoleEffect = ultimateEffect;
      const pullProgress = Math.min(1, progress / BLACK_HOLE_IMPACT_PROGRESS);
      const pull = pullProgress * pullProgress * (3 - 2 * pullProgress);
      const collapseProgress = Math.max(0, Math.min(1, (progress - 0.6) / (BLACK_HOLE_IMPACT_PROGRESS - 0.6)));
      const suctionAlpha = Math.max(0, 1 - Math.max(0, progress - 0.6) / 0.25);
      const centerX = ultimateEffect.x;
      const centerY = ultimateEffect.y;
      scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill({ color: 0x09001c, alpha: suctionAlpha * 0.16 });
      blackHoleEffect.activation.hits.forEach(({ brickId }, index) => {
        const target = blackHoleEffect.targets[index];
        const brick = state.bricks.find((candidate) => candidate.id === brickId);
        if (!target || !brick) return;
        const origin = { x: target.x - centerX, y: target.y - centerY };
        const spinDirection = index % 2 === 0 ? 1 : -1;
        const positionAt = (value: number) => {
          const eased = value * value * (3 - 2 * value);
          const spin = spinDirection * value * Math.PI * (1.15 + index % 3 * 0.18);
          const radius = 1 - eased;
          return {
            x: centerX + (origin.x * Math.cos(spin) - origin.y * Math.sin(spin)) * radius,
            y: centerY + (origin.x * Math.sin(spin) + origin.y * Math.cos(spin)) * radius,
          };
        };
        const trail = Array.from({ length: 4 }, (_, trailIndex) => positionAt(Math.max(0, pullProgress - (3 - trailIndex) * 0.045)));
        effectGlow.moveTo(trail[0].x, trail[0].y);
        scene.moveTo(trail[0].x, trail[0].y);
        trail.slice(1).forEach((point) => {
          effectGlow.lineTo(point.x, point.y);
          scene.lineTo(point.x, point.y);
        });
        effectGlow.stroke({ width: 9, color: 0x6d5cff, alpha: suctionAlpha * 0.3 });
        scene.stroke({ width: 2, color: 0xa59cff, alpha: suctionAlpha * 0.48 });

        const position = positionAt(pullProgress);
        const scale = Math.max(0.05, (1 - pull) ** 0.78);
        const rect = brickRect(brick);
        const width = rect.width * scale;
        const height = rect.height * scale;
        effectGlow.roundRect(position.x - width / 2, position.y - height / 2, width, height, Math.min(8, height / 3))
          .stroke({ width: 9, color: 0x775cff, alpha: suctionAlpha * 0.34 });
        scene.roundRect(position.x - width / 2, position.y - height / 2, width, height, Math.min(8, height / 3))
          .fill({ color: brickColor(brick), alpha: suctionAlpha * 0.94 })
          .stroke({ width: 1.5, color: 0xd7d2ff, alpha: suctionAlpha * 0.7 });
        const label = brickLabels.get(brickId);
        if (label) {
          label.visible = true;
          label.alpha = suctionAlpha;
          label.position.set(position.x, position.y);
          label.scale.set(scale);
        }
      });
      const diskRadius = (34 + pullProgress * 11) * (1 - collapseProgress * 0.85);
      effectGlow.ellipse(ultimateEffect.x, ultimateEffect.y, diskRadius, diskRadius * 0.34)
        .stroke({ width: 16, color: 0x745cff, alpha: suctionAlpha * 0.62 });
      scene.ellipse(ultimateEffect.x, ultimateEffect.y, diskRadius, diskRadius * 0.34)
        .stroke({ width: 5, color: 0xb9a2ff, alpha: suctionAlpha });
      for (let index = 0; index < 9; index += 1) {
        const angle = index / 9 * Math.PI * 2 + progress * 15;
        const orbit = diskRadius * (0.72 + index % 3 * 0.12);
        scene.circle(ultimateEffect.x + Math.cos(angle) * orbit, ultimateEffect.y + Math.sin(angle) * orbit * 0.34, 2 + index % 2)
          .fill({ color: index % 2 === 0 ? 0x67d9ff : 0xd48cff, alpha: suctionAlpha * 0.85 });
      }
      const coreRadius = (17 + pullProgress * 10) * (1 - collapseProgress * 0.9);
      effectGlow.circle(ultimateEffect.x, ultimateEffect.y, coreRadius + 7)
        .fill({ color: 0x6d43ff, alpha: suctionAlpha * 0.52 });
      scene.circle(ultimateEffect.x, ultimateEffect.y, Math.max(3, coreRadius))
        .fill(0x000005)
        .stroke({ width: 3, color: 0xd8ceff, alpha: suctionAlpha });

      const burstProgress = Math.max(0, (progress - BLACK_HOLE_IMPACT_PROGRESS) / (1 - BLACK_HOLE_IMPACT_PROGRESS));
      if (burstProgress > 0) {
        const burst = 1 - (1 - burstProgress) ** 3;
        const burstAlpha = 1 - burstProgress;
        const radius = 8 + burst * 118;
        scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
          .fill({ color: 0xd6ccff, alpha: Math.max(0, 0.14 - burstProgress * 0.42) });
        effectGlow.ellipse(ultimateEffect.x, ultimateEffect.y, radius, radius * 0.4)
          .stroke({ width: 28, color: 0x7c5cff, alpha: burstAlpha * 0.72 });
        scene.ellipse(ultimateEffect.x, ultimateEffect.y, radius, radius * 0.4)
          .stroke({ width: 6, color: 0xe8e0ff, alpha: burstAlpha });
        const jetLength = 18 + burst * 118;
        for (const direction of [-1, 1]) {
          const end = {
            x: ultimateEffect.x + jetLength * direction,
            y: ultimateEffect.y - jetLength * 0.16 * direction,
          };
          effectGlow.moveTo(ultimateEffect.x, ultimateEffect.y).lineTo(end.x, end.y)
            .stroke({ width: 22, color: 0x4bdcff, alpha: burstAlpha * 0.58 });
          scene.moveTo(ultimateEffect.x, ultimateEffect.y).lineTo(end.x, end.y)
            .stroke({ width: 7, color: 0x8cecff, alpha: burstAlpha * 0.84 });
          scene.moveTo(ultimateEffect.x, ultimateEffect.y).lineTo(end.x, end.y)
            .stroke({ width: 2, color: 0xffffff, alpha: burstAlpha });
        }
        scene.circle(ultimateEffect.x, ultimateEffect.y, 11 - burst * 5)
          .fill(0x000005)
          .stroke({ width: 3, color: 0xb8f5ff, alpha: burstAlpha });
      }
    } else if (ultimateEffect.type === "crossfire") {
      const charge = Math.min(1, progress / 0.24);
      const fireProgress = Math.max(0, (progress - 0.2) / 0.8);
      const beamAlpha = Math.min(1, fireProgress * 6) * Math.min(1, (1 - progress) / 0.2);
      for (let offset = -1; offset <= 1; offset += 1) {
        const y = ultimateEffect.y + offset * CELL_HEIGHT;
        const x = ultimateEffect.x + offset * (CELL_WIDTH + GRID_GAP);
        scene.moveTo(0, y).lineTo(BOARD_WIDTH, y)
          .stroke({ width: 1, color: 0x5be7ff, alpha: charge * (1 - Math.min(1, fireProgress * 5)) * 0.62 });
        scene.moveTo(x, 0).lineTo(x, BOARD_HEIGHT)
          .stroke({ width: 1, color: 0x5be7ff, alpha: charge * (1 - Math.min(1, fireProgress * 5)) * 0.62 });
        if (fireProgress <= 0) continue;
        const entry = Math.min(1, fireProgress * 5 - Math.abs(offset) * 0.16);
        if (entry <= 0) continue;
        const leftEnd = ultimateEffect.x * entry;
        const rightStart = BOARD_WIDTH - (BOARD_WIDTH - ultimateEffect.x) * entry;
        const topEnd = ultimateEffect.y * entry;
        const bottomStart = BOARD_HEIGHT - (BOARD_HEIGHT - ultimateEffect.y) * entry;
        effectGlow.moveTo(0, y).lineTo(leftEnd, y).moveTo(BOARD_WIDTH, y).lineTo(rightStart, y)
          .stroke({ width: 22, color: 0x23dfff, alpha: beamAlpha * 0.55 });
        effectGlow.moveTo(x, 0).lineTo(x, topEnd).moveTo(x, BOARD_HEIGHT).lineTo(x, bottomStart)
          .stroke({ width: 22, color: 0x23dfff, alpha: beamAlpha * 0.55 });
        scene.moveTo(0, y).lineTo(leftEnd, y).moveTo(BOARD_WIDTH, y).lineTo(rightStart, y)
          .stroke({ width: 10, color: 0x43dfff, alpha: beamAlpha * 0.78 });
        scene.moveTo(x, 0).lineTo(x, topEnd).moveTo(x, BOARD_HEIGHT).lineTo(x, bottomStart)
          .stroke({ width: 10, color: 0x43dfff, alpha: beamAlpha * 0.78 });
        scene.moveTo(0, y).lineTo(leftEnd, y).moveTo(BOARD_WIDTH, y).lineTo(rightStart, y)
          .stroke({ width: 3, color: 0xffffff, alpha: beamAlpha });
        scene.moveTo(x, 0).lineTo(x, topEnd).moveTo(x, BOARD_HEIGHT).lineTo(x, bottomStart)
          .stroke({ width: 3, color: 0xffffff, alpha: beamAlpha });
      }
      if (fireProgress > 0) {
        const flashRadius = 10 + Math.min(1, fireProgress * 5) * 34;
        effectGlow.circle(ultimateEffect.x, ultimateEffect.y, flashRadius)
          .fill({ color: 0x3ce7ff, alpha: beamAlpha * 0.5 });
        scene.circle(ultimateEffect.x, ultimateEffect.y, flashRadius)
          .stroke({ width: 4, color: 0xffffff, alpha: beamAlpha * 0.84 });
      }
    } else if (ultimateEffect.type === "fusionChain") {
      const count = Math.max(1, ultimateEffect.targets.length);
      scene.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
        .fill({ color: 0xff6328, alpha: Math.max(0, 0.045 - progress * 0.03) });
      ultimateEffect.targets.forEach((target, index) => {
        const ignition = index / count * FUSION_IGNITION_SPAN;
        const localProgress = Math.max(0, Math.min(1, (progress - ignition) / 0.32));
        if (localProgress <= 0) return;
        const expansion = 1 - (1 - localProgress) ** 3;
        const localAlpha = 1 - localProgress;
        const radius = 5 + expansion * (18 + index % 3 * 3);
        effectGlow.circle(target.x, target.y, radius)
          .fill({ color: 0xff4b20, alpha: localAlpha * 0.5 })
          .stroke({ width: 15, color: 0xff692d, alpha: localAlpha * 0.58 });
        scene.circle(target.x, target.y, radius)
          .fill({ color: 0xff6c28, alpha: localAlpha * 0.3 })
          .stroke({ width: 4, color: index % 2 === 0 ? 0xffffbc : 0xffb34f, alpha: localAlpha });
        scene.roundRect(target.x - CELL_WIDTH * 0.34, target.y - BRICK_HEIGHT * 0.34, CELL_WIDTH * 0.68, BRICK_HEIGHT * 0.68, 4)
          .fill({ color: 0xffffff, alpha: Math.max(0, 1 - localProgress * 5) * 0.92 });
        scene.circle(target.x, target.y, Math.max(2, 12 * (1 - expansion)))
          .fill({ color: 0xffffff, alpha: localAlpha * 0.95 });
        for (let spark = 0; spark < 5; spark += 1) {
          const angle = spark / 5 * Math.PI * 2 + index * 1.13;
          const sparkDistance = expansion * (18 + spark * 4);
          scene.moveTo(target.x + Math.cos(angle) * sparkDistance * 0.28, target.y + Math.sin(angle) * sparkDistance * 0.28)
            .lineTo(target.x + Math.cos(angle) * sparkDistance, target.y + Math.sin(angle) * sparkDistance)
            .stroke({ width: spark % 2 === 0 ? 3 : 2, color: spark % 2 === 0 ? 0xffffa8 : 0xff5b27, alpha: localAlpha * 0.92 });
          scene.circle(target.x + Math.cos(angle) * sparkDistance, target.y + Math.sin(angle) * sparkDistance, 1.5 + spark % 2)
            .fill({ color: 0xffd56a, alpha: localAlpha * 0.86 });
        }
      });
    } else {
      const count = Math.max(1, ultimateEffect.targets.length);
      ultimateEffect.targets.forEach((target, index) => {
        const launchDelay = index / count * MISSILE_LAUNCH_SPAN;
        const localProgress = Math.max(0, Math.min(1, (progress - launchDelay) / MISSILE_LOCAL_DURATION));
        if (localProgress <= 0) return;
        const flightProgress = Math.min(1, localProgress / MISSILE_IMPACT_LOCAL_PROGRESS);
        const side = index % 3;
        const origin = side === 0
          ? { x: target.x - 90 + index % 5 * 38, y: -30 }
          : side === 1
            ? { x: -32, y: Math.max(25, target.y - 110 + index % 4 * 35) }
            : { x: BOARD_WIDTH + 32, y: Math.max(25, target.y - 120 + index % 4 * 32) };
        const originDx = target.x - origin.x;
        const originDy = target.y - origin.y;
        const originDistance = Math.hypot(originDx, originDy) || 1;
        const curveNormal = { x: -originDy / originDistance, y: originDx / originDistance };
        const curve = Math.sin(index * 5.17) * 48;
        const control = {
          x: (origin.x + target.x) / 2 + curveNormal.x * curve,
          y: (origin.y + target.y) / 2 + curveNormal.y * curve,
        };
        if (flightProgress < 1) {
          const flight = 1 - (1 - flightProgress) ** 2;
          const inverse = 1 - flight;
          const position = {
            x: inverse * inverse * origin.x + 2 * inverse * flight * control.x + flight * flight * target.x,
            y: inverse * inverse * origin.y + 2 * inverse * flight * control.y + flight * flight * target.y,
          };
          const velocity = {
            x: 2 * inverse * (control.x - origin.x) + 2 * flight * (target.x - control.x),
            y: 2 * inverse * (control.y - origin.y) + 2 * flight * (target.y - control.y),
          };
          drawMissile(effectGlow, scene, position, velocity, Math.min(1, localProgress * 8));
        } else {
          const explosionProgress = (localProgress - MISSILE_IMPACT_LOCAL_PROGRESS) / (1 - MISSILE_IMPACT_LOCAL_PROGRESS);
          const explosion = 1 - (1 - explosionProgress) ** 3;
          const explosionAlpha = 1 - explosionProgress;
          const radius = 4 + explosion * 24;
          effectGlow.circle(target.x, target.y, radius)
            .fill({ color: 0xff3f4f, alpha: explosionAlpha * 0.42 });
          scene.circle(target.x, target.y, radius)
            .fill({ color: 0xff693d, alpha: explosionAlpha * 0.22 })
            .stroke({ width: 3, color: 0xffe28a, alpha: explosionAlpha });
          scene.circle(target.x, target.y, Math.max(2, 10 * (1 - explosion)))
            .fill({ color: 0xffffff, alpha: explosionAlpha });
        }
      });
    }
  }

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
  const presence = blackHolePresence(blackHoleTime) * blackHoleClearFade(blackHoleClearFadeTime);
  if (presence <= 0) {
    ball.blackHoleId = null;
    return false;
  }

  let nearest: { item: FieldItem; center: Vec2; distance: number } | null = null;
  state.items.forEach((item) => {
    if (item.type !== "blackhole" || (item.charges ?? 1) <= 0) return;
    const center = itemCenter(item);
    const distance = Math.hypot(center.x - ball.x, center.y - ball.y);
    if (distance <= BLACK_HOLE_INFLUENCE_RADIUS && (!nearest || distance < nearest.distance)) {
      nearest = { item, center, distance };
    }
  });
  if (!nearest) {
    ball.blackHoleId = null;
    return false;
  }

  const target = nearest as { item: FieldItem; center: Vec2; distance: number };
  if (target.distance <= BLACK_HOLE_CAPTURE_RADIUS && presence >= 0.7) {
    const remaining = captureBallByBlackHole(state, target.item.id);
    if (remaining !== null) {
      playSound("blackhole_capture");
      boardSignature = "";
      syncUi();
      return true;
    }
  }

  if (ball.blackHoleId !== target.item.id && target.distance > BLACK_HOLE_CAPTURE_RADIUS) {
    const speed = Math.hypot(ball.vx, ball.vy);
    const angle = blackHoleDeflectionAngle(
      { x: ball.vx, y: ball.vy },
      { x: target.center.x - ball.x, y: target.center.y - ball.y },
    );
    if (speed > 0 && angle !== 0) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const nextVx = ball.vx * cosine - ball.vy * sine;
      const nextVy = ball.vx * sine + ball.vy * cosine;
      ball.vx = nextVx;
      ball.vy = nextVy;
    }
    ball.blackHoleId = target.item.id;
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
      const collectedItem = collectItem(state, hitItem.id);
      const itemType = collectedItem?.type;
      if (itemType) ball.bounceCount = 0;
      if (collectedItem?.ballCountDelta === 1) {
        const speed = Math.hypot(ball.vx, ball.vy) || 1;
        activeBalls.push(Object.assign(ballPool.acquire(), ball, {
          x: ball.x - ball.vx / speed * MULTIBALL_TRAIL_DISTANCE,
          y: ball.y - ball.vy / speed * MULTIBALL_TRAIL_DISTANCE,
          delay: 0,
          bounceCount: 0,
          blackHoleId: null,
        }));
      }
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
  const paused = helpOpen || optionsOpen || resetConfirmOpen || rankingOpen || state.gameStatus === "reward";
  if (!paused && (state.gameStatus === "aiming" || state.gameStatus === "volley")) {
    const activeTimeMs = Math.min(delta, 0.032) * 1000;
    purePlayTimeMs += activeTimeMs;
    state.stagePlayTimeMs += activeTimeMs;
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
  if (ultimateEffect) {
    ultimateEffect.elapsed += delta;
    const duration = ULTIMATE_EFFECT_DURATIONS[ultimateEffect.type];
    const progress = Math.min(1, ultimateEffect.elapsed / duration);
    const appliedHits = resolveUltimateHits(state, ultimateEffect.activation, ultimateHitCount(ultimateEffect, progress));
    if (appliedHits > 0) {
      playSound(ultimateEffect.type === "orbitalLaser" || ultimateEffect.type === "crossfire" ? "laser" : "bomb", {
        playbackRate: ultimateEffect.type === "chainLightning" ? 1.18 : ultimateEffect.type === "missileBarrage" ? 0.82 : 0.9,
      });
      pullLaserEffects();
      boardSignature = "";
      syncUi();
    }
    if (ultimateEffect.elapsed >= duration) {
      ultimateEffect = null;
      if (debugUltimateActive) restoreDebugState();
      else if (state.gameStatus === "reward") ultimateResultDelay = ULTIMATE_RESULT_DELAY;
    }
  }
  if (ultimateResultDelay > 0) {
    ultimateResultDelay = Math.max(0, ultimateResultDelay - delta);
    if (ultimateResultDelay === 0 && state.gameStatus === "reward") {
      playSound("stage_clear");
      syncUi();
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
      blackHoleClearFadeTime = 0;
    } else {
      blackHoleTime += delta;
      const nextCycle = Math.floor(blackHoleTime / BLACK_HOLE_CYCLE_DURATION);
      if (nextCycle > blackHoleCycle) {
        blackHoleCycle = nextCycle;
        if (relocateBlackHoles(state, blackHoleCycle)) boardSignature = "";
      }
    }
  }
  blackHoleClearFadeTime = state.bricks.some((brick) => brick.type !== "steel")
    ? 0
    : Math.min(BLACK_HOLE_CLEAR_FADE_DURATION, blackHoleClearFadeTime + delta);
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
      const shieldRewound = finishVolley(state, firstLandingX ?? state.launchPosition.x);
      if (shieldRewound) {
        shieldRewindEffect = timedEffectPool.acquire();
        playSound("shield_rewind");
      } else if ((state.gameStatus as GameStatus) === "reward") {
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
      blackHoleId: null,
    }));
  }
  window.setTimeout(() => location.reload(), 7000);
}

app.ticker.add((ticker) => {
  update(ticker.deltaMS / 1000);
  if (!fpsVisible) return;
  fpsSampleElapsedMs += ticker.elapsedMS;
  if (fpsSampleElapsedMs < FPS_SAMPLE_INTERVAL_MS) return;
  fpsSampleElapsedMs %= FPS_SAMPLE_INTERVAL_MS;
  fpsValue.textContent = formatFps(ticker.FPS);
  fpsMonitor.dataset.level = getFpsLevel(ticker.FPS);
});
syncAudioOptions();
syncFpsOption();
void preloadAudio();
syncUi();
}
