import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, sleep } from "../../src/lrclib/rateLimiter.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a single task immediately and returns its value", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 500 });
    const promise = limiter.schedule(async () => "done");
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe("done");
  });

  it("keeps at least the minimum interval between two task starts", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 500 });
    const starts: number[] = [];
    const record = () =>
      limiter.schedule(async () => {
        await limiter.beforeRequest();
        starts.push(Date.now());
      });
    const all = Promise.all([record(), record(), record()]);
    await vi.advanceTimersByTimeAsync(5000);
    await all;
    expect(starts).toHaveLength(3);
    expect((starts[1] as number) - (starts[0] as number)).toBeGreaterThanOrEqual(500);
    expect((starts[2] as number) - (starts[1] as number)).toBeGreaterThanOrEqual(500);
  });

  it("runs tasks in the order they were scheduled", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 100 });
    const order: string[] = [];
    const tasks = ["a", "b", "c", "d"].map((name) =>
      limiter.schedule(async () => {
        await limiter.beforeRequest();
        order.push(name);
        return name;
      }),
    );
    await vi.advanceTimersByTimeAsync(5000);
    await expect(Promise.all(tasks)).resolves.toEqual(["a", "b", "c", "d"]);
    expect(order).toEqual(["a", "b", "c", "d"]);
  });

  it("never runs two tasks at the same time", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    let inFlight = 0;
    let peak = 0;
    const task = () =>
      limiter.schedule(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await sleep(50);
        inFlight -= 1;
      });
    const all = Promise.all([task(), task(), task()]);
    await vi.advanceTimersByTimeAsync(1000);
    await all;
    expect(peak).toBe(1);
  });

  it("waits for a slow task before starting the next one", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const events: string[] = [];
    const slow = limiter.schedule(async () => {
      events.push("slow:start");
      await sleep(1000);
      events.push("slow:end");
    });
    const fast = limiter.schedule(async () => {
      events.push("fast:start");
    });
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([slow, fast]);
    expect(events).toEqual(["slow:start", "slow:end", "fast:start"]);
  });

  it("keeps draining the queue after a task rejects", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 100 });
    const failing = limiter.schedule(async () => {
      throw new Error("boom");
    });
    const catcher = failing.catch((error: Error) => error.message);
    const after = limiter.schedule(async () => "still running");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(catcher).resolves.toBe("boom");
    await expect(after).resolves.toBe("still running");
  });

  it("rejects with the original error rather than wrapping it", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const marker = new Error("original");
    const promise = limiter.schedule(async () => {
      throw marker;
    });
    await vi.advanceTimersByTimeAsync(10);
    await expect(promise).rejects.toBe(marker);
  });

  it("still paces after a rejection", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 500 });
    const starts: number[] = [];
    const failing = limiter
      .schedule(async () => {
        await limiter.beforeRequest();
        starts.push(Date.now());
        throw new Error("boom");
      })
      .catch(() => undefined);
    const after = limiter.schedule(async () => {
      await limiter.beforeRequest();
      starts.push(Date.now());
    });
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([failing, after]);
    expect((starts[1] as number) - (starts[0] as number)).toBeGreaterThanOrEqual(500);
  });

  describe("penalize and relax", () => {
    it("starts at the configured interval", () => {
      expect(new RateLimiter({ minIntervalMs: 500 }).currentIntervalMs).toBe(500);
    });

    it("doubles the interval on each penalty", () => {
      const limiter = new RateLimiter({ minIntervalMs: 500, maxIntervalMs: 10_000 });
      limiter.penalize();
      expect(limiter.currentIntervalMs).toBe(1000);
      limiter.penalize();
      expect(limiter.currentIntervalMs).toBe(2000);
    });

    it("stops doubling at the cap", () => {
      const limiter = new RateLimiter({ minIntervalMs: 500, maxIntervalMs: 2000 });
      for (let i = 0; i < 10; i += 1) {
        limiter.penalize();
      }
      expect(limiter.currentIntervalMs).toBe(2000);
    });

    it("decays back down towards the base interval", () => {
      const limiter = new RateLimiter({ minIntervalMs: 500, maxIntervalMs: 8000 });
      limiter.penalize();
      limiter.penalize();
      const penalized = limiter.currentIntervalMs;
      limiter.relax();
      expect(limiter.currentIntervalMs).toBeLessThan(penalized);
      for (let i = 0; i < 10; i += 1) {
        limiter.relax();
      }
      expect(limiter.currentIntervalMs).toBe(500);
    });

    it("never relaxes below the configured base", () => {
      const limiter = new RateLimiter({ minIntervalMs: 500 });
      for (let i = 0; i < 10; i += 1) {
        limiter.relax();
      }
      expect(limiter.currentIntervalMs).toBe(500);
    });

    it("applies the penalised interval to the tasks that follow", async () => {
      const limiter = new RateLimiter({ minIntervalMs: 200 });
      const starts: number[] = [];
      const first = limiter.schedule(async () => {
        await limiter.beforeRequest();
        starts.push(Date.now());
      });
      await vi.advanceTimersByTimeAsync(0);
      await first;
      limiter.penalize();
      const second = limiter.schedule(async () => {
        await limiter.beforeRequest();
        starts.push(Date.now());
      });
      await vi.advanceTimersByTimeAsync(10_000);
      await second;
      expect((starts[1] as number) - (starts[0] as number)).toBeGreaterThanOrEqual(400);
    });

    it("does not let a nonsensical cap fall below the base", () => {
      const limiter = new RateLimiter({ minIntervalMs: 1000, maxIntervalMs: 100 });
      limiter.penalize();
      expect(limiter.currentIntervalMs).toBeGreaterThanOrEqual(1000);
    });
  });

  it("does not wait at all when the interval is zero", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const started = Date.now();
    const all = Promise.all([
      limiter.schedule(async () => Date.now()),
      limiter.schedule(async () => Date.now()),
      limiter.schedule(async () => Date.now()),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    const stamps = await all;
    for (const stamp of stamps) {
      expect(stamp - started).toBe(0);
    }
  });

  it("clamps a negative interval to zero instead of misbehaving", async () => {
    const limiter = new RateLimiter({ minIntervalMs: -500 });
    expect(limiter.currentIntervalMs).toBe(0);
    const promise = limiter.schedule(async () => "ok");
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe("ok");
  });
});

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves only once the delay has elapsed", async () => {
    let resolved = false;
    const promise = sleep(1000).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(resolved).toBe(true);
  });

  it("resolves promptly for a zero delay", async () => {
    const promise = sleep(0);
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBeUndefined();
  });
});
