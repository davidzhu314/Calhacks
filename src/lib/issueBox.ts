// Where a step-check mistake is in the camera photo. The model answers in whole-number percentages
// (left/top/right/bottom, 0-100) of the CAMERA image; this turns that into a normalized {x, y, w, h}
// box (0-1), or undefined when the box is missing or can't be trusted. Used by /api/check.
// Run the tests with: npm run test:boxes

export type IssueBox = { x: number; y: number; w: number; h: number };

export const ISSUE_KINDS = ["wrong_part", "orientation", "misalignment", "missing_part", "incorrect_placement", "other"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

const MIN_SIDE = 2; // percent: smaller than this is a guess, not a piece
const MAX_AREA = 0.8; // share of the photo: bigger than this points at nothing in particular

export function parseIssueBox(raw: unknown): IssueBox | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { left, top, right, bottom } = raw as Record<string, unknown>;
  const n = [left, top, right, bottom];
  if (!n.every((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100)) return undefined;
  const [l, t, r, b] = n as number[];
  if (r - l < MIN_SIDE || b - t < MIN_SIDE) return undefined; // also catches right <= left, bottom <= top
  if (((r - l) / 100) * ((b - t) / 100) > MAX_AREA) return undefined;
  return { x: l / 100, y: t / 100, w: (r - l) / 100, h: (b - t) / 100 };
}

export function parseIssueKind(raw: unknown): IssueKind | undefined {
  return ISSUE_KINDS.find((k) => k === raw);
}

// ── Pointing out mistakes (spoken location, category, markers) ─────────────
// Pure helpers for runCheck's spoken sentence, CheckErrorOverlay and the problem list.

export type CheckIssue = { part: string; problem: string; fix: string; kind?: IssueKind; box?: IssueBox };
export type IssueCategory = "wrong" | "missing" | "misplaced";

/** Where a box is in the photo, on a 3x3 grid by its center. A center exactly on a third goes to the next cell. */
export function boxLocation(box: IssueBox): string {
  const cell = (v: number) => Math.min(2, Math.max(0, Math.floor(v * 3)));
  const row = ["top", "", "bottom"][cell(box.y + box.h / 2)];
  const col = ["left", "", "right"][cell(box.x + box.w / 2)];
  return [row, col].filter(Boolean).join(" ") || "center";
}

export function issueCategory(kind?: string): IssueCategory {
  if (kind === "missing_part") return "missing";
  if (kind === "orientation" || kind === "misalignment" || kind === "incorrect_placement") return "misplaced";
  return "wrong";
}

export const CATEGORY_TAG: Record<IssueCategory, string> = { wrong: "Wrong piece", missing: "Missing", misplaced: "Misplaced" };

/** Boxes to draw: only issues that have one, numbered by their place in the full list. */
export function issueMarkers(issues: CheckIssue[]): { n: number; category: IssueCategory; box: IssueBox }[] {
  return issues.flatMap((issue, i) => (issue.box ? [{ n: i + 1, category: issueCategory(issue.kind), box: issue.box }] : []));
}

const tidy = (s: string | undefined) => (s ?? "").trim().replace(/[.!\s]+$/, "");
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// "rotated 90 degrees" takes an "is"; "is upside down" or "faces the wrong way" already has its verb
const HAS_VERB = /^(is|are|was|were|has|have|had|looks?|needs?|sits?|faces?|points?|goes|should|isn't|aren't|doesn't|don't)\b/i;

const isSentence = (problem: string) => !HAS_VERB.test(problem) && /\b(is|are|was|has)\b/.test(problem);

/** One short spoken sentence for an issue, like "The red 2x4 near the top left is rotated 90 degrees." */
export function issueSentence(issue: CheckIssue): string {
  const part = tidy(issue.part).replace(/^the\s+/i, "");
  const problem = tidy(issue.problem);
  const near = issue.box ? ` near the ${boxLocation(issue.box)}` : "";
  const subject = part ? `The ${part}${near}` : `Something${near}`;
  if (!problem) return part ? `Check the ${part}${near}.` : near ? `Check the piece${near}.` : "Something isn't right here.";
  // a whole sentence of its own ("Plate is attached backward"): keep it, just add where
  if (isSentence(problem)) return `${near ? `${upperFirst(near.trim())}: ` : ""}${upperFirst(problem)}.`;
  return `${subject} ${HAS_VERB.test(problem) ? "" : "is "}${lowerFirst(problem)}.`;
}

const NUMBER_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** What runCheck says aloud about the mistakes: the first one, plus how many more are on screen. */
export function spokenIssues(issues: CheckIssue[]): string {
  if (!issues.length) return "";
  const more = issues.length - 1;
  return more ? `${issueSentence(issues[0])} ${NUMBER_WORDS[more] ?? more} more on screen.` : issueSentence(issues[0]);
}

/** Screen reader text for one problem in the list. */
export function issueLabel(issue: CheckIssue, n: number): string {
  const where = issue.box ? `, near the ${boxLocation(issue.box)}` : "";
  const part = tidy(issue.part);
  const problem = tidy(issue.problem);
  const what = !problem
    ? part
    : isSentence(problem)
      ? lowerFirst(problem)
      : `${part || "something"} ${HAS_VERB.test(problem) ? "" : "is "}${lowerFirst(problem)}`;
  const fix = tidy(issue.fix);
  return `Problem ${n}, ${CATEGORY_TAG[issueCategory(issue.kind)].toLowerCase()}${where}: ${what || "something isn't right"}.${fix ? ` ${fix}.` : ""}`;
}

/** Accessible name for the checked photo. */
export function photoLabel(issues: CheckIssue[]): string {
  const n = issueMarkers(issues).length;
  return n ? `Your build, ${n} problem${n === 1 ? "" : "s"} marked` : "Your build, no problems could be marked";
}

/** What a step check result means for the screen (and what to say). Mistakes need a clear, fairly sure look. */
export type CheckVerdict = "pass" | "fix" | "notyet" | "unsure";
export function checkVerdict(r: { can_see: boolean; confidence: number; step_complete: boolean; issues: unknown[] }): CheckVerdict {
  if (!r.can_see || r.confidence < 0.5) return "unsure";
  if (r.issues.length > 0) return "fix";
  return r.step_complete ? "pass" : "notyet";
}

/** A check result only counts on the step it ran on: anything tagged with another step shows nothing. */
export function forStep<T extends { key: string }>(state: T | null, stepKey: string): T | null {
  return state?.key === stepKey ? state : null;
}
