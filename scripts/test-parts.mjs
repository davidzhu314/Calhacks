// Checks how parts are described to the model (src/lib/parts.ts). Run: npm run test:parts
import { describePart, partLines, partsPrompt, readPartLines } from "../src/lib/parts.ts";

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};

// The manual reading's own description wins.
eq("own description", describePart({ name: "green plate", visual_description: "2x4 lime green plate" }), "2x4 lime green plate");
// Older readings (no description): built from name, size and shape, without repeating what the name says.
eq("adds size and shape", describePart({ name: "lime green", studsX: 2, studsY: 4, shape: "plate" }), "lime green (2x4 plate)");
eq("no repeat of size", describePart({ name: "red 2x4 brick", studsX: 2, studsY: 4, shape: "brick" }), "red 2x4 brick");
eq("reversed size counts", describePart({ name: "red 4x2 brick", studsX: 2, studsY: 4, shape: "brick" }), "red 4x2 brick");
eq("skips 'other'", describePart({ name: "brown trunk piece", shape: "other" }), "brown trunk piece");
eq("blank description falls back", describePart({ name: "tan round plate", visual_description: "  ", shape: "round" }), "tan round plate");
eq("trims long text", describePart({ name: "x".repeat(200) }).length, 80);

// Request bodies: quantities are whole numbers >= 1; malformed entries are dropped.
eq("partLines", partLines([{ name: "red 1x2 slope", qty: 2 }, { name: "bolt", qty: 0 }]), [
  { description: "red 1x2 slope", qty: 2 },
  { description: "bolt", qty: 1 },
]);
eq("readPartLines drops junk", readPartLines([{ description: "2x4 lime green plate", qty: "3" }, { qty: 2 }, null, "x", { description: "" }]), [
  { description: "2x4 lime green plate", qty: 3 },
]);
eq("readPartLines non-array", readPartLines({ description: "x" }), []);
eq("readPartLines caps count", readPartLines(Array.from({ length: 50 }, () => ({ description: "a" }))).length, 24);
eq("prompt text", partsPrompt([{ description: "2x4 lime green plate", qty: 1 }, { description: "1x2 dark red slope", qty: 2 }]), "- 1x 2x4 lime green plate\n- 2x 1x2 dark red slope");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
