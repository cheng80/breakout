export const BOARD_WIDTH = 360;
export const BOARD_HEIGHT = 602;
export const GRID_COLUMNS = 8;
export const GRID_TOP = 42;
export const CELL_HEIGHT = 42;
export const BRICK_HEIGHT = 34;
export const DANGER_ROW = 10;
export const DANGER_Y = GRID_TOP + DANGER_ROW * CELL_HEIGHT + BRICK_HEIGHT;
export const FLOOR_Y = BOARD_HEIGHT - 40;
export const MAX_BALLS = 80;
export const MAX_BRICK_HP = 50;
export const BOMB_EFFECT_DURATION = 0.5;
export const LASER_EFFECT_DURATION = 0.45;
export const SHIELD_REWIND_DURATION = 0.85;
export const BRICK_HIT_EFFECT_DURATION = 0.18;
export const BLACK_HOLE_INFLUENCE_RADIUS = 110;
export const BLACK_HOLE_CAPTURE_RADIUS = 9;
export const BLACK_HOLE_MIN_DEFLECTION_ANGLE = Math.PI / 6;
export const BLACK_HOLE_CYCLE_DURATION = 5;
export const BLACK_HOLE_CLEAR_FADE_DURATION = 0.15;
export const MULTIBALL_SCORE = 50;

export function maxBallsForStage(stage: number): number {
  const normalizedStage = Math.max(1, stage);
  if (normalizedStage <= 20) return 30;
  if (normalizedStage <= 30) return 40;
  if (normalizedStage <= 40) return 50;
  if (normalizedStage <= 50) return 60;
  if (normalizedStage <= 70) return 70;
  return MAX_BALLS;
}

export function volleySpeedMultiplier(ballCount: number): number {
  return 1 + (Math.min(MAX_BALLS, Math.max(30, ballCount)) - 30) / 140;
}

export type GameStatus = "ready" | "aiming" | "volley" | "reward" | "gameOver";
export type FieldItemType = "bomb" | "multiball" | "shield" | "power" | "power3" | "power4" | "trap" | "blackhole";
export type UltimateItemType =
  | "antimatter"
  | "orbitalLaser"
  | "chainLightning"
  | "meteorImpact"
  | "blackHoleCollapse"
  | "crossfire"
  | "fusionChain"
  | "missileBarrage";
export type BrickType = "normal" | "laser" | "steel";

export const ULTIMATE_SLOT_COUNT = 2;

export function orbitalLaserStartColumn(targetColumn: number): number {
  return Math.max(0, Math.min(GRID_COLUMNS - 3, targetColumn - 1));
}

