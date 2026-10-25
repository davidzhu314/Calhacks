# BuildSight

Hands-free build copilot (Cal Hacks 13.0). Show it any picture-based instructions; it watches you build through the camera, tells you what's next, and catches mistakes.

All decisions so far: [DECISIONS.md](DECISIONS.md). A full README comes before submission.

## Run it

```bash
npm install
cp .env.example .env.local   # then paste your OpenRouter key into .env.local
npm run dev                  # http://localhost:3000
```

The camera needs HTTPS on phones; use the Vercel deployment link there. `localhost` works on a laptop.

## Use it

Find a LEGO set in the catalog or by its 4–7 digit set number, search IKEA by product name, or upload any picture-based PDF manual. The home screen also resumes the latest build saved on this device. Pick an instruction book when a product has several.

The build screen keeps the camera behind the active instruction. Tap a part to locate it in the manual, open the picture to zoom, use **Check build** to compare the camera with the step, and use **Browse steps** to inspect or switch steps. Voice questions and simple commands are available from the microphone control.

The interface tokens and component rules are in [UI_DESIGN.md](UI_DESIGN.md). The multi-book picker uses Radix Dialog; the rest of the interface uses Tailwind and the existing Motion animations.

## Step Browser

On the build screen, choose **Browse steps** to inspect manual pictures, instructions, and parts without moving your active build step. Use **Switch to this step** when you want guidance and camera checks to move there. Uploaded manuals read the page you select; this may take a moment. BuildSight remembers the exact active step when you return.

Run the offline test suite with `npm test`.
Use `npm run lint`, `npx tsc --noEmit`, and `npm run build` for the remaining local checks.
