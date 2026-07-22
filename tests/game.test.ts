import { describe, expect, it } from "vitest";
import { canPlaySound, getBgmVolume, setBgmVolume } from "../src/audio";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BLACK_HOLE_CYCLE_DURATION,
  BLACK_HOLE_INFLUENCE_RADIUS,
  BRICK_HIT_EFFECT_DURATION,
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
  SHIELD_REWIND_DURATION,
  advanceStageIfCleared,
  aimFromDrag,
  blackHolePresence,
  blackHolePullStrength,
  bombEffectFrame,
  brickHitEffectFrame,
  captureBallByBlackHole,
  collectItem,
  consumeLaserTriggers,
  createGame,
  damageBrick,
  finishVolley,
  hitBrickWithBall,
  laserEffectFrame,
  prepareVolley,
  relocateBlackHoles,
  resolveCircleRectCollision,
  shieldRewindFrame,
  stabilizeBounce,
  traceAimPath,
} from "../src/game";

describe("핵심 게임 규칙", () => {
  it("같은 효과음은 설정된 간격이 지나기 전에는 중복 재생하지 않는다", () => {
    expect(canPlaySound(undefined, 1, 0.05)).toBe(true);
    expect(canPlaySound(1, 1.04, 0.05)).toBe(false);
    expect(canPlaySound(1, 1.05, 0.05)).toBe(true);
  });

  it("BGM 전체 볼륨은 0부터 1 사이로 적용된다", () => {
    setBgmVolume(0.5);
    expect(getBgmVolume()).toBe(0.5);
    setBgmVolume(2);
    expect(getBgmVolume()).toBe(1);
    setBgmVolume(0.1);
  });

  it("폭탄 충격파가 0.5초 동안 확대되며 사라진다", () => {
    expect(bombEffectFrame(0)).toEqual({ radius: 24, alpha: 1 });
    expect(bombEffectFrame(BOMB_EFFECT_DURATION / 2).radius).toBeGreaterThan(24);
    expect(bombEffectFrame(BOMB_EFFECT_DURATION)).toEqual({ radius: 90, alpha: 0 });
  });

  it("벽돌 피격 테두리가 한 번 커졌다가 0.18초 안에 사라진다", () => {
    expect(brickHitEffectFrame(0)).toEqual({ scale: 1, alpha: 0 });
    expect(brickHitEffectFrame(BRICK_HIT_EFFECT_DURATION / 2)).toEqual({ scale: 1.08, alpha: 1 });
    expect(brickHitEffectFrame(BRICK_HIT_EFFECT_DURATION).scale).toBeCloseTo(1);
    expect(brickHitEffectFrame(BRICK_HIT_EFFECT_DURATION).alpha).toBeCloseTo(0);
  });

  it("보호막 발동 시 한 칸 내려왔다가 파란 점멸 후 원위치로 돌아간다", () => {
    expect(shieldRewindFrame(0)).toEqual({ offset: 0, flash: 0 });
    expect(shieldRewindFrame(SHIELD_REWIND_DURATION * 0.34).offset).toBe(CELL_HEIGHT);
    expect(shieldRewindFrame(SHIELD_REWIND_DURATION * 0.48).flash).toBe(1);
    expect(shieldRewindFrame(SHIELD_REWIND_DURATION)).toEqual({ offset: 0, flash: 0 });
  });

  it("블랙홀은 가까울수록 강하게 끌고 후반 흡수 횟수만큼 공을 제거한다", () => {
    expect(blackHolePullStrength(BLACK_HOLE_INFLUENCE_RADIUS)).toBe(0);
    expect(blackHolePullStrength(20)).toBeGreaterThan(blackHolePullStrength(50));
    expect(blackHolePullStrength(BLACK_HOLE_INFLUENCE_RADIUS / 2)).toBe(0.25);
    expect(blackHolePullStrength(0)).toBe(1);
    expect(blackHolePresence(0)).toBe(0);
    expect(blackHolePresence(0.3)).toBe(1);
    expect(blackHolePresence(4.8)).toBe(0);
    expect(blackHolePresence(BLACK_HOLE_CYCLE_DURATION)).toBe(0);

    const state = createGame();
    state.ballCount = 5;
    state.items = [{ id: "blackhole", row: 2, column: 3, type: "blackhole", charges: 2 }];
    expect(captureBallByBlackHole(state, "blackhole")).toBe(1);
    expect(state.ballCount).toBe(4);
    expect(state.items[0].charges).toBe(1);
    expect(captureBallByBlackHole(state, "blackhole")).toBe(0);
    expect(state.ballCount).toBe(3);
    expect(state.items).toHaveLength(0);

    state.items = [{ id: "last-blackhole", row: 2, column: 3, type: "blackhole", charges: 1 }];
    state.ballCount = 1;
    expect(captureBallByBlackHole(state, "last-blackhole")).toBeNull();
    expect(state.items).toHaveLength(1);
  });

  it("블랙홀은 재등장할 때 점유 칸과 위험선 주변을 피해 빈칸으로 이동한다", () => {
    const state = createGame();
    state.stage = 16;
    state.bricks = [{ id: "occupied-brick", row: 0, column: 0, hp: 1, maxHp: 1, type: "normal" }];
    state.items = [
      { id: "blackhole", row: 2, column: 3, type: "blackhole", charges: 1 },
      { id: "occupied-item", row: 1, column: 1, type: "bomb" },
    ];

    expect(relocateBlackHoles(state, 1)).toBe(true);
    const blackHole = state.items.find((item) => item.type === "blackhole")!;
    expect(`${blackHole.row}:${blackHole.column}`).not.toBe("2:3");
    expect(`${blackHole.row}:${blackHole.column}`).not.toBe("0:0");
    expect(`${blackHole.row}:${blackHole.column}`).not.toBe("1:1");
    const centerY = GRID_TOP + blackHole.row * CELL_HEIGHT + BRICK_HEIGHT / 2;
    expect(DANGER_Y - centerY).toBeGreaterThan(BLACK_HOLE_INFLUENCE_RADIUS);
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

  it("공이 블록 모서리에 겹쳐도 바깥으로 밀려나 다시 충돌하지 않는다", () => {
    const rect = { x: 40, y: 40, width: 20, height: 20 };
    const collision = resolveCircleRectCollision(
      { x: 63, y: 63 },
      { x: -100, y: -100 },
      rect,
      5,
    );

    expect(collision).not.toBeNull();
    expect(resolveCircleRectCollision(collision!.position, collision!.velocity, rect, 5)).toBeNull();
    expect(collision!.velocity.x).toBeGreaterThan(0);
    expect(collision!.velocity.y).toBeGreaterThan(0);

    const embedded = resolveCircleRectCollision({ x: 42, y: 50 }, { x: 100, y: 0 }, rect, 5)!;
    expect(resolveCircleRectCollision(embedded.position, embedded.velocity, rect, 5)).toBeNull();
    expect(embedded.velocity.x).toBeLessThan(0);
  });

  it("거의 수평인 반사는 속도를 유지하면서 반복 횟수에 따라 다른 탈출 각도로 보정한다", () => {
    const shallow = { x: 600, y: 10 };
    const first = stabilizeBounce(shallow, 0);
    const second = stabilizeBounce(shallow, 1);

    expect(Math.hypot(first.x, first.y)).toBeCloseTo(Math.hypot(shallow.x, shallow.y));
    expect(Math.abs(first.y)).toBeGreaterThan(100);
    expect(Math.abs(second.y)).toBeGreaterThan(Math.abs(first.y));
    expect(stabilizeBounce({ x: 500, y: 300 }, 0)).toEqual({ x: 500, y: 300 });
  });

  it("영상의 강철 블록 반복 궤도에서 공 30개를 탈출 각도로 보정한다", () => {
    const radius = 5;
    const steel = { x: 224.5, y: 168, width: 38.5, height: BRICK_HEIGHT };
    const slope = (steel.y - radius * 2) / (BOARD_WIDTH - radius * 2);
    const vx = 600 / Math.hypot(1, slope);
    const balls = Array.from({ length: MAX_BALLS }, () => ({ x: vx, y: vx * slope }));
    const trappedRightWallY = radius + (BOARD_WIDTH - radius - 121) * slope;
    const steelHitX = BOARD_WIDTH - radius - (steel.y - radius - trappedRightWallY) / slope;
    expect(steelHitX).toBeGreaterThan(steel.x - radius);
    expect(steelHitX).toBeLessThan(steel.x + steel.width + radius);

    for (let bounceCount = 1; bounceCount <= 8; bounceCount += 1) {
      balls.forEach((ball) => {
        if (bounceCount % 2 === 1) ball.x *= -1;
        else ball.y *= -1;
        Object.assign(ball, stabilizeBounce(ball, bounceCount));
      });
    }

    expect(balls).toHaveLength(MAX_BALLS);
    balls.forEach((ball) => {
      const escapedSlope = Math.abs(ball.y / ball.x);
      const rightWallY = radius + (BOARD_WIDTH - radius - 121) * escapedSlope;
      const nextSteelX = BOARD_WIDTH - radius - (steel.y - radius - rightWallY) / escapedSlope;
      expect(nextSteelX).toBeGreaterThan(steel.x + steel.width + radius);
      expect(Math.hypot(ball.x, ball.y)).toBeCloseTo(600);
    });
  });

  it("드래그를 위쪽 발사 방향으로 제한하고 공 수를 1~30개로 제한한다", () => {
    const direction = aimFromDrag({ x: 100, y: 500 }, { x: 330, y: 495 });
    expect(direction).not.toBeNull();
    expect(direction!.y).toBeLessThanOrEqual(-0.28);

    const state = createGame();
    expect(state.ballCount).toBe(1);
    expect(state.bricks).toHaveLength(8);
    expect(state.bricks.every((brick) => brick.row <= 1 && brick.hp === 1)).toBe(true);
    state.ballCount = 99;
    expect(MAX_BALLS).toBe(30);
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
    expect(state.powerMultiplier).toBe(2);
    hitBrickWithBall(state, powerTarget.id);
    expect(powerTarget.hp).toBe(1);
    finishVolley(state, 180);
    expect(state.powerTurns).toBe(1);
    finishVolley(state, 180);
    expect(state.powerTurns).toBe(0);
    expect(state.powerMultiplier).toBe(1);

    state.items.push({ id: "power3", row: 1, column: 5, type: "power3" });
    state.items.push({ id: "power4", row: 1, column: 6, type: "power4" });
    collectItem(state, "power4");
    collectItem(state, "power3");
    expect(state.powerMultiplier).toBe(4);
    state.bricks.push({ id: "power4-target", row: 5, column: 7, hp: 5, maxHp: 5, type: "normal" });
    hitBrickWithBall(state, "power4-target");
    expect(state.bricks.find((brick) => brick.id === "power4-target")?.hp).toBe(1);

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

    expect(finishVolley(state, 37)).toBe(true);
    expect(state.launchPosition.x).toBe(37);
    expect(state.bricks.map((brick) => brick.row)).toEqual(priorRows);
    expect(state.shield).toBe(false);
    expect(state.gameStatus).toBe("ready");
    expect(state.ballCount).toBe(1);
    expect(state.items.find((item) => item.id === "barrier-multiball")?.row).toBe(DANGER_ROW);
    expect(state.items.some((item) => item.type === "multiball" && item.row === 0)).toBe(false);

    expect(finishVolley(state, 51)).toBe(false);
    expect(state.gameStatus).toBe("gameOver");
    expect(state.ballCount).toBe(2);
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
    late.stage = 18;
    late.bricks = [];
    advanceStageIfCleared(late);
    expect(late.bricks.length).toBeGreaterThan(first.bricks.length);
    expect(late.bricks.filter((brick) => brick.type === "laser")).toHaveLength(2);
    expect(late.items.filter((item) => item.type === "power" || item.type === "power3")).toHaveLength(2);
    expect(late.items.some((item) => item.type === "power3")).toBe(true);
    expect(late.items.filter((item) => item.type === "bomb")).toHaveLength(1);
    expect(late.items.find((item) => item.type === "blackhole")?.charges).toBe(1);

    const sevenRows = createGame();
    sevenRows.stage = 30;
    sevenRows.bricks = [];
    advanceStageIfCleared(sevenRows);
    expect(sevenRows.stage).toBe(31);
    expect(new Set(sevenRows.bricks.map((brick) => brick.row)).size).toBe(7);
    expect(sevenRows.bricks.filter((brick) => brick.type === "laser")).toHaveLength(3);
    expect(sevenRows.items.some((item) => item.type === "power3")).toBe(true);
    expect(sevenRows.items.some((item) => item.type === "power4")).toBe(true);
    expect(sevenRows.items.filter((item) => item.type === "bomb")).toHaveLength(2);
    expect(sevenRows.items.find((item) => item.type === "blackhole")?.charges).toBe(2);

    const maxDensity = createGame();
    maxDensity.stage = 38;
    maxDensity.bricks = [];
    advanceStageIfCleared(maxDensity);
    expect(maxDensity.stage).toBe(39);
    expect(maxDensity.bricks).toHaveLength(52);
    expect(maxDensity.items).toHaveLength(4);
    expect(maxDensity.items.every((item) => Number.isInteger(item.row) && Number.isInteger(item.column))).toBe(true);

    const firstBlackHole = createGame();
    firstBlackHole.stage = 9;
    firstBlackHole.bricks = [];
    advanceStageIfCleared(firstBlackHole);
    expect(firstBlackHole.stage).toBe(10);
    expect(firstBlackHole.items.find((item) => item.type === "blackhole")?.charges).toBe(1);

    const firstTrap = createGame();
    firstTrap.stage = 10;
    firstTrap.bricks = [];
    advanceStageIfCleared(firstTrap);
    expect(firstTrap.items.filter((item) => item.type === "trap")).toHaveLength(1);
    expect(firstTrap.items.some((item) => item.type === "blackhole")).toBe(false);

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