function blackHoleChargesForStage(stage: number): number {
  return stage >= 31 ? 2 : 1;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface AimBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface AimObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AimSegment {
  start: Vec2;
  end: Vec2;
}

export function bombEffectFrame(elapsed: number): { radius: number; alpha: number } {
  const progress = Math.min(1, Math.max(0, elapsed / BOMB_EFFECT_DURATION));
  return {
    radius: 24 + 66 * (1 - (1 - progress) ** 2),
    alpha: 1 - progress,
  };
}

export function laserEffectFrame(elapsed: number): { spread: number; alpha: number } {
  const progress = Math.min(1, Math.max(0, elapsed / LASER_EFFECT_DURATION));
  return {
    spread: Math.min(1, progress * 3),
    alpha: 1 - progress,
  };
}

export function brickHitEffectFrame(elapsed: number): { scale: number; alpha: number } {
  const progress = Math.min(1, Math.max(0, elapsed / BRICK_HIT_EFFECT_DURATION));
  const pulse = Math.sin(Math.PI * progress);
  return { scale: 1 + pulse * 0.08, alpha: pulse };
}

export function shieldRewindFrame(elapsed: number): { offset: number; flash: number } {
  const progress = Math.min(1, Math.max(0, elapsed / SHIELD_REWIND_DURATION));
  const downEnd = 0.34;
  const rewindStart = 0.58;
  let offset = CELL_HEIGHT;

  if (progress <= downEnd) {
    const phase = progress / downEnd;
    offset *= 1 - (1 - phase) ** 3;
  } else if (progress >= rewindStart) {
    const phase = (progress - rewindStart) / (1 - rewindStart);
    const eased = phase * phase * (3 - 2 * phase);
    offset *= 1 - eased;
  }

  return {
    offset,
    flash: Math.max(0, 1 - Math.abs(progress - 0.48) / 0.18),
  };
}

export function blackHolePullStrength(distance: number): number {
  const proximity = Math.min(1, Math.max(0, 1 - distance / BLACK_HOLE_INFLUENCE_RADIUS));
  return proximity ** 2;
}

export function blackHoleDeflectionAngle(velocity: Vec2, toCenter: Vec2): number {
  const velocityAngle = Math.atan2(velocity.y, velocity.x);
  const targetAngle = Math.atan2(toCenter.y, toCenter.x);
  const difference = Math.atan2(Math.sin(targetAngle - velocityAngle), Math.cos(targetAngle - velocityAngle));
  return Math.sign(difference) * Math.min(Math.abs(difference), BLACK_HOLE_MIN_DEFLECTION_ANGLE);
}

export function blackHolePresence(elapsed: number): number {
  const phase = ((elapsed % BLACK_HOLE_CYCLE_DURATION) + BLACK_HOLE_CYCLE_DURATION) % BLACK_HOLE_CYCLE_DURATION;
  if (phase < 0.3) return 1 - (1 - phase / 0.3) ** 3;
  if (phase < 4.3) return 1;
  if (phase < 4.65) return 1 - ((phase - 4.3) / 0.35) ** 3;
  return 0;
}

export function blackHoleClearFade(elapsed: number): number {
  const progress = Math.max(0, Math.min(1, elapsed / BLACK_HOLE_CLEAR_FADE_DURATION));
  return 1 - progress ** 3;
}

export interface Brick {
  id: string;
  row: number;
  column: number;
  hp: number;
  maxHp: number;
  type: BrickType;
}

export interface LaserTrigger {
  row: number;
  column: number;
}

export interface FieldItem {
  id: string;
  row: number;
  column: number;
  type: FieldItemType;
  charges?: number;
}

export interface StageResult {
  score: number;
  targetScore: number;
  timeMs: number;
  targetTimeMs: number;
  stars: number;
}

export interface UltimateActivation {
  type: UltimateItemType;
  targets: Array<Pick<Brick, "row" | "column">>;
  hits: Array<{ brickId: string; damage: number }>;
  resolvedHitCount: number;
  resolved: boolean;
}

export interface GameState {
  stage: number;
  score: number;
  ballCount: number;
  launchPosition: Vec2;
  bricks: Brick[];
  items: FieldItem[];
  ultimateInventory: Array<UltimateItemType | null>;
  pendingUltimateReward: UltimateItemType | null;
  stageResult: StageResult | null;
  stageScore: number;
  stageTargetScore: number;
  stagePlayTimeMs: number;
  stageTargetTimeMs: number;
  stageUltimateUseCount: number;
  gameStatus: GameStatus;
  shield: boolean;
  powerTurns: number;
  powerMultiplier: number;
  pendingLaserTriggers: LaserTrigger[];
  turn: number;
}

const layouts = [
  [".1.11.1.", "..1111..", "...M...."],
  ["2.2..2.2", ".22L222.", ".PB..M..", ".2.22.2.", "2..22..2"],
  ["333..333", "3..3X..3", ".3.S..3.", "..3333..", "3.M..B.3"],
  ["44.44.44", ".444444.", "4.B..M.4", ".44..44.", "44.SS.44"],
  ["55555555", "5.5..5.5", ".555555.", "5.BMS..5", ".55..55.", "555..555"],
] as const;

const itemTypes: Record<string, FieldItemType> = {
  B: "bomb",
  M: "multiball",
  S: "shield",
  P: "power",
};

function lowestSafeBlackHoleCells(occupied: Set<string>, excludedCell?: string): Array<{ row: number; column: number }> {
  const openCells = Array.from({ length: (DANGER_ROW - 1) * GRID_COLUMNS }, (_, index) => ({
    row: Math.floor(index / GRID_COLUMNS),
    column: index % GRID_COLUMNS,
  })).filter((cell) => {
    const key = `${cell.row}:${cell.column}`;
    const centerY = GRID_TOP + cell.row * CELL_HEIGHT + BRICK_HEIGHT / 2;
    return key !== excludedCell && !occupied.has(key) && DANGER_Y - centerY > BLACK_HOLE_INFLUENCE_RADIUS;
  });
  const lowestRow = Math.max(...openCells.map((cell) => cell.row));
  return openCells.filter((cell) => cell.row === lowestRow);
}

function proceduralBoard(stage: number): Pick<GameState, "bricks" | "items"> {
  let seed = Math.imul(stage, 0x9e3779b1) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const rows = stage >= 31 ? 7 : Math.min(6, 4 + Math.floor((stage - 6) / 5));
  const targetPairs = Math.min(rows * 4 - 2, Math.ceil((12 + stage) / 2));
  const candidates = Array.from({ length: rows * 4 }, (_, index) => ({
    row: Math.floor(index / 4),
    column: index % 4,
    noise: random(),
  }));
  const pattern = stage % 5;
  const priority = ({ row, column, noise }: (typeof candidates)[number]) => {
    if (pattern === 1) return ((row + column + stage) % 2 === 0 ? 0 : 2) + noise;
    if (pattern === 2) return Math.abs(column - ((row + Math.floor(stage / 5)) % 4)) + noise * 0.35;
    if (pattern === 3) return column + noise * 0.35;
    if (pattern === 4) return Math.min(row, rows - 1 - row, column, 3 - column) + noise * 0.35;
    return noise;
  };
  candidates.sort((a, b) => priority(a) - priority(b));

  const bricks: Brick[] = [];
  const baseHp = Math.min(MAX_BRICK_HP, stage + 1);
  candidates.slice(0, targetPairs).forEach(({ row, column }, index) => {
    const hp = Math.min(MAX_BRICK_HP, Math.max(1, baseHp + Math.floor(random() * 3) - 1));
    for (const mirroredColumn of new Set([column, GRID_COLUMNS - 1 - column])) {
      bricks.push({
        id: `s${stage}-b${row}-${mirroredColumn}-${index}`,
        row,
        column: mirroredColumn,
        hp,
        maxHp: hp,
        type: "normal",
      });
    }
  });

  const specialBricks = [...bricks].sort(() => random() - 0.5);
  const laserCount = stage >= 31 ? 3 : stage >= 16 ? 2 : 1;
  specialBricks.slice(0, laserCount).forEach((brick) => (brick.type = "laser"));
  if (specialBricks[laserCount]) Object.assign(specialBricks[laserCount], { type: "steel", hp: 0, maxHp: 0 });

  const occupied = new Set(bricks.map((brick) => `${brick.row}:${brick.column}`));
  const openCells = Array.from({ length: rows * GRID_COLUMNS }, (_, index) => ({
    row: Math.floor(index / GRID_COLUMNS),
    column: index % GRID_COLUMNS,
  })).filter((cell) => !occupied.has(`${cell.row}:${cell.column}`));
  openCells.sort(() => random() - 0.5);
  const hasBlackHole = stage >= 10 && (stage - 10) % 3 === 0;
  let itemOrder: FieldItemType[];
  if (stage >= 31) {
    itemOrder = ["multiball", "power3", "power4", "bomb", "bomb"];
    if (stage % 3 === 0) itemOrder.push("shield");
    itemOrder.push("trap", "trap");
  } else if (stage >= 16) {
    itemOrder = ["multiball", "power", "power3", "bomb"];
    if (stage % 3 === 0) itemOrder.push("shield");
    itemOrder.push("trap");
  } else {
    itemOrder = ["multiball", "power"];
    if (stage % 2 === 0) itemOrder.push("bomb");
    if (stage % 3 === 0) itemOrder.push("shield");
    if (stage >= 11 && itemOrder.length < 4) itemOrder.push("trap");
  }
  const itemLimit = stage >= 31 ? 7 : stage >= 16 ? 5 : 4;
  const items = itemOrder.slice(0, Math.min(itemLimit, openCells.length)).map((type, index) => {
    const item: FieldItem = { id: `s${stage}-i${index}`, ...openCells[index], type };
    return item;
  });
  if (hasBlackHole) {
    const blackHoleCells = lowestSafeBlackHoleCells(new Set([
      ...occupied,
      ...items.map((item) => `${item.row}:${item.column}`),
    ]));
    const destination = blackHoleCells[Math.floor(random() * blackHoleCells.length)];
    if (destination) items.push({ id: `s${stage}-i${items.length}`, ...destination, type: "blackhole", charges: blackHoleChargesForStage(stage) });
  }

  return { bricks, items };
}

function stageBoard(stage: number): Pick<GameState, "bricks" | "items"> {
  if (stage > layouts.length) return proceduralBoard(stage);
  const bricks: Brick[] = [];
  const items: FieldItem[] = [];
  const layout = layouts[stage - 1];

  layout.forEach((line, row) => {
    [...line].forEach((cell, column) => {
      if (/\d|L|X/.test(cell)) {
        const type: BrickType = cell === "L" ? "laser" : cell === "X" ? "steel" : "normal";
        const hp = type === "steel" ? 0 : cell === "L" ? stage : Number(cell) + Math.floor((stage - 1) / 2);
        bricks.push({ id: `s${stage}-b${row}-${column}`, row, column, hp, maxHp: hp, type });
      } else if (itemTypes[cell]) {
        items.push({ id: `s${stage}-i${row}-${column}`, row, column, type: itemTypes[cell] });
      }
    });
  });

  return { bricks, items };
}

export function createGame(): GameState {
  const board = stageBoard(1);
  return {
    stage: 1,
    score: 0,
    ballCount: 1,
    launchPosition: { x: BOARD_WIDTH / 2, y: FLOOR_Y },
    ...board,
    ultimateInventory: Array.from({ length: ULTIMATE_SLOT_COUNT }, () => null),
    pendingUltimateReward: null,
    stageResult: null,
    stageScore: 0,
    stagePlayTimeMs: 0,
    ...stageGoals(board.bricks, board.items),
    stageUltimateUseCount: 0,
    gameStatus: "ready",
    shield: false,
    powerTurns: 0,
    powerMultiplier: 1,
    pendingLaserTriggers: [],
    turn: 0,
  };
}

export function resetGame(state: GameState, stage = 1, ballCount = 1): void {
  const nextStage = Number.isSafeInteger(stage) && stage >= 1 ? stage : 1;
  const board = stageBoard(nextStage);
  const nextBallCount = Number.isSafeInteger(ballCount) ? Math.max(1, Math.min(maxBallsForStage(nextStage), ballCount)) : 1;
  Object.assign(state, createGame(), board, stageGoals(board.bricks, board.items), { stage: nextStage, ballCount: nextBallCount });
}

export function aimFromDrag(start: Vec2, current: Vec2): Vec2 | null {
  const dx = current.x - start.x;
  const rawDy = current.y - start.y;
  if (Math.hypot(dx, rawDy) < 12) return null;

  const dy = Math.min(rawDy, -20);
  const length = Math.hypot(dx, dy);
  let x = dx / length;
  let y = dy / length;

  if (y > -0.28) {
    y = -0.28;
    x = Math.sign(x || 1) * Math.sqrt(1 - y * y);
  }

  return { x, y };
}

export function stabilizeBounce(velocity: Vec2, bounceCount: number): Vec2 {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed === 0) return velocity;

  const currentRatio = Math.abs(velocity.y) / speed;
  const escapeBounce = bounceCount > 0 && bounceCount % 8 === 0;
  if (currentRatio >= 0.2 && !escapeBounce) return velocity;

  const verticalRatio = currentRatio < 0.2
    ? [0.24, 0.28, 0.32][bounceCount % 3]
    : Math.max(0.24, Math.min(0.85, currentRatio + (Math.floor(bounceCount / 8) % 2 ? 0.06 : -0.06)));
  const y = Math.sign(velocity.y || 1) * speed * verticalRatio;
  return {
    x: Math.sign(velocity.x || 1) * Math.sqrt(speed ** 2 - y ** 2),
    y,
  };
}

