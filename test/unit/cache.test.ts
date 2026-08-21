import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlLruCache } from "../../src/lrclib/cache.js";

describe("TtlLruCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for a key that was never set", () => {
    const cache = new TtlLruCache<string>(10, 1000);
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("returns a stored value and counts it", () => {
    const cache = new TtlLruCache<string>(10, 1000);
    cache.set("a", "one");
    expect(cache.get("a")).toBe("one");
    expect(cache.size).toBe(1);
  });

  it("stores values that are falsy without confusing them with a miss", () => {
    const cache = new TtlLruCache<unknown>(10, 1000);
    cache.set("zero", 0);
    cache.set("empty", "");
    cache.set("null", null);
    expect(cache.get("zero")).toBe(0);
    expect(cache.get("empty")).toBe("");
    expect(cache.get("null")).toBeNull();
  });

  it("overwrites an existing key without growing", () => {
    const cache = new TtlLruCache<string>(10, 1000);
    cache.set("a", "one");
    cache.set("a", "two");
    expect(cache.get("a")).toBe("two");
    expect(cache.size).toBe(1);
  });

  describe("time to live", () => {
    it("keeps an entry until the TTL elapses", () => {
      const cache = new TtlLruCache<string>(10, 1000);
      cache.set("a", "one");
      vi.advanceTimersByTime(999);
      expect(cache.get("a")).toBe("one");
    });

    it("drops an entry once the TTL has elapsed", () => {
      const cache = new TtlLruCache<string>(10, 1000);
      cache.set("a", "one");
      vi.advanceTimersByTime(1000);
      expect(cache.get("a")).toBeUndefined();
    });

    it("stops counting an expired entry it has served", () => {
      const cache = new TtlLruCache<string>(10, 1000);
      cache.set("a", "one");
      vi.advanceTimersByTime(5000);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("restarts the TTL when a key is written again", () => {
      const cache = new TtlLruCache<string>(10, 1000);
      cache.set("a", "one");
      vi.advanceTimersByTime(900);
      cache.set("a", "two");
      vi.advanceTimersByTime(900);
      expect(cache.get("a")).toBe("two");
    });

    it("does not extend the TTL just because the entry was read", () => {
      const cache = new TtlLruCache<string>(10, 1000);
      cache.set("a", "one");
      vi.advanceTimersByTime(900);
      expect(cache.get("a")).toBe("one");
      vi.advanceTimersByTime(200);
      expect(cache.get("a")).toBeUndefined();
    });
  });

  describe("least recently used eviction", () => {
    it("evicts the oldest key when the capacity is exceeded", () => {
      const cache = new TtlLruCache<number>(2, 60_000);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      expect(cache.size).toBe(2);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
    });

    it("treats a read as a use, so the key just read survives", () => {
      const cache = new TtlLruCache<number>(2, 60_000);
      cache.set("a", 1);
      cache.set("b", 2);
      expect(cache.get("a")).toBe(1);
      cache.set("c", 3);
      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBeUndefined();
    });

    it("never exceeds the capacity under sustained writes", () => {
      const cache = new TtlLruCache<number>(3, 60_000);
      for (let i = 0; i < 50; i += 1) {
        cache.set(`k${i}`, i);
      }
      expect(cache.size).toBe(3);
      expect(cache.get("k49")).toBe(49);
      expect(cache.get("k0")).toBeUndefined();
    });

    it("holds exactly the capacity without evicting anything", () => {
      const cache = new TtlLruCache<number>(3, 60_000);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      expect(cache.size).toBe(3);
      expect(cache.get("a")).toBe(1);
    });
  });

  describe("disabled cache", () => {
    it("stores nothing when the capacity is zero", () => {
      const cache = new TtlLruCache<number>(0, 60_000);
      cache.set("a", 1);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("stores nothing when the TTL is zero", () => {
      const cache = new TtlLruCache<number>(10, 0);
      cache.set("a", 1);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("stores nothing for negative settings either", () => {
      const cache = new TtlLruCache<number>(-1, -1);
      cache.set("a", 1);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.size).toBe(0);
    });
  });

  it("empties on clear", () => {
    const cache = new TtlLruCache<number>(10, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
    cache.set("c", 3);
    expect(cache.get("c")).toBe(3);
  });
});
