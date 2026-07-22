import { describe, expect, it } from "vitest";
import { formatFps, getFpsLevel } from "../src/fps-monitor";

describe("FPS 표시", () => {
  it("프레임 수에 따라 성능 상태를 구분한다", () => {
    expect(getFpsLevel(50)).toBe("good");
    expect(getFpsLevel(30)).toBe("warning");
    expect(getFpsLevel(29)).toBe("poor");
  });

  it("측정값을 정수로 표시하고 잘못된 값은 숨긴다", () => {
    expect(formatFps(59.6)).toBe("60");
    expect(formatFps(Number.NaN)).toBe("--");
  });
});