export function resolveCircleRectCollision(
  position: Vec2,
  velocity: Vec2,
  rect: AimObstacle,
  radius: number,
): { position: Vec2; velocity: Vec2 } | null {
  const nearestX = Math.max(rect.x, Math.min(position.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(position.y, rect.y + rect.height));
  const offsetX = position.x - nearestX;
  const offsetY = position.y - nearestY;
  const distanceSquared = offsetX ** 2 + offsetY ** 2;
  if (distanceSquared > radius ** 2) return null;

  let normal: Vec2;
  let correctedPosition: Vec2;
  if (distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared);
    normal = { x: offsetX / distance, y: offsetY / distance };
    const correction = radius - distance + 0.01;
    correctedPosition = {
      x: position.x + normal.x * correction,
      y: position.y + normal.y * correction,
    };
  } else {
    const exits = [
      { distance: Math.abs(position.x - (rect.x - radius)), position: { x: rect.x - radius - 0.01, y: position.y }, normal: { x: -1, y: 0 } },
      { distance: Math.abs(position.x - (rect.x + rect.width + radius)), position: { x: rect.x + rect.width + radius + 0.01, y: position.y }, normal: { x: 1, y: 0 } },
      { distance: Math.abs(position.y - (rect.y - radius)), position: { x: position.x, y: rect.y - radius - 0.01 }, normal: { x: 0, y: -1 } },
      { distance: Math.abs(position.y - (rect.y + rect.height + radius)), position: { x: position.x, y: rect.y + rect.height + radius + 0.01 }, normal: { x: 0, y: 1 } },
    ];
    const exit = exits.sort((a, b) => a.distance - b.distance)[0];
    normal = exit.normal;
    correctedPosition = exit.position;
  }

  const dot = velocity.x * normal.x + velocity.y * normal.y;
  return {
    position: correctedPosition,
    velocity: dot < 0
      ? { x: velocity.x - 2 * dot * normal.x, y: velocity.y - 2 * dot * normal.y }
      : velocity,
  };
}

