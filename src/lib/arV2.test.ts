import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { footprintCells, sameCell, validPlacement, type Placement } from "./buildFrame";
import { frameToStud, isDegenerate, registerTwoPoints, rotationDeg, shiftRegistration, studToFrame } from "./registration";
import { bestPatchOnSegment, extractPatch, trackPatch } from "./patchTracker";
import { clampToBox, coverMap, frameToScreen, screenToFrame } from "./arGeometry";
import type { Point } from "./arGeometry";
import { cropPointToFrame } from "./arCrop";
import { parseFineGuide } from "./arGuide";

const placement: Placement = { ref: "base", dx: 2, dy: 3, rotation: 90, layer: 1, footprint: { w: 2, h: 3 }, source: "agent-estimated" };

describe("stud placement and camera registration", () => {
  it("validates and rotates a footprint", () => {
    expect(validPlacement(placement)).toBe(true);
    expect(footprintCells(placement)).toHaveLength(6);
    expect(footprintCells(placement)).toContainEqual({ x: 4, y: 4 });
    expect(validPlacement({ ...placement, footprint: { w: 0, h: 3 } })).toBe(false);
    expect(sameCell({ x: 2, y: 4 }, { x: 2, y: 4 })).toBe(true);
    expect(sameCell({ x: 2, y: 4 }, { x: 3, y: 4 })).toBe(false);
  });
  it("recovers a rotated pixel transform and rejects close taps", () => {
    const r = registerTwoPoints({ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 140, y: 100 }, { x: 280, y: 170 });
    expect(r).not.toBeNull();
    const frame = studToFrame({ x: 3, y: 2 }, r!);
    expect(frameToStud(frame, r!)).toEqual({ x: 3, y: 2 });
    expect(studToFrame({ x: 3, y: 2 }, shiftRegistration(r!, 5, -4))).toEqual({ x: frame.x + 5, y: frame.y - 4 });
    expect(registerTwoPoints({ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
    expect(isDegenerate({ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBe(true);
    expect(rotationDeg(r!)).toBeCloseTo(Math.atan2(70, 140) * 180 / Math.PI);
  });
  it("round trips through object-cover and clamps assistant position", () => {
    const map = coverMap(1280, 720, 390, 844);
    const point = { x: .52, y: .47 };
    const screen = frameToScreen(point, map) as Point;
    expect(screenToFrame(screen, map).x).toBeCloseTo(point.x);
    expect(clampToBox({ x: -1, y: 900 }, { left: 8, top: 80, right: 160, bottom: 450 })).toEqual({ x: 8, y: 450 });
    expect(clampToBox({ x: 900, y: -1 }, { x: 56, y: 56 }, { left: 0, top: 0, right: 390, bottom: 844 }, { left: 8, right: 8, top: 20, bottom: 30 })).toEqual({ x: 326, y: 20 });
  });
  it("tracks translation of a textured patch and rejects flat frames", () => {
    const width = 40, height = 30;
    const pixels = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = (x * 31 + y * 71) % 256;
    const patch = extractPatch({ pixels, width, height }, 18, 14, 11)!;
    const moved = new Uint8ClampedArray(width * height);
    for (let y = 2; y < height; y++) for (let x = 3; x < width; x++) moved[y * width + x] = pixels[(y - 2) * width + x - 3];
    const result = trackPatch(patch, { pixels: moved, width, height }, patch.x, patch.y, 5);
    expect(result.reliable).toBe(true);
    expect(result.x - patch.x).toBe(3);
    expect(result.y - patch.y).toBe(2);
    expect(trackPatch(extractPatch({ pixels: new Uint8ClampedArray(width * height), width, height }, 18, 14)!, { pixels: moved, width, height }).reliable).toBe(false);
    expect(bestPatchOnSegment({ pixels: new Uint8ClampedArray(width * height), width, height }, 5, 15, 30, 15)).toBeNull();
    expect(bestPatchOnSegment({ pixels, width, height }, 5, 15, 30, 15)?.texture).toBeGreaterThan(7);
  });
  it("maps a fine camera crop back to the full frame and strips invisible points", () => {
    const fine = parseFineGuide({ visible: true, confidence: .8, placement: { x: .5, y: .25 }, orientationDegrees: 90 });
    const frame = fine?.placement && cropPointToFrame(fine.placement, { left: .2, top: .1, right: .6, bottom: .9 });
    expect(frame?.x).toBeCloseTo(.4);
    expect(frame?.y).toBeCloseTo(.3);
    expect(parseFineGuide({ visible: false, confidence: .8, placement: { x: .5, y: .5 } })?.placement).toBeUndefined();
    expect(parseFineGuide({ visible: true, confidence: .3, placement: { x: .5, y: .5 } })?.placement).toBeUndefined();
  });
  it("keeps all first fifteen catalog entries tied to actual steps", () => {
    const catalog = JSON.parse(readFileSync("public/steps/6455750.placements.json", "utf8"));
    const manual = JSON.parse(readFileSync("public/steps/6455750.json", "utf8"));
    expect(Object.keys(catalog.steps)).toHaveLength(15);
    for (const [key, value] of Object.entries(catalog.steps)) {
      const [page, index] = key.split("-").map(Number);
      expect(manual.pages[String(page)]?.[index]).toBeTruthy();
      expect(validPlacement(value)).toBe(true);
      expect(footprintCells(value as Placement).length).toBeGreaterThan(0);
      expect((value as Placement).source).toBe("agent-estimated");
    }
  });
});
