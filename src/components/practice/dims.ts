// Real-world dimensions for Practice Mode. 1 unit = 1 mm everywhere in the practice scene.
// Pure numbers and helpers only (no three.js), so scripts/test-practice.mjs can check them in Node.

// ---------- LEGO system (standard brick geometry) ----------

export const LEGO = {
  PITCH: 8.0, // stud pitch
  GAP: 0.1, // clearance per side: a 1x1 brick is 7.8 mm wide on an 8 mm grid
  BRICK_H: 9.6,
  PLATE_H: 3.2, // 3 plates = 1 brick
  STUD_D: 4.8,
  STUD_H: 1.7,
  WALL: 1.2,
  TOP: 1.0, // thickness of the top of a brick/plate shell
  TUBE_OD: 6.51, // anti-stud tube under 2xN bricks
  TUBE_ID: 4.8,
  BAR_D: 3.18, // LEGO bar
  PIN_HOLE_D: 4.8,
  BEVEL: 0.2, // edge bevel used on every part
  STUD_BEVEL: 0.2,
  AXLE_SPAN: 4.8, // Technic axle cross: 4.8 mm across
  AXLE_ARM: 1.8, // each arm 1.8 mm wide
  CONNECTOR_D: 6.0, // smooth axle connector outer diameter
} as const;

/** Technic axle / connector length for n studs: n x 8 mm minus the 0.2 mm clearance (9L → 71.8 mm). */
export function axleLength(studs: number): number {
  return legoSpan(studs);
}

/** Body size of an n-stud run: n x 8 mm minus 0.1 mm clearance on each side. */
export function legoSpan(studs: number): number {
  return studs * LEGO.PITCH - 2 * LEGO.GAP;
}

/** Outer box of a rectangular brick/plate (without studs). */
export function legoBox(studsX: number, studsZ: number, plates: number) {
  return { w: legoSpan(studsX), d: legoSpan(studsZ), h: plates * LEGO.PLATE_H };
}

/** Diameter of a round part that is n studs across (2x2 round brick: 15.8 mm). */
export function roundDiameter(studs: number): number {
  return legoSpan(studs);
}

/** Stud centres of a rectangular part, relative to its centre. */
export function rectStuds(studsX: number, studsZ: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < studsX; i++)
    for (let j = 0; j < studsZ; j++) out.push([(i - (studsX - 1) / 2) * LEGO.PITCH, (j - (studsZ - 1) / 2) * LEGO.PITCH]);
  return out;
}

// A grid position keeps its stud on a round part if the stud centre is within R - 2.2 mm of the centre.
// Matches the real parts: 2x2 round = 4 studs, 4x4 round = 12, 8x8 round = 44 (22 per half).
const ROUND_STUD_MARGIN = 2.2;

/** Stud centres of an n x n round plate (optionally only one half: z <= 0). */
export function roundStuds(studs: number, half = false): [number, number][] {
  const r = (studs * LEGO.PITCH) / 2 - ROUND_STUD_MARGIN;
  return rectStuds(studs, studs).filter(([x, z]) => Math.hypot(x, z) <= r + 1e-9 && (!half || z < 0));
}

/** Anti-stud tube centres under a 2xN+ brick (between every 4 studs). None for 1xN. */
export function tubeCentres(studsX: number, studsZ: number): [number, number][] {
  if (studsX < 2 || studsZ < 2) return [];
  return rectStuds(studsX - 1, studsZ - 1);
}

/** 45° 2x2 slope (part 3039): the slope starts behind the stud row and drops 45° to a short front lip. */
export function slope45Profile(studsDeep = 2) {
  const d = legoSpan(studsDeep);
  const flat = LEGO.PITCH - LEGO.GAP; // back row (with studs) is flat
  const run = d - flat;
  return { depth: d, flat, lip: LEGO.BRICK_H - run, height: LEGO.BRICK_H };
}

/** Snaps a coordinate to a lattice of step `pitch` that passes through `origin`. */
export function snap(value: number, pitch: number, origin = 0): number {
  return origin + Math.round((value - origin) / pitch) * pitch;
}

// ---------- PC hardware (real standards) ----------

export const PC = {
  // ATX motherboard
  ATX_W: 244, // short side
  ATX_L: 305, // long side
  PCB_T: 1.6,
  // DDR5 UDIMM
  DIMM_L: 133.35,
  DIMM_H: 31.25,
  DIMM_PCB_T: 1.0,
  DIMM_HEATSPREADER_T: 7.2, // total thickness with a typical aluminium heatspreader
  DDR5_KEY_OFFSET: 3.85, // key notch centre is 3.85 mm from the module centre (Micron DDR5 UDIMM drawing, ±0.10)
  DDR4_KEY_OFFSET: 5.15, // DDR4 key: 5.15 mm from centre (DIMM connector datasheet), so the two can't swap
  KEY_W: 1.6,
  KEY_DEPTH: 4.0,
  SODIMM_L: 69.6,
  SODIMM_H: 30.0,
  // DIMM slots
  DIMM_SLOT_L: 145,
  DIMM_SLOT_W: 6.2,
  DIMM_SLOT_H: 7.4, // height of the housing above the PCB
  DIMM_SLOT_PITCH: 7.6,
  DIMM_SEAT: 4.2, // how far the contacts go into the slot
  // PCIe
  PCIE_X16_L: 89,
  PCIE_X1_L: 25,
  PCIE_SLOT_W: 7.5,
  PCIE_SLOT_H: 11.25,
  PCIE_SEAT: 8.0,
  EXPANSION_PITCH: 20.32, // case expansion slot pitch (0.8 in)
  // GPU (dual-slot)
  GPU_L: 300,
  GPU_H: 125,
  GPU_T: 40.4, // fits in 2 expansion slots (2 x 20.32 = 40.64)
  GPU_FINGERS_L: 89,
  BRACKET_H: 120, // full-height I/O bracket
  BRACKET_T: 0.86,
  BRACKET_SLOTS: 2,
  // Power connectors
  PIN_PITCH_12V2X6: 3.0,
  PIN_PITCH_PCIE8: 4.2,
} as const;

/** Width of an I/O bracket that covers n expansion slots. */
export function bracketWidth(slots: number): number {
  return 18.42 + (slots - 1) * PC.EXPANSION_PITCH;
}

/** Key notch position along a DIMM (from its centre), for a stick rotated 0 or 180 degrees. */
export function dimmKey(kind: "ddr5" | "ddr4", flipped: boolean): number {
  const k = kind === "ddr5" ? PC.DDR5_KEY_OFFSET : PC.DDR4_KEY_OFFSET;
  return flipped ? -k : k;
}

/** A stick only seats when its notch lands on the slot's key (within half the notch width). */
export function dimmFits(stick: { kind: "ddr5" | "ddr4" | "sodimm"; flipped: boolean }, slotKey = PC.DDR5_KEY_OFFSET): boolean {
  if (stick.kind === "sodimm") return false;
  return Math.abs(dimmKey(stick.kind, stick.flipped) - slotKey) < PC.KEY_W / 2;
}

/** x position of DIMM slot i (0 = A1, nearest the CPU) given the first slot's x. */
export function dimmSlotX(first: number, i: number): number {
  return first + i * PC.DIMM_SLOT_PITCH;
}
