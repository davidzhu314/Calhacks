// Checks the step-check mistake box parser (src/lib/issueBox.ts). Run: npm run test:boxes
import {
  boxLocation,
  checkVerdict,
  forStep,
  issueCategory,
  issueLabel,
  issueMarkers,
  issueSentence,
  parseIssueBox,
  parseIssueKind,
  photoLabel,
  spokenIssues,
} from "../src/lib/issueBox.ts";

const box = (left, top, right, bottom) => ({ left, top, right, bottom });
const cases = [
  ["valid box", box(25, 30, 45, 50), { x: 0.25, y: 0.3, w: 0.2, h: 0.2 }],
  ["edges are allowed", box(0, 0, 10, 100), { x: 0, y: 0, w: 0.1, h: 1 }],
  ["missing box", undefined, undefined],
  ["null box", null, undefined],
  ["not an object", "25,30,45,50", undefined],
  ["missing a side", { left: 10, top: 10, right: 20 }, undefined],
  ["string numbers", box("10", 10, 20, 20), undefined],
  ["NaN", box(NaN, 10, 20, 20), undefined],
  ["Infinity", box(10, 10, Infinity, 20), undefined],
  ["negative", box(-5, 10, 20, 20), undefined],
  ["over 100", box(10, 10, 120, 20), undefined],
  ["right before left", box(40, 10, 20, 30), undefined],
  ["bottom above top", box(10, 40, 30, 20), undefined],
  ["zero width", box(20, 10, 20, 30), undefined],
  ["under 2% tall", box(10, 10, 30, 11), undefined],
  ["over 80% of the photo", box(0, 0, 95, 95), undefined],
  ["just under 80%", box(0, 0, 80, 100), { x: 0, y: 0, w: 0.8, h: 1 }],
];

