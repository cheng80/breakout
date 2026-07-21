export const BOARD_WIDTH = 360;
export const BOARD_HEIGHT = 560;
export const GRID_COLUMNS = 8;
export const GRID_TOP = 42;
export const CELL_HEIGHT = 42;
export const BRICK_HEIGHT = 34;
export const DANGER_ROW = 9;
export const DANGER_Y = GRID_TOP + DANGER_ROW * CELL_HEIGHT + BRICK_HEIGHT;
export const MAX_BALLS = 8;

export type GameStatus = "ready" | "aiming" | "volley" | "gameOver";
export type ItemType = "bomb" | "multiball" | "shield";

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

export interface Brick {
  id: string;
  row: number;
  column: number;
  hp: number;
  maxHp: number;
}

export interface Item {
  id: string;
  row: number;
  column: number;
  type: ItemType;
}

export interface GameState {
  stage: number;
  score: number;
  ballCount: number;
  launchPosition: Vec2;
  bricks: Brick[];
  items: Item[];
  gameStatus: GameStatus;
  shield: boolean;
  turn: number;
}

const layouts = [
  [".111111.", "...M...."],
  ["2.2..2.2", ".222222.", "..B..M..", ".2.22.2.", "2..22..2"],
  ["333..333", "3..33..3", ".3.S..3.", "..3333..", "3.M..B.3"],
  ["44.44.44", ".444444.", "4.B..M.4", ".44..44.", "44.SS.44"],
  ["55555555", "5.5..5.5", ".555555.", "5.BMS..5", ".55..55.", "555..555"],
] as const;

const itemTypes: Record<string, ItemType> = {
  B: "bomb",
  M: "multiball",
  S: "shield",
};

function proceduralBoard(stage: number): Pick<GameState, "bricks" | "items"> {
  let seed = Math.imul(stage, 0x9e3779b1) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const rows = Math.min(6, 4 + Math.floor((stage - 6) / 5));
  const targetPairs = Math.min(rows * 4 - 2, Math.ceil((12 + stage) / 2));
  const candidates = Array.from({ length: rows * 4 }, (_, index) => ({
    row: Math.floor(index / 4),
    column: index % 4,
  }));
  candidates.sort(() => random() - 0.5);

  const bricks: Brick[] = [];
  const baseHp = Math.min(12, stage + 1);
  candidates.slice(0, targetPairs).forEach(({ row, column }, index) => {
    const hp = Math.min(12, Math.max(1, baseHp + Math.floor(random() * 3) - 1));
    for (const mirroredColumn of new Set([column, GRID_COLUMNS - 1 - column])) {
      bricks.push({
        id: `s${stage}-b${row}-${mirroredColumn}-${index}`,
        row,
        column: mirroredColumn,
        hp,
        maxHp: hp,
      });
    }
  });

  const occupied = new Set(bricks.map((brick) => `${brick.row}:${brick.column}`));
  const openCells = Array.from({ length: rows * GRID_COLUMNS }, (_, index) => ({
    row: Math.floor(index / GRID_COLUMNS),
    column: index % GRID_COLUMNS,
  })).filter((cell) => !occupied.has(`${cell.row}:${cell.column}`));
  openCells.sort(() => random() - 0.5);
  const itemOrder: ItemType[] = ["multiball"];
  if (stage % 2 === 0) itemOrder.push("bomb");
  if (stage % 3 === 0) itemOrder.push("shield");
  const items = itemOrder.map((type, index) => ({
    id: `s${stage}-i${index}`,
    ...openCells[index],
    type,
  }));

  return { bricks, items };
}

function stageBoard(stage: number): Pick<GameState, "bricks" | "items"> {
  if (stage > layouts.length) return proceduralBoard(stage);
  const bricks: Brick[] = [];
  const items: Item[] = [];
  const layout = layouts[stage - 1];

  layout.forEach((line, row) => {
    [...line].forEach((cell, column) => {
      if (/\d/.test(cell)) {
        const hp = Number(cell) + Math.floor((stage - 1) / 2);
        bricks.push({ id: `s${stage}-b${row}-${column}`, row, column, hp, maxHp: hp });
      } else if (itemTypes[cell]) {
        items.push({ id: `s${stage}-i${row}-${column}`, row, column, type: itemTypes[cell] });
      }
    });
  });

  return { bricks, items };
}

export function createGame(): GameState {
  return {
    stage: 1,
    score: 0,
    ballCount: 1,
    launchPosition: { x: BOARD_WIDTH / 2, y: 520 },
    ...stageBoard(1),
    gameStatus: "ready",
    shield: false,
    turn: 0,
  };
}

export function resetGame(state: GameState): void {
  Object.assign(state, createGame());
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
  state.ballCount = Math.max(1, Math.min(MAX_BALLS, state.ballCount));
  state.gameStatus = "volley";
  return state.ballCount;
}

export function damageBrick(state: GameState, brickId: string, damage = 1): boolean {
  const brick = state.bricks.find((candidate) => candidate.id === brickId);
  if (!brick) return false;

  const applied = Math.min(brick.hp, Math.max(0, damage));
  brick.hp -= applied;
  state.score += applied * 10;

  if (brick.hp <= 0) {
    state.bricks = state.bricks.filter((candidate) => candidate.id !== brickId);
    state.score += 40;
    return true;
  }
  return false;
}

export function collectItem(state: GameState, itemId: string): ItemType | null {
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  state.items = state.items.filter((candidate) => candidate.id !== itemId);

  if (item.type === "multiball") {
    state.ballCount = Math.min(MAX_BALLS, state.ballCount + 1);
  } else if (item.type === "shield") {
    state.shield = true;
  } else {
    const targets = state.bricks.filter(
      (brick) => Math.abs(brick.row - item.row) <= 1 && Math.abs(brick.column - item.column) <= 1,
    );
    targets.forEach((brick) => damageBrick(state, brick.id));
  }

  return item.type;
}

export function advanceStageIfCleared(state: GameState): boolean {
  if (state.bricks.length > 0) return false;
  state.stage += 1;
  state.shield = false;
  state.launchPosition = { x: BOARD_WIDTH / 2, y: 520 };
  Object.assign(state, stageBoard(state.stage));
  state.gameStatus = "ready";
  return true;
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

export function finishVolley(state: GameState, firstLandingX: number): void {
  state.launchPosition.x = Math.max(14, Math.min(BOARD_WIDTH - 14, firstLandingX));
  if (advanceStageIfCleared(state)) return;

  state.bricks.forEach((brick) => (brick.row += 1));
  state.items.forEach((item) => (item.row += 1));

  const barrierMultiballs = state.items.filter((item) => item.type === "multiball" && item.row >= DANGER_ROW);
  state.ballCount = Math.min(MAX_BALLS, state.ballCount + barrierMultiballs.length);
  state.items = state.items.filter((item) => !barrierMultiballs.includes(item));

  const reachedDanger = state.bricks.some(
    (brick) => GRID_TOP + brick.row * CELL_HEIGHT + BRICK_HEIGHT > DANGER_Y,
  );
  if (reachedDanger) {
    if (state.shield) state.shield = false;
    else {
      state.gameStatus = "gameOver";
      return;
    }
  }
  state.turn += 1;
  addTurnMultiball(state);
  state.gameStatus = "ready";
}
