export const MIN_GROUND_INTERVAL_MS = 4000;

export function mayGround(input: { enabled: boolean; blocked: boolean; hidden: boolean; ready: boolean; due: boolean; busy: boolean; now: number; lastRequest: number }): boolean {
  return input.enabled && !input.blocked && !input.hidden && input.ready && input.due && !input.busy && input.now - input.lastRequest >= MIN_GROUND_INTERVAL_MS;
}

export function responseIsCurrent(request: { key: string; id: number }, active: { key: string; id: number; enabled: boolean; blocked: boolean }): boolean {
  return active.enabled && !active.blocked && request.key === active.key && request.id === active.id;
}

// Retry a failed view only after the camera points somewhere new and has stopped moving.
// This avoids repeatedly paying for the same unusable photo while someone is repositioning the phone.
export function viewReadyForRetry(failed: ArrayLike<number> | null, previous: ArrayLike<number> | null, current: ArrayLike<number> | null, difference: (a: ArrayLike<number>, b: ArrayLike<number>) => number): boolean {
  return !!failed && !!previous && !!current && difference(failed, current) > .12 && difference(previous, current) < .025;
}
