// Practice Mode engine: pack types and the pure rules for snapping and checking a placement.
// No three.js or React here, so the rules are unit-tested (scripts/test-practice.mjs).

import { snap } from "./dims";

export type Vec3 = [number, number, number];

export type PartSpec =
  | { kind: "legoBrick"; studsX: number; studsZ: number; plates: number; color: string }
  | { kind: "legoRoundBrick"; color: string } // 2x2 round brick with axle hole
  | { kind: "legoRoundPlate"; studs: number; color: string; hole?: boolean; axleHole?: boolean; tile?: boolean } // tile: smooth top
  | { kind: "legoAxle"; length: number; color: string } // Technic axle, length in studs, along +y from its bottom end
  | { kind: "legoAxleConnector"; color: string } // 2L smooth axle connector, along +y
  | { kind: "assembly"; parts: { spec: PartSpec; y: number; rotY?: number }[] } // a built sub-assembly, stacked along +y
  | { kind: "legoHalfRound"; studs: number; color: string } // half of an n x n round plate (z <= 0)
  | { kind: "legoSlope45"; color: string } // 2x2 45° slope, descending towards +z
  | { kind: "legoBarPlate"; color: string } // 2x2 round plate with four upright bars
  | { kind: "motherboard" }
  | { kind: "dimm"; variant: "ddr5" | "ddr4" | "sodimm" } // long axis along z, notch towards +z
  | { kind: "gpu" } // origin: centre of the edge fingers' bottom; bracket towards -x, fans towards +z
  | { kind: "nic" } // PCIe x1 card (decoy)
  | { kind: "plug"; variant: "12v2x6" | "pcie8" | "eps8" };

export type Part = {
  id: string;
  name: string; // spoken and shown: "2x2 round brick"
  label: string; // tray caption
  detail?: string; // tray sub-caption: "Reddish Brown", "DDR5 · 133 mm"
  spec: PartSpec;
  wrongHint?: string; // said when this part is offered for a step that needs something else
};

export type Spot = { pos: Vec3; label?: string; hint?: string };

export type Placement = {
  id: string;
  part: string; // the correct part's id
  decoys: string[];
  pos: Vec3;
  rotY: number; // radians
  symmetry: 0 | 1 | 2 | 4; // equivalent rotations per full turn (0 = any)
  startRotY?: number; // how the part comes out of the tray
  // grid: moves stud by stud. points: magnetised to the target and wrongSpots within `radius`
  // (stretch scales the x/z distance, so a long thin slot catches the part along its whole length).
  snap: { kind: "grid"; pitch: number } | { kind: "points"; radius: number; stretch?: [number, number] };
  wrongSpots?: Spot[];
  step: number; // the manual's step number
  title: string; // short: "Round brick on the base"
  say: string; // spoken and shown when the placement starts
  stuck: string; // "I'm stuck": where it goes and how
  rotHint?: string; // right part, right spot, wrong way round
  done?: string; // spoken on success
  motion: "drop" | "insert";
  latches?: string[]; // named latches in the scene that click shut on success
  spawn?: Vec3; // where the held part first appears (default: beside the target)
  label?: string; // spot label shown in the scene ("A2")
  focus?: { target: Vec3; distance: number }; // where the camera eases to for this placement
  tilt?: Vec3; // fixed orientation (Euler XYZ, radians) applied before rotY: parts built lying on their side
  lockRotation?: boolean; // Rotate does nothing (e.g. parts sliding onto an axle)
  consumes?: string[]; // placements that become part of this one: hidden once it's picked up or placed
};

export type Pack = {
  id: string;
  title: string;
  subtitle: string;
  base?: string; // part drawn from the start (e.g. the motherboard)
  parts: Record<string, Part>;
  placements: Placement[];
  camera: { target: Vec3; distance: number; polar: number; azimuth: number; fov: number; minDistance: number; maxDistance: number };
  stage: { radius: number; shadowFar: number }; // size of the working area (shadows, lights), mm
  spawn: Vec3; // default offset from the target where a picked part first appears
  lift: number; // how high a held part floats above its target height, mm
  rotateStep: number; // one tap of Rotate, radians
  labels?: { text: string; pos: Vec3 }[]; // permanent labels (slot names)
  intro: string;
  finish: { title: string; body: string };
};

