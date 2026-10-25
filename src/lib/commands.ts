// Spoken build commands ("next", "go to step 8", "I finished step 7") matched in code, so they act instantly
// without asking Claude. Only whole phrases match: "what color is the piece in step 8?" is a question, not a command.

export type Command =
  | { kind: "next" | "back" | "repeat" | "check" | "stop" | "locate" | "show-where" | "show-guide" | "hide-guide" | "replay-guide" | "rescan-guide" | "align-guide" | "rotate-guide" }
  | { kind: "goto"; step: number };

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "8", "eight", "twenty one", "forty-two" (hyphens already turned into spaces) → number; anything else → null. */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (/^\d{1,4}$/.test(t)) return Number(t);
  const words = t.split(/\s+/);
  if (words.length === 1) return ONES[words[0]] ?? TENS[words[0]] ?? null;
  if (words.length === 2 && words[0] in TENS && words[1] in ONES && ONES[words[1]] >= 1 && ONES[words[1]] <= 9) return TENS[words[0]] + ONES[words[1]];
  return null;
}

// Words people wrap around a command: "ok next please", "um, go back".
const LEADING = /^(?:(?:ok|okay|alright|all right|um+|uh+|so|hey|yeah|yes|and|then|now|please|buildsight|build sight)\s+)+/;
const TRAILING = /(?:\s+(?:please|thanks|thank you|now|then|ok|okay))+$/;

/** Lowercase, hyphens to spaces, no punctuation, apostrophes dropped ("I'm" → "im"), fillers trimmed. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING, "")
    .replace(TRAILING, "")
    .trim();
}

const FIXED: [Command["kind"], RegExp][] = [
  ["show-where", /^(?:show me where|where does it go|where does this go|show me)$/],
  ["show-guide", /^(?:show guide|turn on ar)$/],
  ["hide-guide", /^(?:hide guide|hide the guide|turn off ar)$/],
  ["replay-guide", /^(?:replay|show it again)$/],
  ["rescan-guide", /^(?:rescan|find it again)$/],
  ["align-guide", /^(?:align|realign the guide)$/],
  ["rotate-guide", /^(?:rotate it|turn it)$/],
  ["next", /^(?:next|next step|next one|continue|go on|move on|keep going|go to the next step|go to next step|go next)$/],
  ["back", /^(?:back|go back|step back|previous|previous step|last step|go to the previous step|go to previous step)$/],
  ["repeat", /^(?:repeat|repeat that|repeat the step|repeat step|again|say that again|say it again|come again|what do i do|what do i do now|what do i do next|what now)$/],
  [
    "check",
    /^(?:check|check it|check this|check that|check my build|check my work|is this right|is that right|is it right|did i do it right|did i do this right|did i do that right|done|im done|i am done|all done|finished|im finished|i am finished|i finished)$/,
  ],
  ["stop", /^(?:stop|quiet|be quiet|stop talking|shh+|hush|silence)$/],
  // "where am I?": find the step from the camera (src/lib/whereAmI.ts)
  ["locate", /^(?:where am i|where was i|where are we|what step am i on|which step am i on|what step is this|which step is this|find my place|find where i am|figure out where i am|where am i at)$/],
];

const NUM = "([a-z0-9 ]+?)";
const GOTO = [
  new RegExp(`^(?:(?:go|skip|jump|move|take me|bring me) to )?step (?:number )?${NUM}$`),
  new RegExp(`^(?:im|i am) (?:on|at) step (?:number )?${NUM}$`),
];
// "I finished step 7", "I'm done with step 7", "completed steps 1 through 7" → step 8 (the highest number + 1).
const FINISHED = new RegExp(
  `^(?:i |ive |i have )?(?:just )?(?:finished|completed|did|done|im done with|i am done with|am done with|done with) steps? ${NUM}(?: (?:through|thru|to|and|until) ${NUM})?$`,
);

/** The command a whole spoken phrase asks for, or null if it's something else (send it to Claude). */
export function matchCommand(text: string): Command | null {
  const t = normalize(text);
  if (!t) return null;
  for (const [kind, re] of FIXED) if (re.test(t)) return { kind } as Command;
  for (const re of GOTO) {
    const m = t.match(re);
    const n = m && parseNumber(m[1]);
    if (n != null && n >= 1) return { kind: "goto", step: n };
  }
  const m = t.match(FINISHED);
  if (m) {
    const nums = [m[1], m[2]].filter(Boolean).map((s) => parseNumber(s!));
    if (nums.length && nums.every((n) => n != null && n >= 1)) return { kind: "goto", step: Math.max(...(nums as number[])) + 1 };
  }
  return null;
}
