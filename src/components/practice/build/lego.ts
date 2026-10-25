// LEGO part geometry in real millimetres (1 unit = 1 mm). Every size comes from dims.ts.
// Each part's origin is the centre of its footprint at its bottom face; studs stand on top.
// Edges carry a 0.2 mm bevel; studs are instanced and have a bevelled top.

import * as THREE from "three";
import { LEGO, axleLength, legoBox, rectStuds, roundDiameter, roundStuds, slope45Profile, tubeCentres } from "../dims";
import type { MaterialFor } from "./materials";

const B = LEGO.BEVEL;

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, name?: string) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

// Extrudes a shape drawn in the XZ footprint (shape y = -z) upward to height h, with bevelled top and bottom edges.
// The shape should already be inset by the bevel: the bevel grows it back to full size.
function extrudeUp(shape: THREE.Shape, h: number, bevel: number = B, curveSegments = 12) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, h - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2); // extrusion (z) becomes up (y); shape y becomes -z
  return g;
}

function roundedRect<T extends THREE.Path>(path: T, w: number, d: number, r: number): T {
  const x = -w / 2;
  const y = -d / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + d - r);
  path.absarc(x + w - r, y + d - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + d);
  path.absarc(x + r, y + d - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r);
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

// ---------- studs (instanced) ----------

let studGeo: THREE.LatheGeometry | null = null;
function studGeometry() {
  if (studGeo) return studGeo;
  const r = LEGO.STUD_D / 2;
  const h = LEGO.STUD_H;
  const b = LEGO.STUD_BEVEL;
  const pts = [new THREE.Vector2(0, -0.05), new THREE.Vector2(r, -0.05), new THREE.Vector2(r, h - b)];
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - b + Math.cos(a) * b, h - b + Math.sin(a) * b));
  }
  pts.push(new THREE.Vector2(0, h));
  studGeo = new THREE.LatheGeometry(pts, 28);
  return studGeo;
}

function studs(spots: [number, number][], top: number, mat: THREE.Material) {
  const im = new THREE.InstancedMesh(studGeometry(), mat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => im.setMatrixAt(i, m.makeTranslation(x, top, z)));
  im.castShadow = im.receiveShadow = true;
  im.name = "studs";
  return im;
}

// ---------- hollow shells: 1.2 mm walls, 1.0 mm top, anti-stud tubes underneath ----------

function rectShell(w: number, d: number, h: number, studsX: number, studsZ: number, mat: MaterialFor, color: string) {
  const g = new THREE.Group();
  const outer = roundedRect(new THREE.Shape(), w - 2 * B, d - 2 * B, 0.15);
  // the bevel shrinks the hole by B, so draw it B larger to end up with exact 1.2 mm walls
  const hw = w - 2 * LEGO.WALL + 2 * B;
  const hd = d - 2 * LEGO.WALL + 2 * B;
  outer.holes.push(roundedRect(new THREE.Path(), hw, hd, 0.05));
  g.add(mesh(extrudeUp(outer, h), mat("abs", color), "walls"));

  // top: fills the ring's flat top exactly, so the outer surface is seamless
  const cap = new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), hw, hd, 0.05));
  cap.rotateX(-Math.PI / 2);
  cap.translate(0, h, 0);
  g.add(mesh(cap, mat("abs", color), "top"));
  // underside of the top, seen from below
  const under = new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), w - 2 * LEGO.WALL, d - 2 * LEGO.WALL, 0.05));
  under.rotateX(Math.PI / 2);
  under.translate(0, h - LEGO.TOP, 0);
  g.add(mesh(under, mat("abs", color), "under"));

  const tubes = tubeCentres(studsX, studsZ);
  if (tubes.length) {
    const tubeH = h - LEGO.TOP;
    const ro = LEGO.TUBE_OD / 2;
    const ri = LEGO.TUBE_ID / 2;
    const tube = new THREE.LatheGeometry(
      [new THREE.Vector2(ri, tubeH), new THREE.Vector2(ri, 0), new THREE.Vector2(ro, 0), new THREE.Vector2(ro, tubeH)],
      28,
    );
    const im = new THREE.InstancedMesh(tube, mat("abs", color), tubes.length);
    const m = new THREE.Matrix4();
    tubes.forEach(([x, z], i) => im.setMatrixAt(i, m.makeTranslation(x, 0, z)));
    im.name = "tubes";
    g.add(im);
  }
  return g;
}

export function brick(studsX: number, studsZ: number, plates: number, color: string, mat: MaterialFor) {
  const { w, d, h } = legoBox(studsX, studsZ, plates);
  const g = rectShell(w, d, h, studsX, studsZ, mat, color);
  g.add(studs(rectStuds(studsX, studsZ), h, mat("abs", color)));
  return g;
}