function rayRectHit(origin: Vec2, direction: Vec2, obstacle: AimObstacle, padding: number) {
  const ranges = [
    { origin: origin.x, direction: direction.x, min: obstacle.x - padding, max: obstacle.x + obstacle.width + padding, axis: "x" },
    { origin: origin.y, direction: direction.y, min: obstacle.y - padding, max: obstacle.y + obstacle.height + padding, axis: "y" },
  ] as const;
  let near = -Infinity;
  let far = Infinity;
  let normal: Vec2 = { x: 0, y: 0 };

  for (const range of ranges) {
    if (Math.abs(range.direction) < 0.0001) {
      if (range.origin < range.min || range.origin > range.max) return null;
      continue;
    }
    const first = (range.min - range.origin) / range.direction;
    const second = (range.max - range.origin) / range.direction;
    const axisNear = Math.min(first, second);
    const axisFar = Math.max(first, second);
    if (axisNear > near) {
      near = axisNear;
      normal = range.axis === "x"
        ? { x: range.direction > 0 ? -1 : 1, y: 0 }
        : { x: 0, y: range.direction > 0 ? -1 : 1 };
    }
    far = Math.min(far, axisFar);
    if (near > far) return null;
  }

  return near > 0.01 ? { distance: near, normal } : null;
}