let failed = 0;
const near = (a, b) => (a === undefined || b === undefined ? a === b : ["x", "y", "w", "h"].every((k) => Math.abs(a[k] - b[k]) < 1e-9));
for (const [name, input, want] of cases) {
  const got = parseIssueBox(input);
  if (!near(got, want)) {
    failed++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}
for (const [input, want] of [["orientation", "orientation"], ["missing_part", "missing_part"], ["rotated", undefined], [undefined, undefined]]) {
  if (parseIssueKind(input) !== want) {
    failed++;
    console.log(`FAIL kind ${input}: got ${parseIssueKind(input)}`);
  }
}

// ── Pointing out mistakes ──
let extra = 0;
const check = (name, ok, got) => {
  extra++;
  if (!ok) {
    failed++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}`);
  }
};
const at = (cx, cy, w = 0.1, h = 0.1) => ({ x: cx - w / 2, y: cy - h / 2, w, h });
const issue = (kind, box, part = "red 2x4", problem = "rotated") => ({ part, problem, fix: "Turn it.", kind, box });

// 1. one wrong piece with a box
let m = issueMarkers([issue("wrong_part", at(0.2, 0.2))]);
check("1: one marker, wrong", m.length === 1 && m[0].n === 1 && m[0].category === "wrong", m);
// 2. three boxed issues
m = issueMarkers([issue("wrong_part", at(0.2, 0.2)), issue("orientation", at(0.5, 0.5)), issue("missing_part", at(0.8, 0.8))]);
check("2: numbered 1, 2, 3", m.map((x) => x.n).join() === "1,2,3", m);
// 3. issue 2 has no box
m = issueMarkers([issue("wrong_part", at(0.2, 0.2)), issue("orientation"), issue("missing_part", at(0.8, 0.8))]);
check("3: markers 1 and 3", m.map((x) => x.n).join() === "1,3" && m[1].category === "missing", m);
// 4. passing result
check("4: no issues, no markers", issueMarkers([]).length === 0 && spokenIssues([]) === "", issueMarkers([]));
// 5. categories
const kinds = { wrong_part: "wrong", missing_part: "missing", orientation: "misplaced", misalignment: "misplaced", incorrect_placement: "misplaced", other: "wrong", undefined: "wrong" };
for (const [k, want] of Object.entries(kinds)) check(`5: ${k}`, issueCategory(k === "undefined" ? undefined : k) === want, issueCategory(k));
// 6. locations: nine cells, thirds go to the next cell, edges
const grid = [
  [0.15, 0.15, "top left"], [0.5, 0.15, "top"], [0.85, 0.15, "top right"],
  [0.15, 0.5, "left"], [0.5, 0.5, "center"], [0.85, 0.5, "right"],
  [0.15, 0.85, "bottom left"], [0.5, 0.85, "bottom"], [0.85, 0.85, "bottom right"],
  [1 / 3, 1 / 3, "center"], [2 / 3, 2 / 3, "bottom right"], [0.3333, 0.6666, "left"],
];
for (const [cx, cy, want] of grid) check(`6: (${cx.toFixed(3)}, ${cy.toFixed(3)}) ${want}`, boxLocation(at(cx, cy)) === want, boxLocation(at(cx, cy)));
check("6: box at the top left edge", boxLocation({ x: 0, y: 0, w: 0.02, h: 0.02 }) === "top left", boxLocation({ x: 0, y: 0, w: 0.02, h: 0.02 }));
check("6: box at the bottom right edge", boxLocation({ x: 0.98, y: 0.98, w: 0.02, h: 0.02 }) === "bottom right", boxLocation({ x: 0.98, y: 0.98, w: 0.02, h: 0.02 }));
check("6: whole photo", boxLocation({ x: 0, y: 0, w: 1, h: 1 }) === "center", boxLocation({ x: 0, y: 0, w: 1, h: 1 }));
// 7. sentences
const s1 = issueSentence(issue("orientation", at(0.15, 0.15), "red 2x4", "turned the wrong way"));
check("7: with a box says where", s1 === "The red 2x4 near the top left is turned the wrong way.", s1);
const s2 = issueSentence(issue("orientation", undefined, "red 2x4", "turned the wrong way"));
check("7: without a box leaves it out", s2 === "The red 2x4 is turned the wrong way.", s2);
const s3 = issueSentence(issue("wrong_part", undefined, "", ""));
check("7: empty part and problem", s3 === "Something isn't right here.", s3);
const s4 = issueSentence(issue("wrong_part", at(0.85, 0.5), "", "upside down"));
check("7: empty part", s4 === "Something near the right is upside down.", s4);
const s5 = issueSentence(issue("missing_part", at(0.5, 0.85), "the yellow 1x1", ""));
check("7: empty problem", s5 === "Check the yellow 1x1 near the bottom.", s5);
const s6 = issueSentence(issue("orientation", undefined, "green brick", "is upside down."));
check("7: problem with its own verb", s6 === "The green brick is upside down.", s6);
const tail = spokenIssues([issue("orientation", at(0.15, 0.15)), issue("wrong_part"), issue("missing_part")]);
check("7: tail for more issues", tail === "The red 2x4 near the top left is rotated. Two more on screen.", tail);
// screen reader text and photo name
const l1 = issueLabel(issue("wrong_part", at(0.15, 0.15), "red 2x4", "turned the wrong way"), 1);
check("label: full sentence", l1 === "Problem 1, wrong piece, near the top left: red 2x4 is turned the wrong way. Turn it.", l1);
check("photo: 2 marked", photoLabel([issue("x", at(0.2, 0.2)), issue("x", at(0.8, 0.8))]) === "Your build, 2 problems marked");
check("photo: 1 marked", photoLabel([issue("x", at(0.2, 0.2)), issue("x")]) === "Your build, 1 problem marked");
check("photo: none marked", photoLabel([issue("x")]) === "Your build, no problems could be marked");
// verdict and step ownership
const r = (o) => ({ can_see: true, confidence: 0.8, step_complete: false, issues: [], ...o });
check("verdict: fix", checkVerdict(r({ issues: [1] })) === "fix");
check("verdict: low confidence with issues is unsure", checkVerdict(r({ issues: [1], confidence: 0.4 })) === "unsure");
check("verdict: can't see", checkVerdict(r({ can_see: false, step_complete: true })) === "unsure");
check("verdict: pass", checkVerdict(r({ step_complete: true })) === "pass");
check("verdict: not yet (incomplete, nothing seen wrong)", checkVerdict(r({})) === "notyet");
check("old step's result shows nothing", forStep({ key: "12-0", state: "result" }, "12-1") === null);
check("this step's result shows", forStep({ key: "12-1", state: "result" }, "12-1")?.key === "12-1");
check("no result", forStep(null, "12-1") === null);

const total = cases.length + 4 + extra;
console.log(`${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