// ---------- snapping ----------

export type SnapResult = { pos: Vec3; spot: "target" | number | null };

const EPS = 0.5;
const near = (a: Vec3, b: Vec3, r: number) => Math.hypot(a[0] - b[0], a[2] - b[2]) <= r;

/** Where a held part lands for a pointer at (x, z) on the table: on the stud grid, or magnetised to a slot. */
export function snapHeld(p: Placement, x: number, z: number): SnapResult {
  const target = p.pos;
  const spots = p.wrongSpots ?? [];
  if (p.snap.kind === "grid") {
    const pos: Vec3 = [snap(x, p.snap.pitch, target[0]), target[1], snap(z, p.snap.pitch, target[2])];
    if (near(pos, target, EPS)) return { pos, spot: "target" };
    const i = spots.findIndex((s) => near(pos, s.pos, EPS));
    return { pos: i >= 0 ? [pos[0], spots[i].pos[1], pos[2]] : pos, spot: i >= 0 ? i : null };
  }
  const here: Vec3 = [x, target[1], z];
  const candidates: { pos: Vec3; spot: "target" | number }[] = [{ pos: target, spot: "target" }, ...spots.map((s, i) => ({ pos: s.pos, spot: i }))];
  let best: (typeof candidates)[number] | null = null;
  let bestD = Infinity;
  const [sx, sz] = p.snap.stretch ?? [1, 1];
  for (const c of candidates) {
    const d = Math.hypot((c.pos[0] - x) / sx, (c.pos[2] - z) / sz);
    if (d <= p.snap.radius && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best ? { pos: best.pos, spot: best.spot } : { pos: here, spot: null };
}

// ---------- orientation ----------

const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

/** Does a part turned to rotY match the placement, allowing for the part's symmetry? */
export function rotationMatches(p: Placement, rotY: number): boolean {
  if (p.symmetry === 0) return true;
  const step = TAU / p.symmetry;
  const d = wrap(rotY - p.rotY) % step;
  return d < 1e-3 || step - d < 1e-3;
}

// ---------- the check ----------

export type Verdict =
  | { ok: true }
  | { ok: false; kind: "wrong-part" | "wrong-spot" | "wrong-rotation" | "miss"; message: string };

/** Checks a drop: right part, right spot, right way round. Messages are short and spoken aloud. */
export function evaluate(pack: Pack, p: Placement, partId: string, spot: SnapResult["spot"], rotY: number): Verdict {
  const want = pack.parts[p.part];
  if (spot === null) return { ok: false, kind: "miss", message: "Almost. Line it up with the glowing outline." };
  if (partId !== p.part) {
    const got = pack.parts[partId];
    return { ok: false, kind: "wrong-part", message: got?.wrongHint ?? `That's the ${got?.name ?? "wrong part"}. This step needs the ${want.name}.` };
  }
  if (spot !== "target") {
    const s = p.wrongSpots?.[spot];
    return { ok: false, kind: "wrong-spot", message: s?.hint ?? "Right part, wrong spot. Follow the glowing outline." };
  }
  if (!rotationMatches(p, rotY)) return { ok: false, kind: "wrong-rotation", message: p.rotHint ?? "Right spot. Turn it to match the outline." };
  return { ok: true };
}

/** Steps for the progress bar: placements grouped by the manual's step number. */
export function stepOf(pack: Pack, index: number): { step: number; of: number; within: number; count: number } {
  const steps = [...new Set(pack.placements.map((p) => p.step))];
  const p = pack.placements[Math.min(index, pack.placements.length - 1)];
  const group = pack.placements.filter((q) => q.step === p.step);
  return { step: p.step, of: steps.length, within: group.indexOf(p) + 1, count: group.length };
}