// ---------- round parts ----------

function circleShape(r: number, holeR = 0) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  if (holeR > 0) {
    const p = new THREE.Path();
    p.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  return s;
}

// Technic axle cross section: 4.8 mm across, 1.8 mm arms.
function crossShape(span: number, arm: number) {
  const a = arm / 2;
  const l = span / 2;
  const c = new THREE.Shape();
  c.moveTo(-a, -l);
  c.lineTo(a, -l);
  c.lineTo(a, -a);
  c.lineTo(l, -a);
  c.lineTo(l, a);
  c.lineTo(a, a);
  c.lineTo(a, l);
  c.lineTo(-a, l);
  c.lineTo(-a, a);
  c.lineTo(-l, a);
  c.lineTo(-l, -a);
  c.lineTo(-a, -a);
  c.closePath();
  return c;
}

function axleHoleDecal(y: number, color: string, mat: MaterialFor, under = false) {
  const decal = new THREE.ShapeGeometry(crossShape(LEGO.AXLE_SPAN, LEGO.AXLE_ARM));
  decal.rotateX(under ? Math.PI / 2 : -Math.PI / 2);
  decal.translate(0, y, 0);
  return mesh(decal, mat("absDark", color), "axle-hole");
}

/** Technic axle, `length` studs long (9 → 71.8 mm), standing on its bottom end. */
export function axle(length: number, color: string, mat: MaterialFor) {
  const b = 0.15;
  const g = new THREE.Group();
  g.add(mesh(extrudeUp(crossShape(LEGO.AXLE_SPAN - 2 * b, LEGO.AXLE_ARM - 2 * b), axleLength(length), b, 4), mat("abs", color), "axle"));
  return g;
}

/** 2L smooth axle connector: a 15.8 mm tube with an axle hole at each end. */
export function axleConnector(color: string, mat: MaterialFor) {
  const g = new THREE.Group();
  const r = LEGO.CONNECTOR_D / 2;
  const h = axleLength(2);
  const b = LEGO.BEVEL;
  const body = new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(r - b, 0), new THREE.Vector2(r, b), new THREE.Vector2(r, h - b), new THREE.Vector2(r - b, h), new THREE.Vector2(0, h)],
    32,
  );
  g.add(mesh(body, mat("abs", color), "body"));
  g.add(axleHoleDecal(h + 0.02, color, mat));
  g.add(axleHoleDecal(-0.02, color, mat, true));
  return g;
}

/** n x n round plate: optional centre pin hole or axle hole; a tile has a smooth top (no studs). */
export function roundPlate(n: number, color: string, hole: boolean, mat: MaterialFor, opts: { axleHole?: boolean; tile?: boolean } = {}) {
  const g = new THREE.Group();
  const r = roundDiameter(n) / 2;
  const h = LEGO.PLATE_H;
  g.add(mesh(extrudeUp(circleShape(r - B, hole ? LEGO.PIN_HOLE_D / 2 + B : 0), h, B, 48), mat("abs", color), "body"));
  if (hole) {
    // the inside of the hole reads darker
    const bore = new THREE.CylinderGeometry(LEGO.PIN_HOLE_D / 2 - 0.02, LEGO.PIN_HOLE_D / 2 - 0.02, h - 0.1, 24, 1, true);
    bore.translate(0, h / 2, 0);
    g.add(mesh(bore, mat("absDark", color), "hole"));
  }
  if (opts.axleHole && !hole) g.add(axleHoleDecal(h + 0.02, color, mat));
  if (!opts.tile) {
    const spots = roundStuds(n).filter(([x, z]) => !hole || Math.hypot(x, z) > LEGO.PIN_HOLE_D);
    g.add(studs(spots, h, mat("abs", color)));
  }
  return g;
}

/** Half of an n x n round plate: the flat edge runs along x at z = -0.1 (half the clearance), the curve towards -z. */
export function halfRoundPlate(n: number, color: string, mat: MaterialFor) {
  const r = roundDiameter(n) / 2 - B;
  const e = LEGO.GAP + B; // flat edge sits 0.1 mm off the centre line, so two halves leave a 0.2 mm gap
  const a0 = Math.asin(e / r);
  const s = new THREE.Shape();
  s.moveTo(r * Math.cos(a0), e);
  s.absarc(0, 0, r, a0, Math.PI - a0, false);
  s.closePath();
  const g = new THREE.Group();
  g.add(mesh(extrudeUp(s, LEGO.PLATE_H, B, 64), mat("abs", color), "body"));
  g.add(studs(roundStuds(n, true), LEGO.PLATE_H, mat("abs", color)));
  return g;
}

