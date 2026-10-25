export type GrayFrame = { pixels: Uint8ClampedArray; width: number; height: number };
export type Patch = { pixels: Uint8ClampedArray; width: number; height: number; x: number; y: number; texture: number };
export type TrackResult = { x: number; y: number; score: number; reliable: boolean };

/** A small textured crop around the registration point, in the low-resolution camera frame. */
export function extractPatch(frame: GrayFrame, cx: number, cy: number, size = 13): Patch | null {
  const width = Math.min(size, frame.width), height = Math.min(size, frame.height);
  const x = Math.max(0, Math.min(frame.width - width, Math.round(cx - width / 2)));
  const y = Math.max(0, Math.min(frame.height - height, Math.round(cy - height / 2)));
  if (width < 5 || height < 5 || frame.pixels.length !== frame.width * frame.height) return null;
  const pixels = new Uint8ClampedArray(width * height);
  let sum = 0;
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) { const n = frame.pixels[(y + j) * frame.width + x + i]; pixels[j * width + i] = n; sum += n; }
  const mean = sum / pixels.length;
  let variance = 0;
  for (const n of pixels) variance += (n - mean) ** 2;
  return { pixels, width, height, x, y, texture: Math.sqrt(variance / pixels.length) };
}

/** Prefer the most textured crop along the first plate's tapped edge. */
export function bestPatchOnSegment(frame: GrayFrame, ax: number, ay: number, bx: number, by: number): Patch | null {
  const length = Math.hypot(bx - ax, by - ay);
  if (length < 3) return null;
  const nx = -(by - ay) / length, ny = (bx - ax) / length;
  let best: Patch | null = null;
  for (const t of [.2, .4, .6, .8]) for (const offset of [-4, 0, 4]) {
    const patch = extractPatch(frame, ax + (bx - ax) * t + nx * offset, ay + (by - ay) * t + ny * offset, 13);
    if (patch && (!best || patch.texture > best.texture)) best = patch;
  }
  return best && best.texture >= 7 ? best : null;
}

/** Bounded SAD search. High score is a closer match; flat patches are rejected. */
export function trackPatch(patch: Patch, frame: GrayFrame, expectedX = patch.x, expectedY = patch.y, radius = 8): TrackResult {
  if (patch.texture < 7 || frame.pixels.length !== frame.width * frame.height) return { x: expectedX, y: expectedY, score: 0, reliable: false };
  let best = Infinity, bestX = expectedX, bestY = expectedY;
  const minX = Math.max(0, Math.round(expectedX - radius)), maxX = Math.min(frame.width - patch.width, Math.round(expectedX + radius));
  const minY = Math.max(0, Math.round(expectedY - radius)), maxY = Math.min(frame.height - patch.height, Math.round(expectedY + radius));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    let error = 0;
    for (let j = 0; j < patch.height; j++) for (let i = 0; i < patch.width; i++) error += Math.abs(patch.pixels[j * patch.width + i] - frame.pixels[(y + j) * frame.width + x + i]);
    if (error < best) { best = error; bestX = x; bestY = y; }
  }
  const score = Number.isFinite(best) ? Math.max(0, 1 - best / (patch.pixels.length * 255)) : 0;
  return { x: bestX, y: bestY, score, reliable: score >= .78 };
}
