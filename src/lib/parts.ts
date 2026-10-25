// How parts are described to the model, so it can tell lookalikes apart ("2x4 lime green plate" vs "2x4 green brick").
// Pure functions: used by the browser (requests) and the server (prompts). Run the tests with: npm run test:parts

export type PartInfo = {
  name: string;
  qty?: number;
  shape?: string;
  studsX?: number;
  studsY?: number;
  visual_description?: string;
};

// What a request carries for each part: a short description and how many.
export type PartLine = { description: string; qty: number };

const MAX_DESC = 80;
const MAX_PARTS = 24;

function clean(s: unknown): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX_DESC) : "";
}

/** A short visual description: the manual reading's own when it has one, otherwise built from name, size and shape. */
export function describePart(p: PartInfo): string {
  const own = clean(p.visual_description);
  if (own) return own;
  const name = clean(p.name) || "part";
  const size = p.studsX && p.studsY ? `${p.studsX}x${p.studsY}` : "";
  const extras = [
    size && !name.includes(size) && !name.includes(`${p.studsY}x${p.studsX}`) ? size : "",
    p.shape && p.shape !== "other" && !name.toLowerCase().includes(p.shape) ? p.shape : "",
  ].filter(Boolean);
  return extras.length ? `${name} (${extras.join(" ")})` : name;
}

/** Parts for a request body. */
export function partLines(parts: PartInfo[]): PartLine[] {
  return parts.slice(0, MAX_PARTS).map((p) => ({ description: describePart(p), qty: Math.max(1, Math.round(Number(p.qty) || 1)) }));
}

/** Validates parts from a request body (untrusted). Drops anything malformed. */
export function readPartLines(raw: unknown): PartLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_PARTS)
    .map((p) => ({ description: clean((p as Record<string, unknown>)?.description), qty: Math.max(1, Math.round(Number((p as Record<string, unknown>)?.qty) || 1)) }))
    .filter((p) => p.description);
}

/** The parts list as prompt text: "- 1x 2x4 lime green plate". */
export function partsPrompt(parts: PartLine[]): string {
  return parts.map((p) => `- ${p.qty}x ${p.description}`).join("\n");
}

/** The rule added to every prompt that has to recognize parts. */
export const LOOKALIKE_RULE =
  "Identify each piece by its listed appearance (color, size, shape), not by what the step expects to see. " +
  "Lookalikes are common (lime vs green, 2x3 vs 2x4, plate vs brick). If you can't tell which listed part a piece is, treat it as unknown.";
