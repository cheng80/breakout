import { describe, expect, it } from "vitest";
import {
  DANGER_ROW,
  MAX_BALLS,
  advanceStageIfCleared,
  aimFromDrag,
  collectItem,
  createGame,
  damageBrick,
  finishVolley,
  prepareVolley,
  traceAimPath,
} from "../src/game";

describe("핵심 게임 규칙", () => {
  it("벽과 벽돌 충돌을 따라 조준 경로를 2회 반사한다", () => {
    const bounds = { minX: 5, maxX: 355, minY: 5, maxY: 520 };
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
    expect(brickPath[1].end.y).toBeCloseTo(520);
  });

  it("드래그를 위쪽 발사 방향으로 제한하고 공 수를 1~8개로 제한한다", () => {
    const direction = aimFromDrag({ x: 100, y: 500 }, { x: 330, y: 495 });
    expect(direction).not.toBeNull();
    expect(direction!.y).toBeLessThanOrEqual(-0.28);

    const state = createGame();
    expect(state.ballCount).toBe(1);
    state.ballCount = 99;
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
  });

  it("멀티볼, 쉴드, 폭탄 아이템을 규칙대로 적용한다", () => {
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
  });

  it("첫 공 착지 위치를 계승하고 벽돌 하강 및 쉴드 1회 방어를 적용한다", () => {
    const state = createGame();
    state.shield = true;
    state.bricks[0].row = DANGER_ROW - 1;
    state.items.push({ id: "barrier-multiball", row: DANGER_ROW - 1, column: 7, type: "multiball" });
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

  it("5번째 스테이지를 비우면 승리한다", () => {
    const state = createGame();
    state.stage = 5;
    state.bricks = [];
    expect(advanceStageIfCleared(state)).toBe(true);
    expect(state.gameStatus).toBe("victory");
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
