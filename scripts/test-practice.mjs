// Practice Mode: real-world dimensions of the 3D parts, stud-grid alignment, colours, and the placement rules.
// Builds the actual meshes with three.js and measures them. Run: npm run test:practice
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

// The practice modules import each other without the .ts extension (as the app does); add it for Node.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) return next(new URL(`../src/${spec.slice(2)}.ts`, import.meta.url).href, ctx);
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^\.\.?\//.test(spec) && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const THREE = await import("three");
const { LEGO, PC, legoSpan, legoBox, roundStuds, tubeCentres, slope45Profile, dimmFits, bracketWidth } = await import("../src/components/practice/dims.ts");
const { nearestLegoColor, LEGO_COLORS } = await import("../src/components/practice/colors.ts");
const { snapHeld, evaluate, rotationMatches } = await import("../src/components/practice/engine.ts");
const { parrot, PARROT_DATA_COLORS, TRUNK } = await import("../src/components/practice/packs/parrot.ts");
const { pc, DIMM, PCIE, GPU } = await import("../src/components/practice/packs/pc.ts");
const { buildPart } = await import("../src/components/practice/build/index.ts");
const { solid } = await import("../src/components/practice/build/materials.ts");
const { matchPractice } = await import("../src/components/practice/voice.ts");

