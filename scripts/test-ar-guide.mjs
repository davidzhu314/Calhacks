import assert from "node:assert/strict";
import { coverMap, frameToScreen, screenToFrame, visibleInCover } from "../src/lib/arGeometry.ts";
import { parseGuide } from "../src/lib/arGuide.ts";
import { acceptDetection, iou, isLost, pinPlacement, sceneDelta } from "../src/lib/arTracker.ts";
import { mayGround, responseIsCurrent } from "../src/lib/arScheduler.ts";

let count = 0;
const check = (name, fn) => { fn(); count++; process.stdout.write(`PASS ${name}\n`); };
check("cover maps landscape camera into portrait screen with crop", () => {
  const map = coverMap(1280, 720, 390, 844);
  assert.equal(map.scale, 844 / 720);
  assert.ok(map.offsetX < 0);
  const p = { x: .5, y: .4 };
  const screen = frameToScreen(p, map);
  const back = screenToFrame(screen, map);
  assert.ok(Math.abs(back.x - p.x) < 1e-9 && Math.abs(back.y - p.y) < 1e-9);
  assert.equal(visibleInCover({ x: 0, y: .5 }, map), false);
  assert.equal(visibleInCover({ x: .5, y: .5 }, map), true);
});
check("portrait and rotated maps recompute", () => {
  const a = coverMap(720, 1280, 390, 844);
  const b = coverMap(720, 1280, 844, 390);
  assert.notEqual(a.offsetY, b.offsetY);
  assert.ok((frameToScreen({ x: .5, y: .5 }, b)).x > (frameToScreen({ x: .5, y: .5 }, a)).x);
});
const valid = { visible: true, status: "absent", confidence: .91, explanation: "Place it", assemblyBox: { left: .2, top: .2, right: .8, bottom: .8 }, partBox: { left: .1, top: .1, right: .2, bottom: .2 }, placement: { x: .5, y: .5 }, orientationDegrees: 45 };
check("guide strips geometry when not visible", () => {
  const guide = parseGuide({ ...valid, visible: false });
  assert.equal(guide.placement, undefined);
  assert.equal(guide.partBox, undefined);
  assert.equal(guide.orientationDegrees, null);
});
check("guide accepts no placement and rejects outside placement", () => {
  assert.equal(parseGuide({ ...valid, placement: null }).placement, undefined);
  assert.equal(parseGuide({ ...valid, placement: { x: .95, y: .95 } }).placement, undefined);
});
check("guide validates boxes, confidence, and status", () => {
  assert.equal(parseGuide({ ...valid, partBox: { left: 0, top: 0, right: .01, bottom: .01 } }).partBox, undefined);
  assert.equal(parseGuide({ ...valid, assemblyBox: { left: 0, top: 0, right: 1, bottom: 1 } }).placement, undefined);
  assert.equal(parseGuide({ ...valid, confidence: .6 }).orientationDegrees, null);
  for (const status of ["present", "absent", "occluded", "future-placement", "ambiguous"]) assert.equal(parseGuide({ ...valid, status }).status, status);
  assert.equal(parseGuide({ ...valid, confidence: "0.9" }), null);
  assert.equal(parseGuide({ ...valid, confidence: NaN }), null);
});
check("first detection and agreement gates", () => {
  assert.equal(acceptDetection(null, { ...valid, confidence: .79 }, 0), null);
  const first = acceptDetection(null, parseGuide(valid), 0);
  assert.ok(first);
  assert.equal(iou(first.guide.assemblyBox, { left: .21, top: .21, right: .81, bottom: .81 }) > .5, true);
  assert.equal(acceptDetection(first, { ...parseGuide(valid), assemblyBox: { left: 0, top: 0, right: .1, bottom: .1 } }, 100), null);
  const moved = parseGuide({ ...valid, assemblyBox: { left: .01, top: .01, right: .2, bottom: .2 }, placement: { x: .1, y: .1 }, confidence: .7 });
  assert.equal(acceptDetection(first, moved, 200), null);
  assert.ok(acceptDetection(first, moved, 300, .35, moved));
});
check("smoothing, pinning, expiry, and scene difference", () => {
  const first = acceptDetection(null, parseGuide(valid), 0);
  const shifted = parseGuide({ ...valid, placement: { x: .6, y: .5 } });
  const smooth = acceptDetection(first, shifted, 100);
  assert.ok(smooth.guide.placement.x > .5 && smooth.guide.placement.x < .6);
  const pinned = pinPlacement(smooth, { x: .4, y: .4 });
  assert.deepEqual(acceptDetection(pinned, shifted, 200).guide.placement, { x: .4, y: .4 });
  assert.equal(isLost(pinned, 13000), true);
  assert.ok(sceneDelta(Uint8Array.of(1, 1), Uint8Array.of(2, 2)) < .01);
  assert.ok(sceneDelta(Uint8Array.of(0, 0), Uint8Array.of(255, 255)) > .9);
});
check("scheduler throttles and permits one request", () => {
  const ready = { enabled: true, blocked: false, hidden: false, ready: true, due: true, busy: false, lastRequest: 1000 };
  assert.equal(mayGround({ ...ready, now: 4999 }), false);
  assert.equal(mayGround({ ...ready, now: 5000 }), true);
  assert.equal(mayGround({ ...ready, now: 5000, busy: true }), false);
  assert.equal(mayGround({ ...ready, now: 5000, blocked: true }), false);
  assert.equal(mayGround({ ...ready, now: 5000, hidden: true }), false);
});
check("late replies after navigation or rescan are ignored", () => {
  const old = { key: "5-0-0", id: 1 };
  assert.equal(responseIsCurrent(old, { ...old, enabled: true, blocked: false }), true);
  assert.equal(responseIsCurrent(old, { key: "5-1-0", id: 2, enabled: true, blocked: false }), false);
  assert.equal(responseIsCurrent(old, { key: "5-0-0", id: 2, enabled: true, blocked: false }), false);
  assert.equal(responseIsCurrent(old, { ...old, enabled: true, blocked: true }), false);
});
process.stdout.write(`${count}/${count} AR tests passed\n`);
