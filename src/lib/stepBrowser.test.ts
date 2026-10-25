import { describe, expect, it } from "vitest";
import { adjacentLocation, clampStepIdx, createLatestGuard, listPrebuiltSteps, sameLocation } from "./stepBrowser";
import type { ExtractedStep } from "@/app/api/extract/route";
import type { Prebuilt } from "@/lib/prebuilt";

const step = (number: number, instruction: string): ExtractedStep => ({
  number, instruction, parts: [], watchFor: [], box: { x: 0, y: 0, w: 1, h: 1 },
});

describe("step browser locations", () => {
  const prebuilt: Prebuilt = {
    id: "test", pageCount: 7,
    pages: { "7": [step(2, "Later")], "1": [], "5": [step(1, "First"), step(2, "Second")], "3": [] },
  };

  it("orders indexed steps, skips empty pages, and keeps duplicate numbers distinct", () => {
    const list = listPrebuiltSteps(prebuilt);
    expect(list.map(({ page, stepIdx, number }) => [page, stepIdx, number])).toEqual([[5, 0, 1], [5, 1, 2], [7, 0, 2]]);
    expect(sameLocation(list[1], list[2])).toBe(false);
    expect(adjacentLocation(list, { page: 5, stepIdx: 1 }, 1)).toEqual({ page: 7, stepIdx: 0 });
    expect(adjacentLocation(list, { page: 7, stepIdx: 0 }, -1)).toEqual({ page: 5, stepIdx: 1 });
    expect(adjacentLocation(list, { page: 7, stepIdx: 0 }, 1)).toBeNull();
  });

  it("keeps extracted-page navigation on that page and clamps requested indices", () => {
    const steps = [step(1, "First"), step(2, "Second")];
    expect(adjacentLocation(steps, { page: 7, stepIdx: 0 }, 1)).toEqual({ page: 7, stepIdx: 1 });
    expect(adjacentLocation(steps, { page: 7, stepIdx: 1 }, 1)).toBeNull();
    expect(clampStepIdx(8, steps.length)).toBe(1);
    expect(clampStepIdx(-3, steps.length)).toBe(0);
    expect(clampStepIdx(4, 0)).toBe(0);
  });

  it("invalidates older async preview requests", () => {
    const guard = createLatestGuard();
    const slow = guard.next();
    const fast = guard.next();
    expect(guard.isCurrent(slow)).toBe(false);
    expect(guard.isCurrent(fast)).toBe(true);
    guard.invalidate();
    expect(guard.isCurrent(fast)).toBe(false);
  });
});
