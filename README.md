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

## AR Guide

AR starts off on the build screen. Turn on **AR Guide** in the header, open the floating ✦ assistant, and choose **Align / Re-align**. On the live camera, tap the left end stud (A) and right end stud (B) along the straight edge of the first green plate. The translucent **2D guide** then marks the next piece's estimated stud footprint. Drag the orb to move its controls; open it again for Replay, Rescan, Adjust ghost, rotate, reset, or Hide. Adjustments affect only this step and never complete it. **Check build** remains the verification action.

The parrot demo has agent-estimated stud placements for its first 15 steps. Base-connected steps use the saved placement and alignment without a model call **for the spot**. When Claude is configured, one separate lookup can outline the loose source brick in cyan; the stud ghost remains available if that lookup fails or there is no key. Detached tower and flower steps, later steps, and other manuals use an amber, dashed, approximate camera guide backed by the existing Claude key. That fallback first locates the assembly, then zooms the camera crop for a finer hint. Low-texture scenes may prevent motion tracking; re-align after moving the build or camera. Camera access needs HTTPS or localhost.

The overlay pauses during a check and leaves mistake boxes to the existing check UI. Real-phone stud accuracy has not been verified; compare every footprint with the manual before relying on it. The guide has no depth or 3D pose estimate.

Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build`. For the mocked mobile browser flow, run `npm run start -- --port 3101` after building, then `node scripts/e2e-ar-guide.mjs`. Set `E2E_BASE_URL` for another port. Playwright uses a fake camera and mocked guide/check endpoints, so it does not verify physical placement.
