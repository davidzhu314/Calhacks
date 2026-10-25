"use client";

// "Where am I?" for a half-built or broken build, phone side. The server half is
// src/app/api/where-am-i/route.ts. Used by findMyPlace in BuildView.tsx, on request and automatically.
//
//   1. contactSheets(tiles)  packs step pictures into labeled grids (20 per sheet)
//   2. whereAmI(...)         sends the grids and a camera frame to /api/where-am-i
//   3. decide(...)           turns the answer into what the app does: fix a broken step first, go to
//                            the next step, stay put, or say it isn't sure
//
// Tiles are numbered 1, 2, 3... in book order (that's what the grid labels show and what Claude answers
// with); each tile remembers its page and printed step number, since sub-builds restart at step 1.

import type { BrokenTile, WhereAmIResult } from "@/app/api/where-am-i/route";
import { encodeCanvas } from "@/lib/encode";

export type Tile = { tile: number; page: number; number: number; image: string };

// ── 1. Contact sheets ───────────────────────────────────────────────────────

const COLS = 5;
const ROWS = 4;
const TILE_W = 200;
const TILE_H = 160;
export const MAX_TILES = 160; // 8 sheets; the route reads at most 8

async function load(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

// Sheets are kept and reused while their tiles are the same, so automatic checks don't redraw them every time.
// Only the sheets whose tiles changed (usually just the last one, as more pages are read) are drawn again.
const sheetCache = new Map<string, Promise<string>>();

export async function contactSheets(tiles: Tile[]): Promise<{ image: string; numbers: number[] }[]> {
  const sheets: { image: string; numbers: number[] }[] = [];
  const keep = new Set<string>();
  for (let start = 0; start < tiles.length; start += COLS * ROWS) {
    const group = tiles.slice(start, start + COLS * ROWS);
    const key = group.map((t) => `${t.tile}:${t.page}:${t.number}:${t.image.length}`).join(",");
    keep.add(key);
    let image = sheetCache.get(key);
    if (!image) {
      image = drawSheet(group);
      sheetCache.set(key, image);
    }
    sheets.push({ image: await image, numbers: group.map((t) => t.tile) });
  }
  for (const key of sheetCache.keys()) if (!keep.has(key)) sheetCache.delete(key);
  return sheets;
}

async function drawSheet(group: Tile[]): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = COLS * TILE_W;
  canvas.height = Math.ceil(group.length / COLS) * TILE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, t] of group.entries()) {
    const x = (i % COLS) * TILE_W;
    const y = Math.floor(i / COLS) * TILE_H;
    try {
      const img = await load(t.image);
      const scale = Math.min((TILE_W - 8) / img.width, (TILE_H - 8) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, x + (TILE_W - w) / 2, y + (TILE_H - h) / 2, w, h);
    } catch {
      // a picture that won't load leaves its tile blank
    }
    ctx.strokeStyle = "#cccccc";
    ctx.strokeRect(x + 0.5, y + 0.5, TILE_W - 1, TILE_H - 1);
    ctx.fillStyle = "#111111";
    ctx.fillRect(x, y, 48, 26);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(String(t.tile), x + 6, y + 19);
  }
  return encodeCanvas(canvas, "image/jpeg", 0.8);
}

// ── 2. Ask the server ───────────────────────────────────────────────────────

export async function whereAmI(opts: { frame: string; tiles: Tile[]; complete: boolean }): Promise<WhereAmIResult> {
  const res = await fetch("/api/where-am-i", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame: opts.frame, sheets: await contactSheets(opts.tiles), complete: opts.complete }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Couldn't tell where you are.");
  return data as WhereAmIResult;
}

// ── 3. Decide what to do ────────────────────────────────────────────────────

export type Placement =
  | { action: "fix"; target: Tile; problems: string[]; say: string } // go back and repair this step first
  | { action: "goto"; target: Tile; say: string } // carry on from this step
  | { action: "stay"; say: string } // already on the right step
  | { action: "done"; say: string } // the last step is finished
  | { action: "unsure"; say: string }; // no usable answer (automatic checks stay quiet)

// The app goes straight to Claude's best guess and just says it; it never asks the builder to confirm.
// Automatic checks skip only near-useless answers (empty table, a hand in the way), so they don't wander.
export const AUTO_MIN_CONFIDENCE = 0.3;
// "Needs fixing" claims a piece is wrong, so it needs Claude to be fairly sure; otherwise just go to the step.
export const BROKEN_MIN_CONFIDENCE = 0.6;

/**
 * `tiles` are the tiles that were sent, in order; `current` is the step on screen. A broken earlier step
 * wins over moving on: fixing it first keeps later checks honest.
 */
export function decide(
  result: WhereAmIResult,
  tiles: Tile[],
  complete: boolean,
  current?: { page: number; number: number },
  minConfidence = 0,
): Placement {
  const byTile = new Map(tiles.map((t) => [t.tile, t]));
  const still = complete ? "" : " I'm still reading the rest of the book.";
  const reached = byTile.get(result.completed_tile);
  if (result.confidence < minConfidence) return { action: "unsure", say: "I can't see the build clearly. Hold the phone steady over it." };
  const broken =
    result.confidence < BROKEN_MIN_CONFIDENCE
      ? []
      : result.broken.map((b) => ({ b, t: byTile.get(b.tile) })).filter((x): x is { b: BrokenTile; t: Tile } => !!x.t);
  if (broken.length) {
    const { b, t } = broken[0];
    const more = broken.length > 1 ? ` There ${broken.length === 2 ? "is 1 more problem" : `are ${broken.length - 1} more problems`} after that.` : "";
    return {
      action: "fix",
      target: t,
      problems: broken.map((x) => `Step ${x.t.number}: ${x.b.part} ${x.b.problem}. ${x.b.fix}`),
      say: `It seems ${reached ? `you're up to step ${reached.number}, but ` : ""}step ${t.number} needs fixing: the ${b.part} is ${b.problem}. ${b.fix}${more}`,
    };
  }
  const next = tiles.find((t) => t.tile > result.completed_tile);
  if (!next) {
    return complete
      ? { action: "done", say: `It seems you've finished ${reached ? `step ${reached.number}, ` : ""}the last step.` }
      : { action: "unsure", say: `It seems you've finished everything I've read so far.${still} Ask again in a minute.` };
  }
  if (current && current.page === next.page && current.number === next.number) return { action: "stay", say: `You're on step ${next.number}.` };
  return {
    action: "goto",
    target: next,
    say: result.completed_tile === 0 ? `It seems nothing's built yet. Starting at step ${next.number}.` : `It seems you're on step ${next.number}. Going there now.`,
  };
}

// ── 4. Watching for changes (for automatic detection) ───────────────────────

/** Share of pixels that changed noticeably between two small grayscale samples (0–1). */
export function changed(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = 28): number {
  if (a.length !== b.length || !a.length) return 1;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > threshold) n++;
  return n / a.length;
}
