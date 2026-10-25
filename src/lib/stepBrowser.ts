import type { ExtractedStep } from "@/app/api/extract/route";
import type { Prebuilt } from "@/lib/prebuilt";

export type StepLocation = { page: number; stepIdx: number };
export type StepListItem = StepLocation & Pick<ExtractedStep, "number" | "instruction">;

export function sameLocation(a: StepLocation | null, b: StepLocation | null): boolean {
  return a !== null && b !== null && a.page === b.page && a.stepIdx === b.stepIdx;
}

export function listPrebuiltSteps(prebuilt: Prebuilt): StepListItem[] {
  return Object.entries(prebuilt.pages)
    .map(([page, steps]) => ({ page: Number(page), steps }))
    .filter(({ page }) => Number.isInteger(page) && page >= 1 && page <= prebuilt.pageCount)
    .sort((a, b) => a.page - b.page)
    .flatMap(({ page, steps }) => steps.map((step, stepIdx) => ({ page, stepIdx, number: step.number, instruction: step.instruction })));
}

// For a prebuilt list, navigation crosses pages. For a single extracted page, it stays on that page.
export function adjacentLocation(items: readonly StepListItem[] | readonly ExtractedStep[], location: StepLocation, delta: -1 | 1): StepLocation | null {
  if (!items.length) return null;
  if ("page" in items[0]) {
    const list = items as readonly StepListItem[];
    const index = list.findIndex((item) => sameLocation(item, location));
    const next = list[index + delta];
    return next ? { page: next.page, stepIdx: next.stepIdx } : null;
  }
  const next = location.stepIdx + delta;
  return next >= 0 && next < items.length ? { page: location.page, stepIdx: next } : null;
}

export function clampStepIdx(idx: number, length: number): number {
  if (!Number.isFinite(idx) || length <= 0) return 0;
  return Math.min(Math.max(0, Math.trunc(idx)), length - 1);
}

export function createLatestGuard() {
  let current = 0;
  return {
    next: () => ++current,
    isCurrent: (id: number) => id === current,
    invalidate: () => { current++; },
  };
}
