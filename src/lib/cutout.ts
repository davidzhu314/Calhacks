"use client";

// Turns a part's drawing from a manual's parts box into a floating cut-out:
// removes the paper background (flood fill from the edges), drops small specks like the "1x" label,
// and trims to the piece. Returns a transparent PNG plus its size, or null if nothing usable is left.

import { encodeCanvas } from "@/lib/encode";

const TOLERANCE = 42; // how far (RGB distance) a pixel can be from the background color and still count as background
const MIN_PIECE_SHARE = 0.12; // blobs smaller than this share of the biggest blob are dropped (labels, specks)

// width/height: the piece's share of the input image (for scaling); pxWidth/pxHeight: its pixel size (for the aspect ratio).
export type Cutout = { image: string; width: number; height: number; pxWidth: number; pxHeight: number };

export async function cutOutPiece(dataUrl: string): Promise<Cutout | null> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 8 || h < 8) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Background color: the most common color along the border.
  const counts = new Map<number, number>();
  const key = (i: number) => ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  for (const p of border) counts.set(key(p * 4), (counts.get(key(p * 4)) ?? 0) + 1);
  const bgKey = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const bg = [((bgKey >> 10) & 31) * 8 + 4, ((bgKey >> 5) & 31) * 8 + 4, (bgKey & 31) * 8 + 4];
  const dist = (i: number) => Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]);

  // Flood fill the background from every border pixel.
  const isBg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const p of border) {
    if (!isBg[p] && dist(p * 4) < TOLERANCE) {
      isBg[p] = 1;
      stack.push(p);
    }
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const neighbors = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
    for (const q of neighbors) {
      if (q < 0 || q >= w * h || isBg[q]) continue;
      if (dist(q * 4) < TOLERANCE) {
        isBg[q] = 1;
        stack.push(q);
      }
    }
  }

  // Group what's left into blobs; keep the big ones (the piece), drop small ones (the "1x" label, specks).
  const blob = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let p = 0; p < w * h; p++) {
    if (isBg[p] || blob[p] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    blob[p] = id;
    stack.push(p);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % w;
      for (const q of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) {
        if (q < 0 || q >= w * h || isBg[q] || blob[q] >= 0) continue;
        blob[q] = id;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  if (!sizes.length) return null;
  const biggest = Math.max(...sizes);
  if (biggest < 60) return null;
  const keep = sizes.map((s) => s >= biggest * MIN_PIECE_SHARE);

  // Clear the background and dropped blobs; soften the edge a little so it doesn't look jagged.
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (isBg[p] || !keep[blob[p]]) {
      px[i + 3] = 0;
      continue;
    }
    const d = dist(i);
    if (d < TOLERANCE * 1.6) px[i + 3] = Math.round(255 * Math.min(1, (d - TOLERANCE * 0.6) / TOLERANCE));
    const x = p % w;
    const y = (p - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  ctx.putImageData(data, 0, 0);

  // Trim to the piece with a small margin.
  const pad = 4;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(w, maxX + pad + 1) - cx;
  const ch = Math.min(h, maxY + pad + 1) - cy;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")?.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
  return { image: await encodeCanvas(out, "image/png"), width: cw / w, height: ch / h, pxWidth: cw, pxHeight: ch };
}
