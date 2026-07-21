import { describe, expect, it } from "vitest";
import { ObjectPool } from "../src/object-pool";

describe("ObjectPool", () => {
  it("반납한 객체를 초기화해 다음 요청에서 재사용한다", () => {
    const pool = new ObjectPool(
      () => ({ value: 0 }),
      (item) => { item.value = 0; },
    );
    const first = pool.acquire();
    first.value = 7;
    pool.release(first);

    const second = pool.acquire();
    expect(second).toBe(first);
    expect(second.value).toBe(0);
    expect(pool.size).toBe(0);
  });
});
