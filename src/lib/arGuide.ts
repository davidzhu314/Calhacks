export type ArBox = { left: number; top: number; right: number; bottom: number };
export type ArPoint = { x: number; y: number };
export type ArStatus = "present" | "absent" | "occluded" | "future-placement" | "ambiguous";
export type ArGuide = { visible: boolean; status: ArStatus; confidence: number; explanation: string; partBox?: ArBox; assemblyBox?: ArBox; placement?: ArPoint; orientationDegrees: number | null };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
function record(v: unknown): Record<string, unknown> | null { return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null; }
function number(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }
function box(v: unknown): ArBox | undefined {
  const b = record(v);
  if (!b || !number(b.left) || !number(b.top) || !number(b.right) || !number(b.bottom)) return;
  const result = { left: clamp(b.left), top: clamp(b.top), right: clamp(b.right), bottom: clamp(b.bottom) };
  const w = result.right - result.left, h = result.bottom - result.top;
  if (w < .02 || h < .02 || w * h > .9) return;
  return result;
}
function point(v: unknown): ArPoint | undefined {
  const p = record(v);
  return p && number(p.x) && number(p.y) ? { x: clamp(p.x), y: clamp(p.y) } : undefined;
}
export function parseGuide(raw: unknown): ArGuide | null {
  const r = record(raw);
  if (!r || typeof r.visible !== "boolean" || !number(r.confidence)) return null;
  const statuses: ArStatus[] = ["present", "absent", "occluded", "future-placement", "ambiguous"];
  const status = statuses.includes(r.status as ArStatus) ? r.status as ArStatus : "ambiguous";
  const confidence = clamp(r.confidence);
  const result: ArGuide = { visible: r.visible, status, confidence, explanation: typeof r.explanation === "string" ? r.explanation.slice(0, 240) : "", orientationDegrees: null };
  if (!result.visible) return result;
  result.assemblyBox = box(r.assemblyBox);
  result.partBox = box(r.partBox);
  const placement = point(r.placement);
  if (result.assemblyBox && placement && placement.x >= result.assemblyBox.left - .05 && placement.x <= result.assemblyBox.right + .05 && placement.y >= result.assemblyBox.top - .05 && placement.y <= result.assemblyBox.bottom + .05) result.placement = placement;
  if (confidence >= .7 && number(r.orientationDegrees)) result.orientationDegrees = r.orientationDegrees;
  return result;
}
