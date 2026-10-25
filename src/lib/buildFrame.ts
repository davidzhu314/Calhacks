export type Stud = { x: number; y: number };
export type Footprint = { w: number; h: number };
export type Placement = {
  ref: string;
  dx: number;
  dy: number;
  rotation: 0 | 90 | 180 | 270;
  layer: number;
  footprint: Footprint;
  source: "agent-estimated" | "human-verified";
};

/** The reference point is the upper-left stud of the footprint after rotation. */
export function rotatedSize(p: Placement): Footprint {
  return p.rotation % 180 ? { w: p.footprint.h, h: p.footprint.w } : p.footprint;
}

export function footprintCells(p: Placement): Stud[] {
  const size = rotatedSize(p);
  const cells: Stud[] = [];
  for (let y = 0; y < size.h; y++) for (let x = 0; x < size.w; x++) cells.push({ x: p.dx + x, y: p.dy + y });
  return cells;
}

export function validPlacement(value: unknown): value is Placement {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Placement>;
  return typeof p.ref === "string" && Number.isFinite(p.dx) && Number.isFinite(p.dy) &&
    [0, 90, 180, 270].includes(p.rotation ?? -1) && Number.isInteger(p.layer) &&
    !!p.footprint && Number.isInteger(p.footprint.w) && Number.isInteger(p.footprint.h) &&
    p.footprint.w > 0 && p.footprint.h > 0 && p.footprint.w <= 16 && p.footprint.h <= 16 &&
    (p.source === "agent-estimated" || p.source === "human-verified");
}