export function traceAimPath(
  origin: Vec2,
  direction: Vec2,
  bounds: AimBounds,
  obstacles: AimObstacle[],
  maxReflections = 2,
  padding = 0,
): AimSegment[] {
  const length = Math.hypot(direction.x, direction.y);
  let rayDirection = { x: direction.x / length, y: direction.y / length };
  let rayOrigin = { ...origin };
  let segmentStart = { ...origin };
  const segments: AimSegment[] = [];

  for (let reflection = 0; reflection <= maxReflections; reflection += 1) {
    const hits: Array<{ distance: number; normal: Vec2; terminal?: boolean }> = [];
    if (rayDirection.x < 0) hits.push({ distance: (bounds.minX - rayOrigin.x) / rayDirection.x, normal: { x: 1, y: 0 } });
    if (rayDirection.x > 0) hits.push({ distance: (bounds.maxX - rayOrigin.x) / rayDirection.x, normal: { x: -1, y: 0 } });
    if (rayDirection.y < 0) hits.push({ distance: (bounds.minY - rayOrigin.y) / rayDirection.y, normal: { x: 0, y: 1 } });
    if (rayDirection.y > 0) hits.push({ distance: (bounds.maxY - rayOrigin.y) / rayDirection.y, normal: { x: 0, y: -1 }, terminal: true });
    obstacles.forEach((obstacle) => {
      const hit = rayRectHit(rayOrigin, rayDirection, obstacle, padding);
      if (hit) hits.push(hit);
    });

    const hit = hits.filter((candidate) => candidate.distance > 0.01).sort((a, b) => a.distance - b.distance)[0];
    if (!hit) break;
    const end = {
      x: rayOrigin.x + rayDirection.x * hit.distance,
      y: rayOrigin.y + rayDirection.y * hit.distance,
    };
    segments.push({ start: segmentStart, end });
    if (hit.terminal || reflection === maxReflections) break;

    const dot = rayDirection.x * hit.normal.x + rayDirection.y * hit.normal.y;
    rayDirection = {
      x: rayDirection.x - 2 * dot * hit.normal.x,
      y: rayDirection.y - 2 * dot * hit.normal.y,
    };
    segmentStart = end;
    rayOrigin = { x: end.x + rayDirection.x * 0.05, y: end.y + rayDirection.y * 0.05 };
  }

  return segments;
}

export function prepareVolley(state: GameState): number {
  state.ballCount = Math.max(1, Math.min(maxBallsForStage(state.stage), state.ballCount));
  state.gameStatus = "volley";
  return state.ballCount;
}

export function damageBrick(state: GameState, brickId: string, damage = 1): boolean {
  const brick = state.bricks.find((candidate) => candidate.id === brickId);
  if (!brick || brick.type === "steel") return false;

  const applied = Math.min(brick.hp, Math.max(0, damage));
  brick.hp -= applied;
  addScore(state, applied * 10);

  if (brick.hp <= 0) {
    const cleared = brick.type === "laser"
      ? state.bricks.filter((candidate) => candidate.row === brick.row && candidate.type !== "steel")
      : [brick];
    state.bricks = state.bricks.filter((candidate) => !cleared.includes(candidate));
    addScore(state, cleared
      .filter((candidate) => candidate !== brick)
      .reduce((score, candidate) => score + candidate.hp * 10 + 40, 0));
    addScore(state, 40);
    if (brick.type === "laser") state.pendingLaserTriggers.push({ row: brick.row, column: brick.column });
    return true;
  }
  return false;
}

export function consumeLaserTriggers(state: GameState): LaserTrigger[] {
  return state.pendingLaserTriggers.splice(0);
}

export function hitBrickWithBall(state: GameState, brickId: string): boolean {
  return damageBrick(state, brickId, state.powerTurns > 0 ? state.powerMultiplier : 1);
}

