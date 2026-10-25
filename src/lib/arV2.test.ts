import { describe, expect, it } from "vitest";
import { footprintCells, validPlacement, type Placement } from "./buildFrame";
import { frameToStud, registerTwoPoints, shiftRegistration, studToFrame } from "./registration";
import { extractPatch, trackPatch } from "./patchTracker";
import { clampToBox, coverMap, frameToScreen, screenToFrame } from "./arGeometry";
import type { Point } from "./arGeometry";

const placement: Placement = { ref: "base", dx: 2, dy: 3, rotation: 90, layer: 1, footprint: { w: 2, h: 3 }, source: "agent-estimated" };

describe("stud placement and camera registration", () => {
  it("validates and rotates a footprint", () => {
    expect(validPlacement(placement)).toBe(true);
    expect(footprintCells(placement)).toHaveLength(6);
    expect(footprintCells(placement)).toContainEqual({ x: 4, y: 4 });
    expect(validPlacement({ ...placement, footprint: { w: 0, h: 3 } })).toBe(false);
  });
  it("recovers a rotated pixel transform and rejects close taps", () => {
    const r = registerTwoPoints({ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 140, y: 100 }, { x: 280, y: 170 });
    expect(r).not.toBeNull();
    const frame = studToFrame({ x: 3, y: 2 }, r!);
    expect(frameToStud(frame, r!)).toEqual({ x: 3, y: 2 });
    expect(studToFrame({ x: 3, y: 2 }, shiftRegistration(r!, 5, -4))).toEqual({ x: frame.x + 5, y: frame.y - 4 });
    expect(registerTwoPoints({ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });
  it("round trips through object-cover and clamps assistant position", () => {
    const map = coverMap(1280, 720, 390, 844);
    const point = { x: .52, y: .47 };
    const screen = frameToScreen(point, map) as Point;
    expect(screenToFrame(screen, map).x).toBeCloseTo(point.x);
    expect(clampToBox({ x: -1, y: 900 }, { left: 8, top: 80, right: 160, bottom: 450 })).toEqual({ x: 8, y: 450 });
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
  });
});
