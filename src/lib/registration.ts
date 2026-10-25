import type { Point } from "./arGeometry";
import type { Stud } from "./buildFrame";

export type Registration = { a: number; b: number; tx: number; ty: number };

/** Two reference studs and their observed intrinsic camera-frame pixel locations. */
export function registerTwoPoints(studA: Stud, studB: Stud, frameA: Point, frameB: Point): Registration | null {
  const dx = studB.x - studA.x, dy = studB.y - studA.y;
  const px = frameB.x - frameA.x, py = frameB.y - frameA.y;
  const divisor = dx * dx + dy * dy;
  const pitch = Math.hypot(px, py) / Math.sqrt(divisor);
  if (divisor < 1 || !Number.isFinite(pitch) || pitch < 2 || pitch > 200) return null;
  const a = (px * dx + py * dy) / divisor;
  const b = (py * dx - px * dy) / divisor;
  return { a, b, tx: frameA.x - a * studA.x + b * studA.y, ty: frameA.y - b * studA.x - a * studA.y };
}

export function studToFrame(stud: Stud, r: Registration): Point {
  return { x: r.a * stud.x - r.b * stud.y + r.tx, y: r.b * stud.x + r.a * stud.y + r.ty };
}

export function frameToStud(point: Point, r: Registration): Stud {
  const d = r.a * r.a + r.b * r.b;
  if (d < 1e-10) return { x: 0, y: 0 };
  const x = point.x - r.tx, y = point.y - r.ty;
  return { x: (r.a * x + r.b * y) / d, y: (-r.b * x + r.a * y) / d };
}

export function shiftRegistration(r: Registration, dx: number, dy: number): Registration {
  return { ...r, tx: r.tx + dx, ty: r.ty + dy };
}

export function studPitch(r: Registration): number { return Math.hypot(r.a, r.b); }
