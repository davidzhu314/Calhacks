// Step check: compares the camera frame to the manual's picture for this step
// (and the previous step), and says whether the step is done and what's wrong.

import { askClaude, ClaudeError, type Part } from "@/lib/claude";
import { firstJsonObject } from "@/lib/json";

const MAX_IMAGE_CHARS = 4_000_000;

export type CheckResult = {
  step_complete: boolean;
  confidence: number; // 0–1: how sure the step_complete call is (forced low when the camera can't see the build)
  can_see: boolean; // false when the camera view doesn't show the build clearly (dark, covered, blurry, off-frame)
  issues: { part: string; problem: string; fix: string }[];
  say: string; // one short sentence to speak aloud
};

type CheckRequest = {
  frame?: string; // camera frame, data URL
  expected?: string; // manual picture of this step finished, data URL
  previous?: string; // manual picture of the previous step finished, data URL (optional)
  instruction?: string; // what this step asks for, if known
  watchFor?: string[]; // common mistakes to look for
};

const SYSTEM_PROMPT = `You check one step of a build against its instruction manual.
You get up to three images, in this order:
1. PREVIOUS: the manual's picture of the build before this step (may be missing).
2. EXPECTED: the manual's picture of the build after this step.
3. CAMERA: a photo of the real build right now.

Manual pictures are drawn, not photos: ignore drawing style, background, colors shifted by
lighting, camera angle, and the parts callout box. Judge only the physical build.
Focus on what changed between PREVIOUS and EXPECTED: is that change present in CAMERA,
in the right place and orientation?

Reply with JSON only, no other text:
{"can_see": boolean, "step_complete": boolean, "confidence": number between 0 and 1,
 "issues": [{"part": "piece by color and size", "problem": "what's wrong", "fix": "what to do"}],
 "say": "one sentence, at most 20 words, to speak to the builder"}
- can_see: false if CAMERA doesn't clearly show the build (too dark, covered, blurry, or the build isn't in frame).
- confidence: how sure you are that step_complete is right. It is NOT how sure you are that the camera is unusable.
- If can_see is false: step_complete false, issues empty, and "say" asks for a closer or clearer view.`;

function isImage(s: unknown): s is string {
  return typeof s === "string" && s.startsWith("data:image/") && s.length <= MAX_IMAGE_CHARS;
}

// The model is asked for bare JSON; tolerate a stray code fence anyway.
function parseResult(text: string): CheckResult | null {
  try {
    const r = firstJsonObject(text) as { can_see?: unknown; step_complete?: unknown; confidence?: unknown; issues?: unknown; say?: unknown } | null;
    if (!r) return null;
    if (typeof r.step_complete !== "boolean" || typeof r.confidence !== "number") return null;
    const canSee = r.can_see !== false;
    // Can't see the build: never report it as a confident pass or a list of problems.
    return {
      can_see: canSee,
      step_complete: canSee && r.step_complete,
      confidence: canSee ? Math.max(0, Math.min(1, r.confidence)) : Math.min(0.3, Math.max(0, r.confidence)),
      issues: canSee && Array.isArray(r.issues) ? r.issues : [],
      say: typeof r.say === "string" ? r.say : "",
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let body: CheckRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const { frame, expected, previous, instruction, watchFor } = body;
  if (!isImage(frame) || !isImage(expected) || (previous !== undefined && !isImage(previous))) {
    return Response.json({ error: "Send `frame` and `expected` (and optionally `previous`) as image data URLs." }, { status: 400 });
  }

  const parts: Part[] = [];
  if (previous) parts.push({ type: "text", text: "PREVIOUS:" }, { type: "image", dataUrl: previous });
  parts.push(
    { type: "text", text: "EXPECTED:" },
    { type: "image", dataUrl: expected },
    { type: "text", text: "CAMERA:" },
    { type: "image", dataUrl: frame },
  );
  const notes = [
    instruction && `This step: ${instruction}`,
    watchFor?.length && `Common mistakes here: ${watchFor.join("; ")}`,
  ].filter(Boolean);
  parts.push({ type: "text", text: notes.length ? notes.join("\n") : "Check this step." });

  const started = Date.now();
  try {
    const text = await askClaude({ system: SYSTEM_PROMPT, parts });
    const result = parseResult(text);
    if (!result) return Response.json({ error: "Model reply wasn't valid JSON.", raw: text.slice(0, 500) }, { status: 502 });
    return Response.json({ ...result, latencyMs: Date.now() - started });
  } catch (e) {
    const err = e instanceof ClaudeError ? e : new ClaudeError("Check failed.");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
