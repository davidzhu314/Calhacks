import type { ArBox, ArGuide, ArPoint } from "./arGuide.ts";

export type Anchor = { guide: ArGuide; seenAt: number; quality: number; pinned?: boolean };
export const ANCHOR_TTL_MS = 12_000;
export function iou(a: ArBox, b: ArBox): number {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const intersection = w * h;
  const area = (v: ArBox) => (v.right - v.left) * (v.bottom - v.top);
  return intersection / (area(a) + area(b) - intersection || 1);
}
function blendBox(a: ArBox, b: ArBox, alpha: number): ArBox {
  return { left: a.left + (b.left - a.left) * alpha, top: a.top + (b.top - a.top) * alpha, right: a.right + (b.right - a.right) * alpha, bottom: a.bottom + (b.bottom - a.bottom) * alpha };
}
function blendPoint(a: ArPoint, b: ArPoint, alpha: number): ArPoint { return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha }; }
export function acceptDetection(anchor: Anchor | null, guide: ArGuide, now: number, alpha = .35, priorDetection: ArGuide | null = null): Anchor | null {
  if (anchor?.pinned) return anchor;
  if (!guide.visible || !guide.assemblyBox) return null;
  const agreedWithCandidate = !!priorDetection?.assemblyBox && iou(priorDetection.assemblyBox, guide.assemblyBox) >= .5;
  const agreesWithAnchor = !!anchor?.guide.assemblyBox && iou(anchor.guide.assemblyBox, guide.assemblyBox) >= .5;
  if (!anchor && guide.confidence < .8 && !agreedWithCandidate) return null;
  if (anchor && !agreesWithAnchor && !agreedWithCandidate) return null;
  const smooth = agreesWithAnchor ? anchor : null;
  return { guide: { ...guide, assemblyBox: smooth?.guide.assemblyBox ? blendBox(smooth.guide.assemblyBox, guide.assemblyBox, alpha) : guide.assemblyBox, partBox: smooth?.guide.partBox && guide.partBox ? blendBox(smooth.guide.partBox, guide.partBox, alpha) : guide.partBox, placement: smooth?.guide.placement && guide.placement ? blendPoint(smooth.guide.placement, guide.placement, alpha) : guide.placement }, seenAt: now, quality: guide.confidence };
}
export function pinPlacement(anchor: Anchor, placement: ArPoint): Anchor { return { ...anchor, pinned: true, guide: { ...anchor.guide, placement } }; }
export function isLost(anchor: Anchor | null, now: number): boolean { return !anchor || now - anchor.seenAt > ANCHOR_TTL_MS; }
export function sceneDelta(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (!a.length || a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length * 255);
}
