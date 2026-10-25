import assert from "node:assert/strict";
import { placementPhrase } from "../src/lib/placementPhrase.ts";

const sample = { ref: "base", dx: 2, dy: 1, rotation: 0, layer: 1, footprint: { w: 4, h: 2 }, source: "agent-estimated" };
assert.equal(placementPhrase(sample), "2 studs right and 1 stud inward from the first plate's left reference stud. 4 by 2 studs. Long side across.");
assert.equal(placementPhrase({ ...sample, rotation: 90 }), "2 studs right and 1 stud inward from the first plate's left reference stud. 2 by 4 studs. Long side inward.");
assert.equal(placementPhrase({ ...sample, dx: 0, dy: 0, footprint: { w: 2, h: 2 } }), "At the first plate's left reference stud. 2 by 2 studs.");
assert.equal(placementPhrase({ ...sample, dx: -1, dy: -2 }), "1 stud left and 2 studs outward from the first plate's left reference stud. 4 by 2 studs. Long side across.");
console.log("Placement phrase tests passed");
