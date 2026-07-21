import { describe, expect, it } from "vitest";
import {
  BOARD_HEIGHT,
  DANGER_ROW,
  DANGER_Y,
  FLOOR_Y,
  BRICK_HEIGHT,
  BOMB_EFFECT_DURATION,
  CELL_HEIGHT,
  GRID_TOP,
  MAX_BALLS,
  MAX_BRICK_HP,
  LASER_EFFECT_DURATION,
  advanceStageIfCleared,
  aimFromDrag,
  bombEffectFrame,
  collectItem,
  consumeLaserTriggers,
  createGame,
  damageBrick,
  finishVolley,
  hitBrickWithBall,
  laserEffectFrame,
  prepareVolley,
  traceAimPath,
} from "../src/game";

describe("핵심 게임 규칙", () => {
  it("폭탄 충격파가 0.5초 동안 확대되며 사라진다", () => {
    expect(bombEffectFrame(0)).toEqual({ radius: 24, alpha: 1 });
    expect(bombEffectFrame(BOMB_EFFECT_DURATION / 2).radius).toBeGreaterThan(24);
    expect(bombEffectFrame(BOMB_EFFECT_DURATION)).toEqual({ radius: 90, alpha: 0 });
  });

  it("레이저가 가로줄을 제거하고 강철은 점수 없이 내려오며 위험선을 통과하면 사라진다", () => {
    expect(laserEffectFrame(0)).toEqual({ spread: 0, alpha: 1 });
    expect(laserEffectFrame(LASER_EFFECT_DURATION / 2).spread).toBe(1);
    expect(laserEffectFrame(LASER_EFFECT_DURATION)).toEqual({ spread: 1, alpha: 0 });

    const state = createGame();
    state.score = 0;
    state.bricks = [
      { id: "left", row: 2, column: 0, hp: 2, maxHp: 2, type: "normal" },
      { id: "laser", row: 2, column: 1, hp: 1, maxHp: 1, type: "laser" },
      { id: "steel", row: 2, column: 2, hp: 0, maxHp: 0, type: "steel" },
      { id: "below", row: 3, column: 1, hp: 2, maxHp: 2, type: "normal" },
    ];

    expect(damageBrick(state, "laser")).toBe(true);
    expect(state.bricks.map((brick) => brick.id)).toEqual(["steel", "below"]);
    expect(consumeLaserTriggers(state)).toEqual([{ row: 2, column: 1 }]);
    expect(state.score).toBe(110);

    const steelRow = state.bricks[0].row;
    expect(hitBrickWithBall(state, "steel")).toBe(false);
    expect(state.score).toBe(110);
    state.bricks.push({ id: "edge-steel", row: DANGER_ROW, column: 7, hp: 0, maxHp: 0, type: "steel" });
    finishVolley(state, 180);
    expect(state.bricks.find((brick) => brick.id === "steel")?.row).toBe(steelRow + 1);
    expect(state.bricks.some((brick) => brick.id === "edge-steel")).toBe(false);

    state.bricks = state.bricks.filter((brick) => brick.type === "steel");
    expect(advanceStageIfCleared(state)).toBe(true);
    state.bricks = [];
    expect(advanceStageIfCleared(state)).toBe(true);
    expect(state.bricks.some((brick) => brick.type === "steel")).toBe(true);
  });

  it("벽과 벽돌 충돌을 따라 조준 경로를 2회 반사한다", () => {
    const bounds = { minX: 5, maxX: 355, minY: 5, maxY: FLOOR_Y };
    const wallPath = traceAimPath({ x: 50, y: 100 }, { x: -1, y: -1 }, bounds, [], 2);
    expect(wallPath).toHaveLength(3);
    expect(wallPath[0].end.x).toBeCloseTo(5);
    expect(wallPath[1].end.y).toBeCloseTo(5);
    expect(wallPath[2].end.x).toBeCloseTo(355);

    const brickPath = traceAimPath(
      { x: 120, y: 300 },
      { x: 0, y: -1 },
      bounds,
      [{ x: 100, y: 100, width: 40, height: 30 }],
      1,
      5,
    );
    expect(brickPath[0].end.y).toBeCloseTo(135);
    expect(brickPath[1].end.y).toBeCloseTo(FLOOR_Y);
  });

  it("드래그를 위쪽 발사 방향으로 제한하고 공 수를 1~20개로 제한한다", () => {
    const direction = aimFromDrag({ x: 100, y: 500 }, { x: 330, y: 495 });
    expect(direction).not.toBeNull();
    expect(direction!.y).toBeLessThanOrEqual(-0.28);

    const state = createGame();
    expect(state.ballCount).toBe(1);
    expect(state.bricks).toHaveLength(8);
    expect(state.bricks.every((brick) => brick.row <= 1 && brick.hp === 1)).toBe(true);
    state.ballCount = 99;
    expect(MAX_BALLS).toBe(20);
    expect(prepareVolley(state)).toBe(MAX_BALLS);
    expect(state.gameStatus).toBe("volley");
  });

  it("벽돌 피해와 제거 점수를 적용하고 모든 벽돌 제거 시 다음 스테이지로 간다", () => {
    const state = createGame();
    const target = state.bricks[0];
    damageBrick(state, target.id, target.hp);
    expect(state.bricks.some((brick) => brick.id === target.id)).toBe(false);
    expect(state.score).toBeGreaterThan(0);

    state.bricks = [];
    state.ballCount = 3;
    expect(advanceStageIfCleared(state)).toBe(true);
    expect(state.stage).toBe(2);
    expect(state.ballCount).toBe(3);
    expect(state.items.some((item) => item.type === "power")).toBe(true);
    expect(state.bricks.some((brick) => brick.type === "laser")).toBe(true);
  });

  it("멀티볼, 쉴드, 폭탄, 강화볼, 공 감소 함정을 규칙대로 적용한다", () => {
    const state = createGame();
    const multiball = state.items.find((item) => item.type === "multiball")!;
    collectItem(state, multiball.id);
    expect(state.ballCount).toBe(2);

    state.items.push({ id: "shield", row: 1, column: 1, type: "shield" });
    collectItem(state, "shield");
    expect(state.shield).toBe(true);

    const bombTarget = state.bricks[0];
    state.items.push({ id: "bomb", row: bombTarget.row, column: bombTarget.column, type: "bomb" });
    const before = bombTarget.hp;
    collectItem(state, "bomb");
    const after = state.bricks.find((brick) => brick.id === bombTarget.id)?.hp ?? 0;
    expect(after).toBeLessThan(before);

    const powerTarget = state.bricks.find((brick) => brick.hp >= 1)!;
    powerTarget.hp = 3;
    state.items.push({ id: "power", row: 1, column: 2, type: "power" });
    collectItem(state, "power");
    expect(state.powerTurns).toBe(2);
    hitBrickWithBall(state, powerTarget.id);
    expect(powerTarget.hp).toBe(1);
    finishVolley(state, 180);
    expect(state.powerTurns).toBe(1);
    finishVolley(state, 180);
    expect(state.powerTurns).toBe(0);

    state.ballCount = 3;
    state.items.push({ id: "trap", row: 1, column: 3, type: "trap" });
    collectItem(state, "trap");
    expect(state.ballCount).toBe(2);
    state.items.push({ id: "last-trap", row: 1, column: 4, type: "trap" });
    state.ballCount = 1;
    collectItem(state, "last-trap");
    expect(state.ballCount).toBe(1);
  });

  it("첫 공 착지 위치를 계승하고 벽돌 하강 및 쉴드 1회 방어를 적용한다", () => {
    const state = createGame();
    state.shield = true;
    state.bricks[0].row = DANGER_ROW;
    state.items.push({ id: "barrier-multiball", row: DANGER_ROW, column: 7, type: "multiball" });
    const priorRows = state.bricks.map((brick) => brick.row);

    finishVolley(state, 37);
    expect(state.launchPosition.x).toBe(37);
    expect(state.bricks[0].row).toBe(priorRows[0] + 1);
    expect(state.shield).toBe(false);
    expect(state.gameStatus).toBe("ready");
    expect(state.ballCount).toBe(2);
    expect(state.items.some((item) => item.type === "multiball" && item.row === 0)).toBe(true);

    finishVolley(state, 51);
    expect(state.gameStatus).toBe("gameOver");
  });

  it("벽돌 하단이 위험선에 닿는 것은 허용하고 아래로 내려오면 게임오버다", () => {
    expect(BOARD_HEIGHT).toBe(602);
    expect(DANGER_ROW).toBe(10);
    expect(FLOOR_Y).toBe(562);
    expect(DANGER_Y).toBe(GRID_TOP + DANGER_ROW * CELL_HEIGHT + BRICK_HEIGHT);
    const state = createGame();
    state.bricks = [{ ...state.bricks[0], row: DANGER_ROW - 1 }];
    state.items = [];

    finishVolley(state, 180);
    expect(state.bricks[0].row).toBe(DANGER_ROW);
    expect(state.gameStatus).toBe("ready");

    finishVolley(state, 180);
    expect(state.gameStatus).toBe("gameOver");
  });

  it("5번째 이후에도 결정적인 절차 stage를 계속 생성한다", () => {
    const first = createGame();
    first.stage = 5;
    first.bricks = [];
    expect(advanceStageIfCleared(first)).toBe(true);
    expect(first.stage).toBe(6);
    expect(first.gameStatus).toBe("ready");
    expect(first.bricks.length).toBeGreaterThan(0);
    expect(first.items.some((item) => item.type === "multiball")).toBe(true);
    expect(first.bricks.some((brick) => brick.type === "laser")).toBe(true);
    expect(first.bricks.some((brick) => brick.type === "steel")).toBe(true);

    const second = createGame();
    second.stage = 5;
    second.bricks = [];
    advanceStageIfCleared(second);
    expect(second.bricks).toEqual(first.bricks);
    expect(second.items).toEqual(first.items);

    const far = createGame();
    far.stage = 99;
    far.bricks = [];
    advanceStageIfCleared(far);
    expect(far.stage).toBe(100);
    expect(far.bricks.length).toBeGreaterThan(0);
    const farHp = far.bricks.filter((brick) => brick.type !== "steel").map((brick) => brick.hp);
    expect(MAX_BRICK_HP).toBe(50);
    expect(Math.min(...farHp)).toBeGreaterThanOrEqual(49);
    expect(Math.max(...farHp)).toBe(50);

    const generated = Array.from({ length: 5 }, (_, index) => {
      const state = createGame();
      state.stage = 5 + index;
      state.bricks = [];
      advanceStageIfCleared(state);
      return state;
    });
    const signatures = generated.map((state) => state.bricks
      .map((brick) => `${brick.row}:${brick.column}`)
      .sort()
      .join("|"));
    expect(new Set(signatures).size).toBe(5);

    const checker = generated[0];
    expect(checker.bricks.filter(
      (brick) => brick.column < 4 && (brick.row + brick.column + checker.stage) % 2 === 0,
    ).length).toBeGreaterThanOrEqual(8);

    const corridor = generated[2];
    expect(corridor.bricks.every((brick) => brick.column !== 3 && brick.column !== 4)).toBe(true);

    const late = createGame();
    late.stage = 19;
    late.bricks = [];
    advanceStageIfCleared(late);
    expect(late.bricks.length).toBeGreaterThan(first.bricks.length);

    const sevenRows = createGame();
    sevenRows.stage = 30;
    sevenRows.bricks = [];
    advanceStageIfCleared(sevenRows);
    expect(sevenRows.stage).toBe(31);
    expect(new Set(sevenRows.bricks.map((brick) => brick.row)).size).toBe(7);

    const maxDensity = createGame();
    maxDensity.stage = 38;
    maxDensity.bricks = [];
    advanceStageIfCleared(maxDensity);
    expect(maxDensity.stage).toBe(39);
    expect(maxDensity.bricks).toHaveLength(52);

    const firstTrap = createGame();
    firstTrap.stage = 10;
    firstTrap.bricks = [];
    advanceStageIfCleared(firstTrap);
    expect(firstTrap.items.filter((item) => item.type === "trap")).toHaveLength(1);

    const doubleTrap = createGame();
    doubleTrap.stage = 30;
    doubleTrap.bricks = [];
    advanceStageIfCleared(doubleTrap);
    expect(doubleTrap.items.filter((item) => item.type === "trap")).toHaveLength(2);
  });

  it("마지막 벽돌 제거 후 volley 회수가 끝날 때 다음 스테이지로 이동한다", () => {
    const state = createGame();
    state.ballCount = 2;
    state.bricks = [];
    state.gameStatus = "volley";

    expect(state.stage).toBe(1);
    finishVolley(state, 120);
    expect(state.stage).toBe(2);
    expect(state.ballCount).toBe(2);
    expect(state.gameStatus).toBe("ready");
  });
});
