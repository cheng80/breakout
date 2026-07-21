export const BOARD_WIDTH = 360;
export const BOARD_HEIGHT = 560;
export const GRID_COLUMNS = 8;
export const DANGER_ROW = 10;
export const MAX_BALLS = 8;

export type GameStatus = "ready" | "aiming" | "volley" | "gameOver" | "victory";
export type ItemType = "bomb" | "multiball" | "shield";

export interface Vec2 {
  x: number;
  y: number;
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
}

const layouts = [
  ["..1111..", ".1....1.", "1..M...1", ".1....1.", "..1111.."],
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

const stageBallCount = (stage: number) => Math.min(MAX_BALLS, stage + 2);

function stageBoard(stage: number): Pick<GameState, "bricks" | "items"> {
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
    ballCount: stageBallCount(1),
    launchPosition: { x: BOARD_WIDTH / 2, y: 520 },
    ...stageBoard(1),
    gameStatus: "ready",
    shield: false,
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
  if (state.stage === layouts.length) {
    state.gameStatus = "victory";
    return true;
  }

  state.stage += 1;
  state.ballCount = stageBallCount(state.stage);
  state.shield = false;
  state.launchPosition = { x: BOARD_WIDTH / 2, y: 520 };
  Object.assign(state, stageBoard(state.stage));
  state.gameStatus = "ready";
  return true;
}

export function finishVolley(state: GameState, firstLandingX: number): void {
  state.launchPosition.x = Math.max(14, Math.min(BOARD_WIDTH - 14, firstLandingX));
  if (advanceStageIfCleared(state)) return;

  state.bricks.forEach((brick) => (brick.row += 1));
  state.items.forEach((item) => (item.row += 1));

  if (state.bricks.some((brick) => brick.row >= DANGER_ROW)) {
    if (state.shield) state.shield = false;
    else {
      state.gameStatus = "gameOver";
      return;
    }
  }
  state.gameStatus = "ready";
}
