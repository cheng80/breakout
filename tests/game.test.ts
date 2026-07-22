import { describe, expect, it } from "vitest";
import {
  canPlaySound,
  getBgmVolume,
  isAllMuted,
  isBgmMuted,
  isSfxMuted,
  setAllMuted,
  setBgmMuted,
  setBgmVolume,
  setSfxMuted,
} from "../src/audio";
import { estimateRankingPosition, normalizePlayerName } from "../src/ranking";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  BLACK_HOLE_CLEAR_FADE_DURATION,
  BLACK_HOLE_CAPTURE_FADE_DURATION,
  BLACK_HOLE_CAPTURE_HOLD_DURATION,
  BLACK_HOLE_CYCLE_DURATION,
  BLACK_HOLE_INFLUENCE_RADIUS,
  BLACK_HOLE_MIN_DEFLECTION_ANGLE,
  BRICK_HIT_EFFECT_DURATION,
  DANGER_ROW,
  DANGER_LINE_OFFSET,
  DANGER_Y,
  FLOOR_Y,
  BRICK_HEIGHT,
  BOMB_EFFECT_DURATION,
  CELL_HEIGHT,
  GRID_TOP,
  MAX_BALLS,
  MAX_BRICK_HP,
  MULTIBALL_SCORE,
  LASER_EFFECT_DURATION,
  SHIELD_REWIND_DURATION,
  acceptUltimateReward,
  advanceStageIfCleared,
  aimFromDrag,
  blackHoleClearFade,
  blackHoleCaptureFade,
  blackHolePresence,
  blackHoleDeflectionAngle,
  blackHolePullStrength,
  createUltimateItem,
  bombEffectFrame,
  brickHitEffectFrame,
  captureBallByBlackHole,
  collectItem,
  consumeLaserTriggers,
  createGame,
  damageBrick,
  discardUltimateReward,
  finishVolley,
  hitBrickWithBall,
  laserEffectFrame,
  maxBallsForStage,
  prepareVolley,
  relocateBlackHoles,
  resetGame,
  resolveUltimateActivation,
  resolveUltimateHits,
  resolveCircleRectCollision,
  rollUltimateReward,
  shieldRewindFrame,
  stabilizeBounce,
  stageResultStars,
  traceAimPath,
  ultimateLevelForStage,
  ultimateUnlockStage,
  ultimateTargetLimit,
  useUltimateItem,
  volleySpeedMultiplier,
} from "../src/game";

function advanceThroughReward(state: ReturnType<typeof createGame>): void {
  expect(advanceStageIfCleared(state)).toBe(true);
  expect(state.gameStatus).toBe("reward");
  expect(discardUltimateReward(state)).toBe(true);
}

