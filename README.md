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

The build screen keeps the camera behind the active instruction. Parts appear as numbered holograms with matching marks on the manual image. Open the picture to zoom, use **Check build** to compare the camera with the step, and use the step strip or **Browse steps** to switch steps. Voice questions and simple commands are available from the microphone control.

The interface tokens and component rules are in [UI_DESIGN.md](UI_DESIGN.md). The multi-book picker uses Radix Dialog; the rest of the interface uses Tailwind and the existing Motion animations.

## Step Browser

On the build screen, choose **Browse steps** to inspect manual pictures, instructions, and parts without moving your active build step. Use **Switch to this step** when you want guidance and camera checks to move there. Uploaded manuals read the page you select; this may take a moment. BuildSight remembers the exact active step when you return.

Run the offline test suite with `npm test`.
Use `npm run lint`, `npx tsc --noEmit`, and `npm run build` for the remaining local checks.

## AR Guide (local experiment)

On the build screen, AR starts off. Use the header's **AR off / AR on** toggle to show or hide guidance at any time. The cyan outline is a **2D camera guide**, not measured 3D registration. Use **Adjust placement** and tap the camera if the suggestion is off; **Rescan** asks for a fresh view. Amber means alignment is uncertain or has been lost. The guide never advances a step; **Check build** remains the verification action. Camera access needs HTTPS or localhost, and live grounding needs the existing Claude key.

`npm run test:ar` checks the geometry, response validation, anchor rules, and request gate. For a mocked mobile browser run with a fake camera, start the production app (`npm run build && npm run start -- -p 3101`) and run `node scripts/e2e-ar-guide.mjs`. Set `E2E_BASE_URL` for another port and `CHROME_PATH` if Chrome is not at the macOS default path. Playwright is a development dependency only.

To preview the AR overlay on a live camera **without** a Claude key, start the local server with `AR_GUIDE_DEMO=1 npm run start -- -p 3101`, open a saved build, and select **AR Guide → Rescan**. The fixed boxes are clearly labeled **2D demo** and do not represent detected camera alignment. Remove `AR_GUIDE_DEMO` and configure `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` in `.env.local` for live grounding.
