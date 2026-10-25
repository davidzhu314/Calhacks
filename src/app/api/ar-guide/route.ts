import { askClaude, ClaudeError, type Part } from "@/lib/claude";
import { firstJsonObject } from "@/lib/json";
import { parseGuide } from "@/lib/arGuide";
import { LOOKALIKE_RULE, partsPrompt, readPartLines } from "@/lib/parts";

const MAX_IMAGE_CHARS = 4_000_000;
const image = (v: unknown): v is string => typeof v === "string" && /^data:image\/(jpeg|png|webp|gif);base64,/i.test(v) && v.length <= MAX_IMAGE_CHARS;
const short = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const SYSTEM = `Provide a camera-aligned 2D visual guide for one assembly step. Images are PREVIOUS manual state (optional), CURRENT manual step, then CAMERA photo. All coordinates in the response are 0..1 of the CAMERA photo, never the manual drawing. A single image cannot establish depth or full 3D pose. Do not invent placement when the assembly is not clearly visible. Distinguish a loose part from a part already attached. If uncertain, omit spatial fields. Return JSON only:
{"visible":boolean,"status":"present"|"absent"|"occluded"|"future-placement"|"ambiguous","confidence":number,"explanation":"short next action","assemblyBox":{"left":number,"top":number,"right":number,"bottom":number}|null,"partBox":same|null,"placement":{"x":number,"y":number}|null,"orientationDegrees":number|null}.
visible means the assembly is clearly visible in CAMERA. assemblyBox encloses the assembly in CAMERA. partBox encloses the required part only when actually visible in CAMERA. placement is the center of where the required part should attach on the visible assembly, only when visually justified. Omit a coordinate rather than guess. orientationDegrees is an in-image 2D cue only, not 3D pose.`;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const { frame, expected, previous, instruction, part, manualHint } = body;
  if (!image(frame) || !image(expected) || (previous !== undefined && !image(previous)) || !short(instruction, 1000) || !short(part, 160) || !part.trim()) {
    return Response.json({ error: "Send a camera frame, manual step image, and a short part description." }, { status: 400 });
  }
  // Explicit local preview mode: fixed coordinates demonstrate the UI, never claim camera alignment.
  if (process.env.AR_GUIDE_DEMO === "1") {
    return Response.json({ ...parseGuide({ visible: true, status: "future-placement", confidence: .96, demo: true,
      explanation: "Simulated placement preview — use a Claude key for real camera alignment.",
      assemblyBox: { left: .28, top: .27, right: .72, bottom: .74 },
      partBox: { left: .38, top: .36, right: .49, bottom: .48 },
      placement: { x: .56, y: .58 }, orientationDegrees: 0 }), latencyMs: 0 });
  }
  const parts: Part[] = [];
  if (previous) parts.push({ type: "text", text: "PREVIOUS manual state:" }, { type: "image", dataUrl: previous });
  parts.push({ type: "text", text: "CURRENT manual step:" }, { type: "image", dataUrl: expected }, { type: "text", text: "CAMERA photo:" }, { type: "image", dataUrl: frame });
  const hint = manualHint && typeof manualHint === "object" ? JSON.stringify(manualHint).slice(0, 500) : "";
  const stepParts = readPartLines(body.parts);
  parts.push({ type: "text", text: `Instruction: ${instruction}\nRequired part: ${part}${stepParts.length ? `\nAll parts in this step:\n${partsPrompt(stepParts)}\n${LOOKALIKE_RULE} Box only the required part; if unsure which piece it is, omit the part box and placement.` : ""}${hint ? `\nHint: ${hint} is a position in the MANUAL drawing, NOT the camera.` : ""}` });
  const started = Date.now();
  try {
    const reply = await askClaude({ system: SYSTEM, parts });
    const guide = parseGuide(firstJsonObject(reply));
    if (!guide) return Response.json({ error: "Model reply was not a valid guide." }, { status: 502 });
    return Response.json({ ...guide, latencyMs: Date.now() - started });
  } catch (e) {
    const err = e instanceof ClaudeError ? e : new ClaudeError("AR guide could not locate the assembly.");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
