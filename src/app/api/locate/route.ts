// Finds one part in a step's manual picture: where it's drawn in the parts box, and where it goes on the build.

import { askClaude, ClaudeError } from "@/lib/claude";
import { firstJsonObject } from "@/lib/json";
import { LOOKALIKE_RULE, partsPrompt, readPartLines } from "@/lib/parts";

const MAX_IMAGE_CHARS = 4_000_000;

export type Box = { x: number; y: number; w: number; h: number }; // 0–1 of the image
export type LocateResult = { callout: Box | null; placed: Box | null };

const SYSTEM_PROMPT = `You look at one step from a picture-based assembly manual (LEGO, IKEA, or similar).
The image usually has a parts box (the parts needed for this step, often with "1x", "2x") and a drawing of the build.
A thin pink grid with percentage labels (10, 20, ... 90) is drawn over the image to help you measure positions; use it.
Find the named part.

Reply with JSON only:
{"callout": {"left": 0-100, "top": 0-100, "right": 0-100, "bottom": 0-100} or null,
 "placed": {"left": 0-100, "top": 0-100, "right": 0-100, "bottom": 0-100} or null}
- callout: tight box around that part's drawing in the parts box (not the quantity label).
- placed: box around where that part sits on the build drawing in this step (often marked by an arrow); null if you can't tell.
Coordinates are whole-number percentages of the image width and height.`;

function toBox(b: unknown): Box | null {
  if (!b || typeof b !== "object") return null;
  const r = b as Record<string, unknown>;
  const n = (v: unknown) => Math.max(0, Math.min(100, Number(v))) / 100;
  const [l, t, rt, bt] = [n(r.left), n(r.top), n(r.right), n(r.bottom)];
  if (![l, t, rt, bt].every(Number.isFinite) || rt - l < 0.01 || bt - t < 0.01) return null;
  return { x: l, y: t, w: rt - l, h: bt - t };
}

function findText(part: string, parts: ReturnType<typeof readPartLines>): string {
  if (!parts.length) return `Find this part: ${part}`;
  return `Find this part: ${part}\nAll parts in this step's parts box:\n${partsPrompt(parts)}\n${LOOKALIKE_RULE} Box only the named part; never box a different one.`;
}

export async function POST(request: Request) {
  // parts (optional): every part of this step, described by appearance, so lookalikes in the parts box aren't confused
  let body: { image?: unknown; part?: unknown; parts?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const { image, part } = body;
  if (typeof image !== "string" || !image.startsWith("data:image/") || image.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "Send `image` as an image data URL." }, { status: 400 });
  }
  if (typeof part !== "string" || !part.trim() || part.length > 120) {
    return Response.json({ error: "Send `part` as a short name." }, { status: 400 });
  }

  try {
    const text = await askClaude({
      system: SYSTEM_PROMPT,
      parts: [
        { type: "image", dataUrl: image },
        { type: "text", text: findText(part.trim(), readPartLines(body.parts)) },
      ],
    });
    const r = firstJsonObject(text) as { callout?: unknown; placed?: unknown } | null;
    if (!r) return Response.json({ error: "Couldn't find that part." }, { status: 502 });
    const result: LocateResult = { callout: toBox(r.callout), placed: toBox(r.placed) };
    return Response.json(result);
  } catch (e) {
    const err = e instanceof ClaudeError ? e : new ClaudeError("Couldn't find that part.");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