describe("핵심 게임 규칙", () => {
  it("원하는 스테이지로 초기화할 수 있다", () => {
    const state = createGame();
    state.score = 1200;
    state.ballCount = 8;
    state.gameStatus = "volley";
    resetGame(state, 16, 12);

    expect(state.stage).toBe(16);
    expect(state.score).toBe(0);
    expect(state.ballCount).toBe(12);
    expect(state.gameStatus).toBe("ready");
    expect(state.bricks.every((brick) => brick.id.startsWith("s16-"))).toBe(true);

    resetGame(state, 16, 99);
    expect(state.ballCount).toBe(maxBallsForStage(16));
  });

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

  it("랭킹 닉네임은 공백을 정리하고 20자로 제한한다", () => {
    expect(normalizePlayerName("  Swipe   Breakout  ")).toBe("Swipe Breakout");
    expect(normalizePlayerName("123456789012345678901")).toBe("12345678901234567890");
  });

  it("랭킹 등록 전 점수 기준 예상 순위를 계산한다", () => {
    expect(estimateRankingPosition([
      { rank: 1, name: "A", score: 900, stage: 3, durationMs: 1000 },
      { rank: 2, name: "B", score: 700, stage: 2, durationMs: 2000 },
    ], 800)).toBe(2);
    expect(estimateRankingPosition([], 800)).toBe(1);
  });

  it("BGM·효과음·전체 음소거를 각각 제어한다", () => {
    setAllMuted(false);
    setBgmMuted(true);
    setSfxMuted(false);
    expect(isBgmMuted()).toBe(true);
    expect(isSfxMuted()).toBe(false);
    expect(isAllMuted()).toBe(false);

    setAllMuted(true);
    expect(isBgmMuted()).toBe(true);
    expect(isSfxMuted()).toBe(false);
    expect(isAllMuted()).toBe(true);

    setAllMuted(false);
    setBgmMuted(false);
    setSfxMuted(false);
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

  it("블랙홀은 흡수 횟수를 소진해도 다음 주기에 위치와 횟수를 갱신해 재등장한다", () => {
    expect(blackHolePullStrength(BLACK_HOLE_INFLUENCE_RADIUS)).toBe(0);
    expect(blackHolePullStrength(20)).toBeGreaterThan(blackHolePullStrength(50));
    expect(blackHolePullStrength(BLACK_HOLE_INFLUENCE_RADIUS / 2)).toBe(0.25);
    expect(blackHolePullStrength(0)).toBe(1);
    expect(blackHolePresence(0)).toBe(0);
    expect(blackHolePresence(0.3)).toBe(1);
    expect(blackHolePresence(4.8)).toBe(0);
    expect(blackHolePresence(BLACK_HOLE_CYCLE_DURATION)).toBe(0);
    expect(blackHoleClearFade(0)).toBe(1);
    expect(blackHoleClearFade(BLACK_HOLE_CLEAR_FADE_DURATION)).toBe(0);
    expect(blackHoleCaptureFade(BLACK_HOLE_CAPTURE_HOLD_DURATION)).toBe(1);
    expect(blackHoleCaptureFade(BLACK_HOLE_CAPTURE_HOLD_DURATION + BLACK_HOLE_CAPTURE_FADE_DURATION)).toBe(0);

    const state = createGame();
    state.stage = 31;
    state.ballCount = 5;
    state.items = [{ id: "blackhole", row: 2, column: 3, type: "blackhole", charges: 2 }];
    expect(captureBallByBlackHole(state, "blackhole")).toBe(1);
    expect(state.ballCount).toBe(4);
    expect(state.items[0].charges).toBe(1);
    expect(captureBallByBlackHole(state, "blackhole")).toBe(0);
    expect(state.ballCount).toBe(3);
    expect(state.items[0].charges).toBe(0);
    expect(captureBallByBlackHole(state, "blackhole")).toBeNull();
    expect(state.ballCount).toBe(3);
    expect(relocateBlackHoles(state, 1)).toBe(true);
    expect(state.items[0].charges).toBe(2);

    state.items = [{ id: "last-blackhole", row: 2, column: 3, type: "blackhole", charges: 1 }];
    state.ballCount = 1;
    expect(captureBallByBlackHole(state, "last-blackhole")).toBeNull();
    expect(state.items).toHaveLength(1);
  });

  it("블랙홀에 진입한 공은 최소 30도 방향을 튼다", () => {
    expect(blackHoleDeflectionAngle({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(BLACK_HOLE_MIN_DEFLECTION_ANGLE);
    expect(blackHoleDeflectionAngle({ x: 1, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(-BLACK_HOLE_MIN_DEFLECTION_ANGLE);
  });

  it("블랙홀은 재등장할 때 점유 칸과 위험선 주변을 피해 빈칸으로 이동한다", () => {
    const state = createGame();
    state.stage = 16;
    state.bricks = [{ id: "occupied-brick", row: 0, column: 0, hp: 1, maxHp: 1, type: "normal" }];
    state.items = [
      { id: "blackhole", row: 2, column: 3, type: "blackhole", charges: 0 },
      { id: "occupied-item", row: 1, column: 1, type: "bomb" },
    ];

    expect(relocateBlackHoles(state, 1)).toBe(true);
    const blackHole = state.items.find((item) => item.type === "blackhole")!;
    expect(blackHole.charges).toBe(1);
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
    advanceThroughReward(state);
    state.bricks = [];
    advanceThroughReward(state);
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

  it("드래그를 위쪽 발사 방향으로 제한하고 공 수를 스테이지별 상한으로 제한한다", () => {
    const direction = aimFromDrag({ x: 100, y: 500 }, { x: 330, y: 495 });
    expect(direction).not.toBeNull();
    expect(direction!.y).toBeLessThanOrEqual(-0.28);

    const state = createGame();
    expect(state.ballCount).toBe(1);
    expect(state.bricks).toHaveLength(8);
    expect(state.bricks.every((brick) => brick.row <= 1 && brick.hp === 1)).toBe(true);
    expect(state.stageTargetScore).toBe(450);
    expect(state.stageTargetTimeMs).toBeGreaterThan(0);
    state.ballCount = 99;
    expect(MAX_BALLS).toBe(80);
    expect(maxBallsForStage(1)).toBe(30);
    expect(maxBallsForStage(20)).toBe(30);
    expect(maxBallsForStage(21)).toBe(40);
    expect(maxBallsForStage(40)).toBe(50);
    expect(maxBallsForStage(50)).toBe(60);
    expect(maxBallsForStage(70)).toBe(70);
    expect(maxBallsForStage(71)).toBe(MAX_BALLS);
    expect(maxBallsForStage(100)).toBe(MAX_BALLS);
    expect(volleySpeedMultiplier(30)).toBe(1);
    expect(volleySpeedMultiplier(70)).toBeCloseTo(1.2857, 3);
    expect(volleySpeedMultiplier(100)).toBeCloseTo(1.357, 3);
    expect(prepareVolley(state)).toBe(30);
    expect(state.gameStatus).toBe("volley");
  });

  it("벽돌을 모두 제거하면 보상 확인 후 다음 스테이지로 간다", () => {
    const state = createGame();
    const target = state.bricks[0];
    damageBrick(state, target.id, target.hp);
    expect(state.bricks.some((brick) => brick.id === target.id)).toBe(false);
    expect(state.score).toBeGreaterThan(0);

    state.bricks = [];
    state.ballCount = 3;
    expect(advanceStageIfCleared(state)).toBe(true);
    expect(state.stage).toBe(1);
    expect(state.gameStatus).toBe("reward");
    expect(discardUltimateReward(state)).toBe(true);
    expect(state.stage).toBe(2);
    expect(state.ballCount).toBe(3);
    expect(state.items.some((item) => item.type === "power")).toBe(true);
    expect(state.bricks.some((brick) => brick.type === "laser")).toBe(true);
  });

  it("스테이지 목표 점수·시간에서 궁극기 사용 횟수만큼 별을 차감한다", () => {
    expect(stageResultStars(100, 100, 500, 1000, 0)).toBe(5);
    expect(stageResultStars(100, 100, 500, 1000, 1)).toBe(4);
    expect(stageResultStars(100, 100, 500, 1000, 2)).toBe(3);
    expect(stageResultStars(100, 100, 700, 1000, 0)).toBe(4);
    expect(stageResultStars(100, 100, 900, 1000, 0)).toBe(3);
    expect(stageResultStars(100, 100, 1200, 1000, 0)).toBe(2);
    expect(stageResultStars(90, 100, 1200, 1000, 2)).toBe(1);

    expect(rollUltimateReward(1, () => 0.99)).toBeNull();
    expect(rollUltimateReward(2, () => 0.79)).toBeNull();
    expect(rollUltimateReward(2, () => 0.805)).toBe("chainLightning");
    expect(rollUltimateReward(2, () => 0.99)).toBe("crossfire");
    expect(rollUltimateReward(3, () => 0.49)).toBeNull();
    expect(rollUltimateReward(3, () => 0.7)).toBe("meteorImpact");
    expect(rollUltimateReward(4, () => 0.1)).toBeNull();
    expect(rollUltimateReward(5, () => 0.1)).toBe("chainLightning");
    expect(rollUltimateReward(5, () => 0.6)).toBe("antimatter");
    expect(rollUltimateReward(5, () => 0.9)).toBe("fusionChain");
  });

  it("궁극기 보상은 해금된 스테이지의 후보에서만 선택한다", () => {
    expect(ultimateUnlockStage("chainLightning")).toBe(1);
    expect(ultimateUnlockStage("blackHoleCollapse")).toBe(11);
    expect(ultimateUnlockStage("antimatter")).toBe(21);
    expect(ultimateUnlockStage("missileBarrage")).toBe(1);

    expect(rollUltimateReward(5, () => 0.99, 10)).toBe("missileBarrage");
    expect(rollUltimateReward(5, () => 0.7, 20)).toBe("crossfire");
    expect(rollUltimateReward(5, () => 0.99, 21)).toBe("missileBarrage");
  });

  it("보상을 저장·교체·건너뛴 뒤에만 다음 스테이지를 불러온다", () => {
    const state = createGame();
    state.bricks = [];
    state.stageScore = state.stageTargetScore;
    state.stagePlayTimeMs = state.stageTargetTimeMs * 0.5;
    expect(advanceStageIfCleared(state)).toBe(true);
    expect(state.stage).toBe(1);
    expect(state.stageResult?.stars).toBe(5);
    expect(state.pendingUltimateReward).not.toBeNull();
    const firstReward = state.pendingUltimateReward;
    expect(acceptUltimateReward(state)).toBe(true);
    expect(state.stage).toBe(2);
    expect(state.ultimateInventory).toEqual([firstReward, null]);

    state.ultimateInventory = ["antimatter", "orbitalLaser"];
    state.bricks = [];
    state.stageScore = state.stageTargetScore;
    state.stagePlayTimeMs = state.stageTargetTimeMs * 0.5;
    advanceStageIfCleared(state);
    const replacement = state.pendingUltimateReward;
    expect(acceptUltimateReward(state)).toBe(false);
    expect(state.stage).toBe(2);
    expect(acceptUltimateReward(state, 1)).toBe(true);
    expect(state.ultimateInventory).toEqual(["antimatter", replacement]);
    expect(state.stage).toBe(3);

    const inventory = [...state.ultimateInventory];
    state.bricks = [];
    state.stageScore = state.stageTargetScore;
    state.stagePlayTimeMs = state.stageTargetTimeMs * 0.5;
    advanceStageIfCleared(state);
    expect(discardUltimateReward(state)).toBe(true);
    expect(state.ultimateInventory).toEqual(inventory);
    expect(state.stage).toBe(4);

    state.bricks = [];
    state.stageScore = 0;
    state.stagePlayTimeMs = state.stageTargetTimeMs * 2;
    advanceStageIfCleared(state);
    expect(state.stageResult?.stars).toBe(1);
    expect(state.pendingUltimateReward).toBeNull();
    expect(acceptUltimateReward(state)).toBe(true);
    expect(state.stage).toBe(5);
  });

  it("멀티볼, 쉴드, 폭탄, 강화볼, 공 감소 함정을 규칙대로 적용한다", () => {
    const state = createGame();
    const multiball = state.items.find((item) => item.type === "multiball")!;
    expect(collectItem(state, multiball.id)).toEqual({ type: "multiball", ballCountDelta: 1 });
    expect(state.ballCount).toBe(2);
    expect(state.score).toBe(MULTIBALL_SCORE);

    state.stage = 71;
    state.ballCount = MAX_BALLS;
    state.score = 0;
    state.items.push({ id: "overflow-multiball", row: 1, column: 1, type: "multiball" });
    expect(collectItem(state, "overflow-multiball")).toEqual({ type: "multiball", ballCountDelta: 0 });
    expect(state.ballCount).toBe(MAX_BALLS);
    expect(state.score).toBe(MULTIBALL_SCORE);

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
    expect(DANGER_Y).toBe(GRID_TOP + DANGER_ROW * CELL_HEIGHT + BRICK_HEIGHT + DANGER_LINE_OFFSET);
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
    advanceThroughReward(first);
    expect(first.stage).toBe(6);
    expect(first.gameStatus).toBe("ready");
    expect(first.bricks.length).toBeGreaterThan(0);
    expect(first.items.some((item) => item.type === "multiball")).toBe(true);
    expect(first.bricks.some((brick) => brick.type === "laser")).toBe(true);
    expect(first.bricks.some((brick) => brick.type === "steel")).toBe(true);

    const second = createGame();
    second.stage = 5;
    second.bricks = [];
    advanceThroughReward(second);
    expect(second.bricks).toEqual(first.bricks);
    expect(second.items).toEqual(first.items);

    const far = createGame();
    far.stage = 99;
    far.bricks = [];
    advanceThroughReward(far);
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
      advanceThroughReward(state);
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
    advanceThroughReward(late);
    expect(late.bricks.length).toBeGreaterThan(first.bricks.length);
    expect(late.bricks.filter((brick) => brick.type === "laser")).toHaveLength(2);
    expect(late.items.filter((item) => item.type === "power" || item.type === "power3")).toHaveLength(2);
    expect(late.items.some((item) => item.type === "power3")).toBe(true);
    expect(late.items.filter((item) => item.type === "bomb")).toHaveLength(1);
    const lateBlackHole = late.items.find((item) => item.type === "blackhole");
    expect(lateBlackHole?.charges).toBe(1);
    expect(lateBlackHole?.row).toBe(7);

    const sevenRows = createGame();
    sevenRows.stage = 30;
    sevenRows.bricks = [];
    advanceThroughReward(sevenRows);
    expect(sevenRows.stage).toBe(31);
    expect(new Set(sevenRows.bricks.map((brick) => brick.row)).size).toBe(7);
    expect(sevenRows.bricks.filter((brick) => brick.type === "laser")).toHaveLength(3);
    expect(sevenRows.items.some((item) => item.type === "power3")).toBe(true);
    expect(sevenRows.items.some((item) => item.type === "power4")).toBe(true);
    expect(sevenRows.items.filter((item) => item.type === "bomb")).toHaveLength(2);
    const sevenRowsBlackHole = sevenRows.items.find((item) => item.type === "blackhole");
    expect(sevenRowsBlackHole?.charges).toBe(2);
    expect(sevenRowsBlackHole?.row).toBe(7);

    const maxDensity = createGame();
    maxDensity.stage = 38;
    maxDensity.bricks = [];
    advanceThroughReward(maxDensity);
    expect(maxDensity.stage).toBe(39);
    expect(maxDensity.bricks).toHaveLength(52);
    expect(maxDensity.items).toHaveLength(4);
    expect(maxDensity.items.every((item) => Number.isInteger(item.row) && Number.isInteger(item.column))).toBe(true);

    const firstBlackHole = createGame();
    firstBlackHole.stage = 9;
    firstBlackHole.bricks = [];
    advanceThroughReward(firstBlackHole);
    expect(firstBlackHole.stage).toBe(10);
    expect(firstBlackHole.items.find((item) => item.type === "blackhole")?.charges).toBe(1);

    const firstTrap = createGame();
    firstTrap.stage = 10;
    firstTrap.bricks = [];
    advanceThroughReward(firstTrap);
    expect(firstTrap.items.filter((item) => item.type === "trap")).toHaveLength(1);
    expect(firstTrap.items.some((item) => item.type === "blackhole")).toBe(false);

    const doubleTrap = createGame();
    doubleTrap.stage = 30;
    doubleTrap.bricks = [];
    advanceThroughReward(doubleTrap);
    expect(doubleTrap.items.filter((item) => item.type === "trap")).toHaveLength(2);
  });

  it("마지막 벽돌 제거 후 보상 처리를 마쳐야 다음 스테이지로 이동한다", () => {
    const state = createGame();
    state.ballCount = 2;
    state.bricks = [];
    state.gameStatus = "volley";

    expect(state.stage).toBe(1);
    finishVolley(state, 120);
    expect(state.stage).toBe(1);
    expect(state.gameStatus).toBe("reward");
    discardUltimateReward(state);
    expect(state.stage).toBe(2);
    expect(state.ballCount).toBe(2);
    expect(state.gameStatus).toBe("ready");
  });

  it("궁극기 8종은 선택 범위에 맞는 효과를 적용하고 사용한 슬롯을 비운다", () => {
    const cases = [
      { type: "antimatter" as const, target: { row: 0, column: 0 }, expected: 9 },
      { type: "orbitalLaser" as const, target: { row: 2, column: 2 }, expected: 15 },
      { type: "chainLightning" as const, target: { row: 2, column: 2 }, expected: 12 },
      { type: "meteorImpact" as const, target: { row: 2, column: 2 }, expected: 25 },
      { type: "blackHoleCollapse" as const, target: { row: 2, column: 2 }, expected: 25 },
      { type: "crossfire" as const, target: { row: 2, column: 2 }, expected: 21 },
      { type: "fusionChain" as const, target: { row: 2, column: 2 }, expected: 18 },
      { type: "missileBarrage" as const, target: { row: 2, column: 2 }, expected: 20 },
    ];

    cases.forEach(({ type, target, expected }) => {
      const state = createGame();
      state.bricks = Array.from({ length: 25 }, (_, index) => ({
        id: `brick-${index}`,
        row: Math.floor(index / 5),
        column: index % 5,
        hp: 20,
        maxHp: 20,
        type: "normal" as const,
      }));
      state.ultimateInventory = [type, null];

      const activation = useUltimateItem(state, 0, target);

      expect(activation?.type).toBe(type);
      expect(activation?.targets).toHaveLength(expected);
      expect(state.bricks).toHaveLength(type === "meteorImpact" ? 16 : 25 - expected);
      expect(state.ultimateInventory[0]).toBeNull();
      expect(state.stageUltimateUseCount).toBe(1);
    });
  });

  it("연쇄형 궁극기는 획득 레벨에 따라 대상 수가 늘어난다", () => {
    expect(ultimateLevelForStage(1)).toBe(1);
    expect(ultimateLevelForStage(11)).toBe(2);
    expect(ultimateLevelForStage(21)).toBe(3);
    expect(ultimateLevelForStage(31)).toBe(4);
    expect(createUltimateItem("chainLightning", 1)).toEqual({ type: "chainLightning", level: 1 });
    expect(ultimateTargetLimit("chainLightning", 1)).toBe(6);
    expect(ultimateTargetLimit("fusionChain", 2)).toBe(12);
    expect(ultimateTargetLimit("missileBarrage", 3)).toBe(16);
    expect(ultimateTargetLimit("missileBarrage", 4)).toBe(20);

    const state = createGame();
    state.bricks = Array.from({ length: 12 }, (_, index) => ({
      id: `brick-${index}`,
      row: 0,
      column: index % 8,
      hp: 1,
      maxHp: 1,
      type: "normal" as const,
    }));
    state.ultimateInventory = [{ type: "chainLightning", level: 1 }, null];

    expect(useUltimateItem(state, 0, { row: 0, column: 0 })?.targets).toHaveLength(6);

    const rewardState = createGame();
    rewardState.gameStatus = "reward";
    rewardState.pendingUltimateReward = createUltimateItem("missileBarrage", 21);
    expect(acceptUltimateReward(rewardState)).toBe(true);
    expect(rewardState.ultimateInventory[0]).toEqual({ type: "missileBarrage", level: 3 });
  });

  it("궤도 레이저는 가장자리에서도 연속 3열을 제거한다", () => {
    const state = createGame();
    state.bricks = Array.from({ length: 8 }, (_, column) => ({
      id: `brick-${column}`,
      row: 0,
      column,
      hp: 1,
      maxHp: 1,
      type: "normal" as const,
    }));
    state.ultimateInventory = ["orbitalLaser", null];

    const activation = useUltimateItem(state, 0, { row: 0, column: 7 });

    expect(activation?.targets.map(({ column }) => column)).toEqual([5, 6, 7]);
    expect(state.bricks.map(({ column }) => column)).toEqual([0, 1, 2, 3, 4]);
  });

  it("운석 충돌 피해는 연출의 충돌 시점까지 지연할 수 있다", () => {
    const state = createGame();
    state.bricks = Array.from({ length: 25 }, (_, index) => ({
      id: `brick-${index}`,
      row: Math.floor(index / 5),
      column: index % 5,
      hp: 20,
      maxHp: 20,
      type: "normal" as const,
    }));
    state.ultimateInventory = ["meteorImpact", null];

    const activation = useUltimateItem(state, 0, { row: 2, column: 2 }, true);

    expect(activation?.resolved).toBe(false);
    expect(state.bricks).toHaveLength(25);
    expect(state.ultimateInventory[0]).toBeNull();

    resolveUltimateActivation(state, activation!);
    const scoreAfterImpact = state.score;

    expect(activation?.resolved).toBe(true);
    expect(state.bricks).toHaveLength(16);
    expect(state.bricks.find((brick) => brick.id === "brick-0")?.hp).toBe(19);

    resolveUltimateActivation(state, activation!);

    expect(state.score).toBe(scoreAfterImpact);
    expect(state.bricks.find((brick) => brick.id === "brick-0")?.hp).toBe(19);
  });

  it("지연된 궁극기 피해는 연출 순서에 맞춰 대상별로 적용할 수 있다", () => {
    const state = createGame();
    state.bricks = Array.from({ length: 4 }, (_, index) => ({
      id: `brick-${index}`,
      row: 0,
      column: index,
      hp: 1,
      maxHp: 1,
      type: "normal" as const,
    }));
    state.ultimateInventory = ["chainLightning", null];

    const activation = useUltimateItem(state, 0, { row: 0, column: 0 }, true)!;

    expect(resolveUltimateHits(state, activation, 1)).toBe(1);
    expect(state.bricks).toHaveLength(3);
    expect(activation.resolved).toBe(false);
    expect(resolveUltimateHits(state, activation, 1)).toBe(0);
    expect(resolveUltimateHits(state, activation, 3)).toBe(2);
    expect(state.bricks).toHaveLength(1);

    expect(resolveUltimateHits(state, activation, 4)).toBe(1);
    expect(activation.resolved).toBe(true);
    expect(state.bricks).toHaveLength(0);
    expect(state.gameStatus).toBe("reward");
  });

  it("궁극기 타격 완료 후 결과 처리를 연출 종료 시점까지 미룰 수 있다", () => {
    const state = createGame();
    state.bricks = [{
      id: "last-brick",
      row: 0,
      column: 0,
      hp: 1,
      maxHp: 1,
      type: "normal",
    }];
    state.ultimateInventory = ["missileBarrage", null];

    const activation = useUltimateItem(state, 0, { row: 0, column: 0 }, true)!;

    resolveUltimateHits(state, activation, 1, true);

    expect(state.bricks).toHaveLength(0);
    expect(state.gameStatus).toBe("ready");
    expect(advanceStageIfCleared(state)).toBe(true);
    expect(state.gameStatus).toBe("reward");
  });
});
