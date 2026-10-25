// Reads one manual page image and returns the build steps on it.

import { askClaude, ClaudeError } from "@/lib/claude";
import { firstJsonObject } from "@/lib/json";

const MAX_IMAGE_CHARS = 6_000_000;

export type ExtractedPart = {
  name: string; // "red 2x4 brick", "short wooden dowel"
  color: string; // CSS color for the chip
  qty: number;
  shape: "brick" | "plate" | "tile" | "slope" | "round" | "hardware" | "panel" | "other";
  studsX?: number; // LEGO only
  studsY?: number;
  visual_description?: string; // "2x4 lime green plate": color, size, shape, to tell lookalikes apart (missing on older readings)
};

export type ExtractedStep = {
  number: number;
  instruction: string; // spoken, imperative, ≤ 20 words
  parts: ExtractedPart[];
  watchFor: string[]; // easy mistakes on this step
  box: { x: number; y: number; w: number; h: number }; // where the step's picture sits, 0–1 of the page
  sub?: string; // "1/4" when a big step is split into numbered close-ups (e.g. IKEA corner details)
  continued?: boolean; // page continues the previous page's step without printing a number
};

const SYSTEM_PROMPT = `You read one page of a picture-based assembly manual (LEGO, IKEA, or similar).
A thin pink grid with percentage labels (10, 20, ... 90) is drawn over the page to help you measure positions.
Return every build step on the page, in reading order (top to bottom, left to right; check every column).
Pages with no build actions (cover, parts inventory, ads, pure safety/warning notes) return an empty list.

How to split a page into steps:
- The step number is the LARGE bold number (e.g. "24"). Small numbers next to panels inside a step (1, 2, 3) are panel
  numbers, never step numbers; "2x" means "build this twice" and is not a step number.
- Each printed step number is its own entry. A page can hold many (2-8 is common). Never merge two numbered steps.
- If one big numbered step contains smaller numbered panels or close-ups (e.g. big "8" with panels 1, 2, 3, 4),
  return one entry PER PANEL: all with the big step's "number", plus "sub": "1/4", "2/4", ... and a box around that panel.
  Same for LEGO sub-builds drawn in a box with their own small numbers inside a step.
- If a step has no sub-panels, leave out "sub".
- Manuals without printed numbers (often IKEA): each distinct action picture is a step; number them yourself in reading order.
- A page with a build action but no printed step number (it continues the previous page's step, e.g. arrows attaching
  sub-builds) still gets an entry: "number": null, "continued": true.
- Skip "don't do this" pictures (crossed out) and pure zoom-ins that repeat the same action; mention them in watchFor instead.

For each entry:
- number: the printed step number (or your reading-order number if none is printed).
- instruction: one imperative sentence, at most 20 words, as you'd say it aloud. Name parts by color and size,
  say where they go (left, right, front, on top of...). For a sub-panel, describe just that panel's action.
- parts: the parts shown for that step (LEGO callout box, IKEA parts beside the step), with quantities.
  For LEGO bricks, plates and tiles, give studsX and studsY (a 2x4 brick is 2 by 4). color: a CSS hex close to the real color.
  visual_description: at most 8 words naming color, size and shape the way you'd tell it apart from lookalikes
  ("2x4 lime green plate", "1x2 dark red slope", "long silver screw, flat head"). Use the exact shade (lime vs green).
- watchFor: 0-2 easy mistakes (orientation, which side, which hole, short vs long screw).
- box: the tight area of that step's (or sub-panel's) picture, including its number and parts box, as whole-number
  percentages of the page measured with the grid: {"left": 0-100, "top": 0-100, "right": 0-100, "bottom": 0-100}.

Reply with JSON only, no prose:
{"steps": [{"number": 8, "sub": "1/4", "instruction": "...", "parts": [{"name": "...", "visual_description": "...", "color": "#rrggbb", "qty": 1, "shape": "hardware"}], "watchFor": ["..."], "box": {"left": 5, "top": 15, "right": 50, "bottom": 28}}]}`;

function parse(text: string): ExtractedStep[] | null {
  try {
    const steps = (firstJsonObject(text) as { steps?: unknown } | null)?.steps;
    if (!Array.isArray(steps)) return null;
    const pct = (n: unknown, fallback: number) => {
      const v = Number(n);
      return Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : fallback;
    };
    const parsed: ExtractedStep[] = steps
      .filter((s) => (s?.number != null && Number.isFinite(Number(s.number))) || s?.continued === true)
      .map((s) => {
        const left = pct(s.box?.left, 0), top = pct(s.box?.top, 0);
        const right = pct(s.box?.right, 1), bottom = pct(s.box?.bottom, 1);
        const sane = right - left > 0.05 && bottom - top > 0.05;
        return {
          ...(typeof s.sub === "string" && /^\d+\/\d+$/.test(s.sub) ? { sub: s.sub } : {}),
          ...(s.continued === true && s.number == null ? { continued: true } : {}),
          number: s.number == null ? 0 : Number(s.number),
          instruction: String(s.instruction ?? ""),
          parts: (Array.isArray(s.parts) ? s.parts : []).map((p: Record<string, unknown>) => ({
            name: String(p.name ?? "part"),
            color: typeof p.color === "string" ? p.color : "#9e9e9e",
            qty: Number(p.qty ?? p.quantity ?? 1) || 1,
            shape: (p.shape as ExtractedPart["shape"]) ?? "other",
            studsX: p.studsX ? Number(p.studsX) : undefined,
            studsY: p.studsY ? Number(p.studsY) : undefined,
            ...(typeof p.visual_description === "string" && p.visual_description.trim()
              ? { visual_description: p.visual_description.trim().slice(0, 80) }
              : {}),
          })),
          watchFor: Array.isArray(s.watchFor) ? s.watchFor.map(String) : [],
          box: sane ? { x: left, y: top, w: right - left, h: bottom - top } : { x: 0, y: 0, w: 1, h: 1 },
        };
      });
    // Entries sharing a step number are panels of one step: label them "1/4", "2/4"... in order.
    for (const n of new Set(parsed.filter((s) => !s.continued).map((s) => s.number))) {
      const group = parsed.filter((s) => s.number === n && !s.continued);
      if (group.length > 1) group.forEach((s, i) => (s.sub = `${i + 1}/${group.length}`));
      else delete group[0].sub;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let page: unknown;
  try {
    page = (await request.json())?.page;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof page !== "string" || !page.startsWith("data:image/") || page.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "Send `page` as an image data URL." }, { status: 400 });
  }

  const started = Date.now();
  let lastRaw = "";
  try {
    // One retry: replies occasionally come back as prose instead of JSON.
    for (let attempt = 0; attempt < 2; attempt++) {
      lastRaw = await askClaude({
        system: SYSTEM_PROMPT,
        parts: [
          { type: "image", dataUrl: page },
          { type: "text", text: "Extract the steps on this page. JSON only." },
        ],
      });
      const steps = parse(lastRaw);
      if (steps) return Response.json({ steps, latencyMs: Date.now() - started });
      console.warn("[extract] unparseable reply:", lastRaw.slice(0, 400));
    }
  } catch (e) {
    const err = e instanceof ClaudeError ? e : new ClaudeError("Couldn't read that page.");
    return Response.json({ error: err.message }, { status: err.status });
  }
  return Response.json({ error: "Couldn't read steps from that page.", raw: lastRaw.slice(0, 300) }, { status: 502 });
}