export function useUltimateItem(
  state: GameState,
  slot: number,
  target: Pick<Brick, "row" | "column">,
  deferResolution = false,
): UltimateActivation | null {
  if (state.gameStatus !== "ready" || !Number.isInteger(slot) || !Number.isInteger(target.row) || !Number.isInteger(target.column)) return null;
  if (slot < 0 || slot >= ULTIMATE_SLOT_COUNT || target.row < 0 || target.row >= DANGER_ROW || target.column < 0 || target.column >= GRID_COLUMNS) return null;
  const type = state.ultimateInventory[slot];
  if (!type) return null;

  const destructible = state.bricks.filter((brick) => brick.type !== "steel");
  const distance = (brick: Brick) => Math.abs(brick.row - target.row) + Math.abs(brick.column - target.column);
  const orbitalStartColumn = orbitalLaserStartColumn(target.column);
  const fusionTargets = () => {
    const remaining = [...destructible];
    const result: Brick[] = [];
    const frontier = remaining.sort((a, b) => distance(a) - distance(b)).slice(0, 1);
    while (result.length < 18 && remaining.length > 0) {
      const next = frontier.shift() ?? remaining[0];
      const index = remaining.indexOf(next);
      if (index < 0) continue;
      remaining.splice(index, 1);
      result.push(next);
      frontier.push(...remaining
        .filter((brick) => Math.max(Math.abs(brick.row - next.row), Math.abs(brick.column - next.column)) <= 1)
        .sort((a, b) => distance(a) - distance(b)));
    }
    return result;
  };
  const targets = type === "antimatter"
    ? destructible.filter((brick) => Math.max(Math.abs(brick.row - target.row), Math.abs(brick.column - target.column)) <= 2)
    : type === "orbitalLaser"
      ? destructible.filter((brick) => brick.column >= orbitalStartColumn && brick.column < orbitalStartColumn + 3)
      : type === "chainLightning"
        ? [...destructible].sort((a, b) => distance(a) - distance(b)).slice(0, 12)
        : type === "meteorImpact"
          ? destructible.filter((brick) => Math.max(Math.abs(brick.row - target.row), Math.abs(brick.column - target.column)) <= 2)
          : type === "blackHoleCollapse"
            ? destructible.filter((brick) => Math.max(Math.abs(brick.row - target.row), Math.abs(brick.column - target.column)) <= 2)
            : type === "crossfire"
              ? destructible.filter((brick) => Math.abs(brick.row - target.row) <= 1 || Math.abs(brick.column - target.column) <= 1)
              : type === "fusionChain"
                ? fusionTargets()
                : [...destructible].sort((a, b) => distance(a) - distance(b)).slice(0, 20);
  if (targets.length === 0) return null;

  const activation: UltimateActivation = {
    type,
    targets: targets.map(({ row, column }) => ({ row, column })),
    hits: targets.map((brick) => {
      const distanceFromImpact = Math.max(Math.abs(brick.row - target.row), Math.abs(brick.column - target.column));
      return {
        brickId: brick.id,
        damage: type === "meteorImpact" && distanceFromImpact === 2 ? 1 : brick.hp,
      };
    }),
    resolvedHitCount: 0,
    resolved: false,
  };
  state.stageUltimateUseCount += 1;
  state.ultimateInventory[slot] = null;
  if (!deferResolution) resolveUltimateActivation(state, activation);
  return activation;
}

export function resolveUltimateActivation(state: GameState, activation: UltimateActivation): void {
  resolveUltimateHits(state, activation, activation.hits.length);
}

export function resolveUltimateHits(state: GameState, activation: UltimateActivation, hitCount: number): number {
  const targetCount = Math.max(0, Math.min(activation.hits.length, Math.floor(hitCount)));
  let applied = 0;
  while (activation.resolvedHitCount < targetCount) {
    const { brickId, damage } = activation.hits[activation.resolvedHitCount];
    activation.resolvedHitCount += 1;
    damageBrick(state, brickId, damage);
    applied += 1;
  }
  if (!activation.resolved && activation.resolvedHitCount === activation.hits.length) {
    activation.resolved = true;
    advanceStageIfCleared(state);
  }
  return applied;
}

export function collectItem(
  state: GameState,
  itemId: string,
): { type: FieldItemType; ballCountDelta: number } | null {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item || item.type === "blackhole") return null;
  state.items = state.items.filter((candidate) => candidate.id !== itemId);
  const previousBallCount = state.ballCount;

  if (item.type === "multiball") {
    state.ballCount = Math.min(maxBallsForStage(state.stage), state.ballCount + 1);
    addScore(state, MULTIBALL_SCORE);
  } else if (item.type === "shield") {
    state.shield = true;
  } else if (item.type === "power" || item.type === "power3" || item.type === "power4") {
    state.powerTurns = 2;
    const multiplier = item.type === "power4" ? 4 : item.type === "power3" ? 3 : 2;
    state.powerMultiplier = Math.max(state.powerMultiplier, multiplier);
  } else if (item.type === "trap") {
    state.ballCount = Math.max(1, state.ballCount - 1);
  } else {
    const targets = state.bricks.filter(
      (brick) => Math.abs(brick.row - item.row) <= 1 && Math.abs(brick.column - item.column) <= 1,
    );
    targets.forEach((brick) => damageBrick(state, brick.id));
  }

  return { type: item.type, ballCountDelta: state.ballCount - previousBallCount };
}

