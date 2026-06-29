import { describe, expect, it } from "vitest";
import { createSerialQueue } from "../src/ovdrjm/write-lock.js";

describe("ovdrjm/write-lock", () => {
  it("acquirers run in call order (serialized)", async () => {
    const lock = createSerialQueue();
    const order: number[] = [];
    const task = async (id: number, delay: number) => {
      const release = await lock.acquire();
      order.push(id);
      await new Promise((r) => setTimeout(r, delay));
      release();
    };
    // 1번이 가장 느려도 호출 순서대로 직렬화돼야 함
    await Promise.all([task(1, 30), task(2, 5), task(3, 5)]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("mutual exclusion: never more than 1 holder", async () => {
    const lock = createSerialQueue();
    let active = 0;
    let maxActive = 0;
    const task = async () => {
      const release = await lock.acquire();
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      release();
    };
    await Promise.all(Array.from({ length: 6 }, () => task()));
    expect(maxActive).toBe(1);
  });
});
