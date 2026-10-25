import type { Placement } from "./buildFrame";

const count = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? "stud" : "studs"}`;

/** A short 2D description in the first plate's stud frame, never a depth claim. */
export function placementPhrase(placement: Placement): string {
  const { dx, dy } = placement;
  const moves = [
    dx ? `${count(dx)} ${dx > 0 ? "right" : "left"}` : "",
    dy ? `${count(dy)} ${dy > 0 ? "inward" : "outward"}` : "",
  ].filter(Boolean);
  const size = placement.rotation % 180 ? { w: placement.footprint.h, h: placement.footprint.w } : placement.footprint;
  const orientation = size.w === size.h ? "" : size.w > size.h ? " Long side across." : " Long side inward.";
  const location = moves.length ? `${moves.join(" and ")} from the first plate's left reference stud.` : "At the first plate's left reference stud.";
  return `${location} ${size.w} by ${size.h} studs.${orientation}`;
}