export function captureBallByBlackHole(state: GameState, itemId: string): number | null {
  const item = state.items.find((candidate) => candidate.id === itemId && candidate.type === "blackhole");
  const charges = item?.charges ?? 1;
  if (!item || charges <= 0 || state.ballCount <= 1) return null;

  state.ballCount = Math.max(1, state.ballCount - 1);
  const remainingCharges = charges - 1;
  item.charges = remainingCharges;
  return remainingCharges;
}

export function relocateBlackHoles(state: GameState, cycle: number): boolean {
  const blackHoles = state.items.filter((item) => item.type === "blackhole");
  if (blackHoles.length === 0) return false;

  const occupied = new Set([
    ...state.bricks.map((brick) => `${brick.row}:${brick.column}`),
    ...state.items.filter((item) => item.type !== "blackhole").map((item) => `${item.row}:${item.column}`),
  ]);
  let relocated = false;

  blackHoles.forEach((item, itemIndex) => {
    const nextCharges = blackHoleChargesForStage(state.stage);
    if (item.charges !== nextCharges) {
      item.charges = nextCharges;
      relocated = true;
    }
    const currentCell = `${item.row}:${item.column}`;
    const openCells = lowestSafeBlackHoleCells(occupied, currentCell);
    if (openCells.length === 0) {
      occupied.add(currentCell);
      return;
    }

    const seed = Math.imul(state.stage + cycle * 17 + itemIndex * 31, 0x9e3779b1) >>> 0;
    const destination = openCells[seed % openCells.length];
    item.row = destination.row;
    item.column = destination.column;
    occupied.add(`${item.row}:${item.column}`);
    relocated = true;
  });

  return relocated;
}

export function advanceStageIfCleared(state: GameState): boolean {
  if (state.gameStatus === "reward" || state.bricks.some((brick) => brick.type !== "steel")) return false;
  const result = createStageResult(state);
  state.stageResult = result;
  state.pendingUltimateReward = rollUltimateReward(result.stars);
  state.gameStatus = "reward";
  return true;
}

export function stageGoals(
  bricks: Brick[],
  items: FieldItem[],
): Pick<GameState, "stageTargetScore" | "stageTargetTimeMs"> {
  const destructible = bricks.filter((brick) => brick.type !== "steel");
  const totalHp = destructible.reduce((total, brick) => total + brick.maxHp, 0);
  const stageTargetScore = destructible.reduce((total, brick) => total + brick.maxHp * 10 + 40, 0)
    + items.filter((item) => item.type === "multiball").length * MULTIBALL_SCORE;
  // ponytail: 초기 휴리스틱, 실플레이 데이터가 쌓이면 스테이지별 파 타임으로 교체합니다.
  const targetSeconds = 12 + destructible.length * 0.5 + Math.sqrt(totalHp) * 3
    + bricks.filter((brick) => brick.type === "steel").length * 4;
  return { stageTargetScore, stageTargetTimeMs: Math.round(targetSeconds * 1000) };
}

export function stageResultStars(
  score: number,
  targetScore: number,
  timeMs: number,
  targetTimeMs: number,
  ultimateUseCount: number,
): number {
  let stars = 1;
  if (score >= targetScore) stars += 1;
  if (timeMs > 0 && timeMs <= targetTimeMs) stars += 1;
  if (timeMs > 0 && timeMs <= targetTimeMs * 0.8) stars += 1;
  if (timeMs > 0 && timeMs <= targetTimeMs * 0.6) stars += 1;
  return Math.max(1, stars - ultimateUseCount);
}

export function rollUltimateReward(
  stars: number,
  random: () => number = Math.random,
): UltimateItemType | null {
  const roll = random();
  if (stars <= 1 || (stars === 2 && roll < 0.8) || (stars === 3 && roll < 0.5) || (stars === 4 && roll < 0.2)) return null;
  const rewardRoll = stars === 2 ? (roll - 0.8) / 0.2
    : stars === 3 ? (roll - 0.5) / 0.5
      : stars === 4 ? (roll - 0.2) / 0.8
        : roll;
  const weights: Array<[UltimateItemType, number]> = stars === 2
    ? [["chainLightning", 0.55], ["meteorImpact", 0.25], ["blackHoleCollapse", 0.12], ["crossfire", 0.08]]
    : stars === 3
      ? [["chainLightning", 0.3], ["meteorImpact", 0.2], ["blackHoleCollapse", 0.15], ["crossfire", 0.15], ["antimatter", 0.08], ["orbitalLaser", 0.07], ["fusionChain", 0.04], ["missileBarrage", 0.01]]
      : stars === 4
        ? [["chainLightning", 0.18], ["meteorImpact", 0.16], ["blackHoleCollapse", 0.14], ["crossfire", 0.16], ["antimatter", 0.12], ["orbitalLaser", 0.12], ["fusionChain", 0.08], ["missileBarrage", 0.04]]
        : [["chainLightning", 0.12], ["meteorImpact", 0.14], ["blackHoleCollapse", 0.13], ["crossfire", 0.16], ["antimatter", 0.15], ["orbitalLaser", 0.12], ["fusionChain", 0.12], ["missileBarrage", 0.06]];
  let cursor = rewardRoll;
  for (const [item, weight] of weights) {
    if (cursor < weight) return item;
    cursor -= weight;
  }
  return weights[weights.length - 1][0];
}

