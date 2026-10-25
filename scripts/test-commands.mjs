// Checks the spoken-command matcher (src/lib/commands.ts). Run: npm run test:commands
import { matchCommand } from "../src/lib/commands.ts";

const cases = [
  // next / back
  ["Next.", { kind: "next" }],
  ["Okay, next step please.", { kind: "next" }],
  ["Continue", { kind: "next" }],
  ["move on", { kind: "next" }],
  ["Go back.", { kind: "back" }],
  ["previous step", { kind: "back" }],
  // repeat / check / stop
  ["Say that again?", { kind: "repeat" }],
  ["What do I do?", { kind: "repeat" }],
  ["Is this right?", { kind: "check" }],
  ["Did I do it right?", { kind: "check" }],
  ["I'm done.", { kind: "check" }],
  ["finished", { kind: "check" }],
  ["Stop talking.", { kind: "stop" }],
  // where am I (camera)
  ["Where am I?", { kind: "locate" }],
  ["Okay, what step am I on?", { kind: "locate" }],
  ["Find my place please.", { kind: "locate" }],
  ["Where does this piece go?", null],
  ["Show me where.", { kind: "show-where" }],
  ["Where does it go?", { kind: "show-where" }],
  ["Where does this go?", { kind: "show-where" }],
  ["Show me", { kind: "show-where" }],
  ["Replay", { kind: "replay-guide" }],
  ["Show it again", { kind: "replay-guide" }],
  ["Hide guide", { kind: "hide-guide" }],
  ["Hide the guide", { kind: "hide-guide" }],
  ["Turn off AR", { kind: "hide-guide" }],
  ["Show guide", { kind: "show-guide" }],
  ["Turn on AR", { kind: "show-guide" }],
  ["Rescan", { kind: "rescan-guide" }],
  ["Find it again", { kind: "rescan-guide" }],
  ["Align", { kind: "align-guide" }],
  ["Realign the guide", { kind: "align-guide" }],
  ["Rotate it", { kind: "rotate-guide" }],
  ["Turn it", { kind: "rotate-guide" }],
  ["Where does the red brick go in step 8?", null],
  ["Is it facing the right way?", null],
  ["What step is the red brick in?", null],
  // go to a step: digits and words
  ["Go to step 8.", { kind: "goto", step: 8 }],
  ["Step eight.", { kind: "goto", step: 8 }],
  ["skip to step twenty-one", { kind: "goto", step: 21 }],
  ["Jump to step forty two.", { kind: "goto", step: 42 }],
  ["I'm on step 8.", { kind: "goto", step: 8 }],
  ["Um, go to step number 12, please.", { kind: "goto", step: 12 }],
  // finished a step → the one after
  ["I finished step 7.", { kind: "goto", step: 8 }],
  ["I'm done with step seven.", { kind: "goto", step: 8 }],
  ["Completed steps 1 through 7.", { kind: "goto", step: 8 }],
  ["I've finished steps one to ninety-eight.", { kind: "goto", step: 99 }],
  // questions and other speech: not commands, these go to Claude
  ["What color is the piece in step 8?", null],
  ["Next to the red brick?", null],
  ["What's the next step?", null],
  ["Should I go back and fix the wing?", null],
  ["How do I check if it's on tight?", null],
  ["Step 8 is confusing, can you help?", null],
  ["I'm done with the red bricks, what now?", null],
  ["Go to step banana", null],
  ["", null],
];

let failed = 0;
for (const [text, want] of cases) {
  const got = matchCommand(text);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(text).padEnd(48)} → ${JSON.stringify(got)}${ok ? "" : `  (expected ${JSON.stringify(want)})`}`);
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
