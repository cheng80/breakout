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
} from "../src/game";

describe("핵심 게임 규칙", () => {
  it("드래그를 위쪽 발사 방향으로 제한하고 공 수를 1~8개로 제한한다", () => {
    const direction = aimFromDrag({ x: 100, y: 500 }, { x: 330, y: 495 });
    expect(direction).not.toBeNull();
    expect(direction!.y).toBeLessThanOrEqual(-0.28);

    const state = createGame();
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
    expect(advanceStageIfCleared(state)).toBe(true);
    expect(state.stage).toBe(2);
    expect(state.ballCount).toBe(1);
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
    const priorRows = state.bricks.map((brick) => brick.row);

    finishVolley(state, 37);
    expect(state.launchPosition.x).toBe(37);
    expect(state.bricks[0].row).toBe(priorRows[0] + 1);
    expect(state.shield).toBe(false);
    expect(state.gameStatus).toBe("ready");

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
});