let failed = 0;
const near = (label, got, want, tol = 0.011) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${+got.toFixed(3)}${ok ? "" : ` (want ${want} ±${tol})`}`);
};
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

const size = (obj) => {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z, min: b.min, max: b.max };
};
const child = (g, name) => g.getObjectByName(name);
const build = (spec) => buildPart(spec, solid);

// ---------- LEGO: standard system dimensions ----------
console.log("\nLEGO");
near("stud pitch", LEGO.PITCH, 8.0);
near("1x1 body (8 mm grid, 0.1 mm clearance per side)", legoSpan(1), 7.8);
near("brick height", LEGO.BRICK_H, 9.6);
near("plate height", LEGO.PLATE_H, 3.2);
near("3 plates = 1 brick", 3 * LEGO.PLATE_H, LEGO.BRICK_H);
near("2x4 brick footprint x", legoBox(2, 4, 3).w, 15.8);
near("2x4 brick footprint z", legoBox(2, 4, 3).d, 31.8);

const b24 = build({ kind: "legoBrick", studsX: 2, studsZ: 4, plates: 3, color: "#C91A09" });
const walls = size(child(b24, "walls"));
near("2x4 brick mesh width", walls.x, 15.8);
near("2x4 brick mesh depth", walls.z, 31.8);
near("2x4 brick mesh height", walls.y, 9.6);
near("2x4 brick height with studs", size(b24).y, 9.6 + 1.7);
const under = size(child(b24, "under"));
near("wall thickness (from the hollow)", (15.8 - under.x) / 2, 1.2);
const studs = child(b24, "studs");
const studGeo = size(new THREE.Mesh(studs.geometry));
near("stud diameter", studGeo.x, 4.8);
near("stud height (above the top face)", studGeo.max.y, 1.7);
eq("2x4 brick has 8 studs", studs.count, 8);
const tubes = child(b24, "tubes");
eq("2x4 brick has 3 tubes", tubes.count, 3);
near("tube outer diameter", size(new THREE.Mesh(tubes.geometry)).x, 6.51);
eq("1x4 brick has no tubes", tubeCentres(1, 4).length, 0);

const round = build({ kind: "legoRoundBrick", color: "#582A12" });
const rb = size(child(round, "body"));
near("round 2x2 brick diameter", rb.x, 15.8, 0.02);
near("round 2x2 brick height", rb.y, 9.6);

const half = build({ kind: "legoHalfRound", studs: 8, color: "#4B9F4A" });
const hb = size(child(half, "body"));
near("half-round 4x8 plate: diameter", hb.x, 63.8, 0.05);
near("half-round 4x8 plate: depth (radius - 0.1 mm)", hb.z, 31.8, 0.05);
near("half-round 4x8 plate: flat edge at z = -0.1", hb.max.z, -0.1, 0.02);
near("half-round plate height", hb.y, 3.2);
eq("half-round 4x8 plate studs (rows 8, 6, 6, 2)", child(half, "studs").count, 22);

const tan = build({ kind: "legoRoundPlate", studs: 4, color: "#E4CD9E", hole: true });
near("4x4 round plate diameter", size(child(tan, "body")).x, 31.8, 0.05);
eq("4x4 round plate studs", child(tan, "studs").count, 12);
eq("2x2 round studs", roundStuds(2).length, 4);

const slope = build({ kind: "legoSlope45", color: "#184632" });
const sb = size(child(slope, "body"));
near("2x2 slope footprint x", sb.x, 15.8, 0.02);
near("2x2 slope footprint z", sb.z, 15.8, 0.02);
near("2x2 slope height", sb.y, 9.6, 0.02);
near("45° slope front lip", slope45Profile(2).lip, 1.7, 0.02);
near("45° slope angle", (Math.atan2(9.6 - slope45Profile(2).lip, slope45Profile(2).depth - slope45Profile(2).flat) * 180) / Math.PI, 45, 0.5);
const bar = build({ kind: "legoBarPlate", color: "#582A12" });
near("bar diameter", size(new THREE.Mesh(child(bar, "bar").geometry, undefined)).x >= 3.18 ? LEGO.BAR_D : 0, 3.18);

// ---------- Parrot pack: everything sits on the grid and on something ----------
console.log("\nParrot pack");
let offGrid = 0;
let offLayer = 0;
const tops = [0];
for (const p of parrot.placements) {
  if (p.tilt) continue; // trunk pieces lie sideways in the workspace; checked as a stack below
  const g = build(parrot.parts[p.part].spec);
  g.rotation.y = p.rotY;
  g.position.set(...p.pos);
  g.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  g.traverse((s) => {
    if (s.name !== "studs") return;
    for (let i = 0; i < s.count; i++) {
      s.getMatrixAt(i, m);
      v.setFromMatrixPosition(m).applyMatrix4(s.matrixWorld);
      const fx = (v.x - 4) / 8;
      const fz = (v.z - 4) / 8;
      if (Math.abs(fx - Math.round(fx)) > 1e-3 || Math.abs(fz - Math.round(fz)) > 1e-3) offGrid++;
    }
  });
  const layer = p.pos[1] / LEGO.PLATE_H;
  if (Math.abs(layer - Math.round(layer)) > 1e-6) offLayer++;
  const rests = tops.some((t) => Math.abs(t - p.pos[1]) < 1e-6);
  if (!rests) console.log(`     ${p.id} at y=${p.pos[1]} rests on nothing`);
  eq(`${p.id}: rests on the table or a placed part`, rests, true);
  tops.push(size(g.getObjectByName("walls") ?? g.getObjectByName("body")).max.y); // top face, not studs or bars
}
eq("every stud lands on the 8 mm grid (centres at 4 + 8k)", offGrid, 0);
eq("every part sits on a 3.2 mm layer", offLayer, 0);

// Trunk (steps 6–10): pieces stack end to end along the axle, and the mounted axle ends on the base plate.
near("9L axle length", size(build({ kind: "legoAxle", length: 9, color: "#A0A5A9" })).y, 71.8, 0.02);
near("axle cross width", size(build({ kind: "legoAxle", length: 9, color: "#A0A5A9" })).x, LEGO.AXLE_SPAN, 0.02);
const conn = size(build({ kind: "legoAxleConnector", color: "#582A12" }));
near("2L axle connector length", conn.y, 15.8, 0.05);
near("axle connector diameter", conn.x, LEGO.CONNECTOR_D, 0.05);
const stack = [["gray", LEGO.PLATE_H], ["brick3", LEGO.BRICK_H], ["bars", LEGO.PLATE_H], ["brick2", LEGO.BRICK_H], ["brick1", LEGO.BRICK_H], ["tile", LEGO.PLATE_H]];
let gaps = 0;
for (let i = 1; i < stack.length; i++) if (Math.abs(TRUNK[stack[i][0]] - (TRUNK[stack[i - 1][0]] + stack[i - 1][1])) > 1e-6) gaps++;
eq("trunk pieces sit end to end (no gaps or overlaps)", gaps, 0);
near("connector starts on top of the tile", TRUNK.axle + TRUNK.connectorOnAxle, TRUNK.tile + LEGO.PLATE_H, 0.001);
near("mounted axle ends on the base plate's top face", TRUNK.mountY + TRUNK.axle, LEGO.PLATE_H, 0.001);
near("trunk mounts on the step 5 brick", TRUNK.mountY, parrot.placements.find((p) => p.id === "brick-2").pos[1] + LEGO.BRICK_H, 0.001);
const trunkTilted = parrot.placements.filter((p) => p.tilt);
eq("trunk pieces slide on without turning", trunkTilted.every((p) => p.lockRotation), true);
eq("step 10 takes in every trunk piece", parrot.placements.find((p) => p.id === "mount").consumes.length, trunkTilted.length);

const data = JSON.parse(readFileSync(new URL("../public/steps/6455750.json", import.meta.url)));
for (const { page, step, part, partId } of PARROT_DATA_COLORS) {
  const read = data.pages[page].find((s) => s.number === step).parts[part];
  const official = LEGO_COLORS[nearestLegoColor(read.color)].hex;
  eq(`colour: step ${step} "${read.name}" ${read.color} -> ${official}`, parrot.parts[partId].spec.color, official);
}

// ---------- PC: real standards ----------
console.log("\nPC");
const board = build({ kind: "motherboard" });
const pcb = size(child(board, "pcb"));
near("ATX board width", pcb.x, 244, 0.02);
near("ATX board length", pcb.z, 305, 0.02);
near("PCB thickness", pcb.y, 1.6, 0.02);

const ddr5 = build({ kind: "dimm", variant: "ddr5" });
const d5 = size(ddr5);
near("DDR5 DIMM length", d5.z, 133.35, 0.02);
near("DDR5 DIMM height", d5.y, 31.25, 0.02);
near("DDR5 DIMM PCB thickness", PC.DIMM_PCB_T, 1.0);
near("DIMM with heatspreaders", d5.x, PC.DIMM_HEATSPREADER_T, 0.15);
near("DDR5 key offset from centre", PC.DDR5_KEY_OFFSET, 3.85);
eq("DDR5 stick fits the right way round", dimmFits({ kind: "ddr5", flipped: false }), true);
eq("DDR5 stick backwards does not fit", dimmFits({ kind: "ddr5", flipped: true }), false);
eq("DDR4 stick does not fit a DDR5 slot", [dimmFits({ kind: "ddr4", flipped: false }), dimmFits({ kind: "ddr4", flipped: true })], [false, false]);
eq("SO-DIMM does not fit", dimmFits({ kind: "sodimm", flipped: false }), false);
near("SO-DIMM length", size(build({ kind: "dimm", variant: "sodimm" })).z, 69.6, 0.02);
const keys = [0, 1, 2, 3].map((i) => child(board, `dimm-${i}-key`));
near("slot key sits 3.85 mm off the slot centre", size(keys[0]).min.z + 0.7 - DIMM.zc, 3.85, 0.02);

near("DIMM slot length", PC.DIMM_SLOT_L, 145);
eq("4 DIMM slots", keys.length, 4);
const pitch = DIMM.x(1) - DIMM.x(0);
eq("DIMM slot spacing 7.5–8 mm", pitch >= 7.5 && pitch <= 8, true);
eq("each slot has latches at both ends", [0, 1, 2, 3].every((i) => child(board, `dimm-${i}-a`) && child(board, `dimm-${i}-b`)), true);
eq("teach A2 then B2", pc.placements.slice(0, 2).map((p) => p.label), ["A2", "B2"]);
near("A2 is the 2nd slot from the CPU", pc.placements[0].pos[0], DIMM.x(1));
near("B2 is the 4th slot from the CPU", pc.placements[1].pos[0], DIMM.x(3));

near("PCIe x16 slot length", size(child(board, "pcie-x16a")).x + 3, 89, 0.05);
eq("PCIe x16 slot has an end retention latch", !!child(board, "pcie-a"), true);
near("expansion slot pitch", PC.EXPANSION_PITCH, 20.32);
near("x16_1 to x16_2 is three slots", PCIE.x16b - PCIE.x16a, 3 * 20.32, 0.001);

const card = build({ kind: "gpu" });
const cs = size(card);
near("GPU length (bracket to far end)", cs.max.x - GPU.bracketX, 300, 0.05);
near("GPU height", cs.max.y - 0, 125, 0.05);
near("GPU thickness (dual slot)", cs.z, 40.4, 0.1);
eq("GPU fits in two expansion slots", cs.z <= 2 * PC.EXPANSION_PITCH, true);
const fingers = size(child(card, "fingers"));
eq("x16 edge fingers fit the 89 mm slot", fingers.x <= PC.PCIE_X16_L && fingers.x > 85, true);
near("I/O bracket height", 120, PC.BRACKET_H);
near("dual-slot bracket width", bracketWidth(2), 38.74, 0.01);
eq("GPU has a power socket on the top edge", !!child(card, "socket-ridge"), true);

// ---------- placement rules ----------
console.log("\nRules");
const slopeRight = parrot.placements.find((p) => p.id === "slope-right");
eq("grid snap moves stud by stud", snapHeld(slopeRight, 19.7, 3.1).pos, [16, 3.2, 0]);
eq("grid snap on target", snapHeld(slopeRight, 16.4, -1).spot, "target");
eq("grid snap elsewhere", snapHeld(slopeRight, 33, 9).spot, null);
eq("slope facing the wrong way", rotationMatches(slopeRight, 0), false);
eq("slope facing out", rotationMatches(slopeRight, Math.PI / 2 + 2 * Math.PI), true);
eq("round brick: any rotation", rotationMatches(parrot.placements[1], 1.234), true);
eq("bar plate: quarter turns", [rotationMatches(parrot.placements[8], Math.PI / 2), rotationMatches(parrot.placements[8], Math.PI / 4)], [true, false]);

const ramA2 = pc.placements[0];
eq("DIMM magnet: A1", snapHeld(ramA2, DIMM.x(0) + 1, DIMM.zc + 40).spot, 0);
eq("DIMM magnet: A2", snapHeld(ramA2, DIMM.x(1) - 2, DIMM.zc - 30).spot, "target");
eq("verdict: right stick in A2", evaluate(pc, ramA2, "ddr5", "target", 0), { ok: true });
eq("verdict: backwards stick", evaluate(pc, ramA2, "ddr5", "target", Math.PI).kind, "wrong-rotation");
eq("verdict: DDR4 stick", evaluate(pc, ramA2, "ddr4", "target", 0).kind, "wrong-part");
eq("verdict: A1 instead of A2", evaluate(pc, ramA2, "ddr5", 0, 0).message.startsWith("That's A1"), true);
eq("verdict: dropped off the board", evaluate(pc, ramA2, "ddr5", null, 0).kind, "miss");
eq("verdict: GPU in the x1 slot", evaluate(pc, pc.placements[2], "gpu", 0, 0).message.includes("x1"), true);

// ---------- voice ----------
console.log("\nVoice");
eq("\"I'm stuck\"", matchPractice("I'm stuck"), "stuck");
eq("\"where does this go?\"", matchPractice("Where does this go?"), "stuck");
eq("\"next\"", matchPractice("okay next please"), "next");
eq("\"go back\"", matchPractice("go back"), "back");
eq("\"repeat that\"", matchPractice("repeat that"), "repeat");
eq("\"turn it around\"", matchPractice("turn it around"), "rotate");
eq("\"start over\"", matchPractice("start over"), "restart");
eq("a question goes to Claude", matchPractice("why does the notch matter?"), null);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