export function acceptUltimateReward(
  state: GameState,
  replacementSlot?: number,
): boolean {
  if (state.gameStatus !== "reward") return false;
  if (!state.pendingUltimateReward) {
    finishReward(state);
    return true;
  }
  const emptySlot = state.ultimateInventory.indexOf(null);
  const slot = emptySlot >= 0 ? emptySlot : replacementSlot;
  if (slot === undefined || !Number.isInteger(slot) || slot < 0 || slot >= ULTIMATE_SLOT_COUNT) return false;

  state.ultimateInventory[slot] = state.pendingUltimateReward;
  finishReward(state);
  return true;
}

export function discardUltimateReward(state: GameState): boolean {
  if (state.gameStatus !== "reward") return false;
  finishReward(state);
  return true;
}

function finishReward(state: GameState): void {
  state.pendingUltimateReward = null;
  state.stageResult = null;
  state.stage += 1;
  state.shield = false;
  state.powerTurns = 0;
  state.powerMultiplier = 1;
  state.pendingLaserTriggers = [];
  state.launchPosition = { x: BOARD_WIDTH / 2, y: FLOOR_Y };
  const board = stageBoard(state.stage);
  Object.assign(state, board, stageGoals(board.bricks, board.items), {
    stageScore: 0,
    stagePlayTimeMs: 0,
    stageUltimateUseCount: 0,
  });
  state.gameStatus = "ready";
}

function createStageResult(state: GameState): StageResult {
  return {
    score: state.stageScore,
    targetScore: state.stageTargetScore,
    timeMs: Math.round(state.stagePlayTimeMs),
    targetTimeMs: state.stageTargetTimeMs,
    stars: stageResultStars(
      state.stageScore,
      state.stageTargetScore,
      state.stagePlayTimeMs,
      state.stageTargetTimeMs,
      state.stageUltimateUseCount,
    ),
  };
}

function addScore(state: GameState, score: number): void {
  state.score += score;
  state.stageScore += score;
}

function addTurnMultiball(state: GameState): void {
  const occupied = new Set(
    [...state.bricks, ...state.items].filter((entity) => entity.row === 0).map((entity) => entity.column),
  );
  const firstColumn = (state.turn * 3 + state.stage) % GRID_COLUMNS;
  for (let offset = 0; offset < GRID_COLUMNS; offset += 1) {
    const column = (firstColumn + offset) % GRID_COLUMNS;
    if (!occupied.has(column)) {
      state.items.push({ id: `turn-${state.turn}-${column}`, row: 0, column, type: "multiball" });
      return;
    }
  }
}

export function finishVolley(state: GameState, firstLandingX: number): boolean {
  state.launchPosition.x = Math.max(14, Math.min(BOARD_WIDTH - 14, firstLandingX));
  if (advanceStageIfCleared(state)) return false;
  state.powerTurns = Math.max(0, state.powerTurns - 1);
  if (state.powerTurns === 0) state.powerMultiplier = 1;

  const shieldRewound = state.shield && state.bricks.some(
    (brick) => brick.type !== "steel" && GRID_TOP + (brick.row + 1) * CELL_HEIGHT + BRICK_HEIGHT > DANGER_Y,
  );
  if (shieldRewound) {
    state.shield = false;
    state.gameStatus = "ready";
    return true;
  }

  state.bricks.forEach((brick) => (brick.row += 1));
  state.items.forEach((item) => (item.row += 1));

  state.bricks = state.bricks.filter(
    (brick) => brick.type !== "steel" || GRID_TOP + brick.row * CELL_HEIGHT + BRICK_HEIGHT <= DANGER_Y,
  );

  const barrierMultiballs = state.items.filter((item) => item.type === "multiball" && item.row >= DANGER_ROW);
  state.ballCount = Math.min(maxBallsForStage(state.stage), state.ballCount + barrierMultiballs.length);
  state.items = state.items.filter((item) => !barrierMultiballs.includes(item));

  const reachedDanger = state.bricks.some(
    (brick) => brick.type !== "steel" && GRID_TOP + brick.row * CELL_HEIGHT + BRICK_HEIGHT > DANGER_Y,
  );
  if (reachedDanger) {
    state.gameStatus = "gameOver";
    return false;
  }
  state.turn += 1;
  addTurnMultiball(state);
  state.gameStatus = "ready";
  return false;
}