/** 2x2 round brick (3941): 15.8 mm across, hollow underneath, four studs round a cross axle hole. */
export function roundBrick(color: string, mat: MaterialFor) {
  const g = new THREE.Group();
  const R = roundDiameter(2) / 2;
  const h = LEGO.BRICK_H;
  const ri = R - LEGO.WALL;
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, h - LEGO.TOP), new THREE.Vector2(ri, h - LEGO.TOP), new THREE.Vector2(ri, 0), new THREE.Vector2(R - B, 0)];
  pts.push(new THREE.Vector2(R, B), new THREE.Vector2(R, h - B), new THREE.Vector2(R - B, h), new THREE.Vector2(0, h));
  g.add(mesh(new THREE.LatheGeometry(pts, 56), mat("abs", color), "body"));
  // centre tube with the axle hole
  const tube = new THREE.LatheGeometry(
    [new THREE.Vector2(LEGO.TUBE_ID / 2, h - LEGO.TOP), new THREE.Vector2(LEGO.TUBE_ID / 2, 0), new THREE.Vector2(LEGO.TUBE_OD / 2, 0), new THREE.Vector2(LEGO.TUBE_OD / 2, h - LEGO.TOP)],
    28,
  );
  g.add(mesh(tube, mat("abs", color), "tube"));
  // cross axle hole on top (4.8 mm across, 1.8 mm arms)
  const arm = 1.8;
  const len = 4.8;
  const c = new THREE.Shape();
  const a = arm / 2;
  const l = len / 2;
  c.moveTo(-a, -l);
  c.lineTo(a, -l);
  c.lineTo(a, -a);
  c.lineTo(l, -a);
  c.lineTo(l, a);
  c.lineTo(a, a);
  c.lineTo(a, l);
  c.lineTo(-a, l);
  c.lineTo(-a, a);
  c.lineTo(-l, a);
  c.lineTo(-l, -a);
  c.lineTo(-a, -a);
  c.closePath();
  const decal = new THREE.ShapeGeometry(c);
  decal.rotateX(-Math.PI / 2);
  decal.translate(0, h + 0.02, 0);
  g.add(mesh(decal, mat("absDark", color), "axle"));
  g.add(studs(rectStuds(2, 2), h, mat("abs", color)));
  return g;
}

/** 2x2 45° slope (3039): flat stud row at the back (-z), slope down to a 1.7 mm lip at the front (+z). */
export function slope45(color: string, mat: MaterialFor) {
  const { depth, flat, lip, height } = slope45Profile(2);
  const w = depth; // 2 studs wide too
  const half = depth / 2;
  // side profile in (z, y), inset by the bevel
  const s = new THREE.Shape();
  s.moveTo(-half + B, B);
  s.lineTo(half - B, B);
  s.lineTo(half - B, lip - B * 0.4);
  s.lineTo(-half + flat + B * 0.4, height - B);
  s.lineTo(-half + B, height - B);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: w - 2 * B, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 2 });
  geo.translate(0, 0, -(w - 2 * B) / 2);
  geo.rotateY(-Math.PI / 2); // profile u -> z, extrusion -> x
  const g = new THREE.Group();
  g.add(mesh(geo, mat("abs", color), "body"));
  const z = -LEGO.PITCH / 2; // the back row
  g.add(studs([[-LEGO.PITCH / 2, z], [LEGO.PITCH / 2, z]], height, mat("abs", color)));
  return g;
}

/** 2x2 round plate with a centre hole and four bars (3.18 mm) that run out and bend upward. */
export function barPlate(color: string, mat: MaterialFor) {
  const g = roundPlate(2, color, true, mat);
  const r = LEGO.BAR_D / 2;
  const y = LEGO.PLATE_H / 2;
  const start = roundDiameter(2) / 2 - 1.2;
  const out = start + 4.2;
  const bend = 2.4;
  const top = y + 11.5;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const P = (radial: number, h: number) => dir.clone().multiplyScalar(radial).setY(h);
    const path = new THREE.CurvePath<THREE.Vector3>();
    path.add(new THREE.LineCurve3(P(start, y), P(out - bend, y)));
    path.add(new THREE.QuadraticBezierCurve3(P(out - bend, y), P(out, y), P(out, y + bend)));
    path.add(new THREE.LineCurve3(P(out, y + bend), P(out, top)));
    g.add(mesh(new THREE.TubeGeometry(path, 40, r, 14, false), mat("abs", color), "bar"));
    const tip = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const tipMesh = mesh(tip, mat("abs", color), "tip");
    tipMesh.position.copy(P(out, top));
    g.add(tipMesh);
  }
  return g;
}
