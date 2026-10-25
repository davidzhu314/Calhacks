# BuildSight

Hands-free build copilot (Cal Hacks 13.0). Show it any picture-based instructions; it watches you build through the camera, tells you what's next, and catches mistakes.

Implementation notes and known accuracy limits: [DECISIONS.md](DECISIONS.md).

## Run the AR branch on a laptop

Use Node.js 22.18 or newer and npm. The `.nvmrc` works with `nvm use` if you use nvm. macOS, Windows, and Linux can run the web app; use the commands below in a terminal (PowerShell on Windows).

```bash
git clone --branch ar-akhil https://github.com/davidzhu314/Calhacks.git
cd Calhacks
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), allow camera access, and choose **Exotic Parrot → Book 1** from the featured card. Turn on **AR Guide** in the build header, open the floating ✦ assistant, and choose **Align / Re-align**. Tap the marked A and B studs on the first green plate in the live camera view. The first plate's stored 2D ghost appears without an API key. These first-15 placements are estimates and need checking against real bricks.

The included parrot manual and step images are in `public/steps`, so this path needs no PDF download or prior browser data. Each tester gets their own saved progress in their browser. If port 3000 is busy, run `npm run dev -- --port 3101` and open `http://localhost:3101`.

**Optional AI features:** Copy `.env.example` to `.env.local` and set either `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`, then restart the server. With a key, Claude can locate the loose source brick on fallback steps, estimate a dashed amber spot for steps without a usable stored placement, and run **Check build**. Without a key, the stored base-connected ghosts still work; source-piece boxes, AI fallback spots, checks, and voice AI do not. Do not commit `.env.local` or distribute a shared key.

For an API-free visual preview of the approximate overlay, set `AR_GUIDE_DEMO=1` in `.env.local` and restart. Its fixed boxes are simulated and do **not** represent a detected brick or accurate camera placement. Remove that setting for real camera grounding.

`localhost` is a secure context for camera access on the same laptop. Opening the laptop's LAN address from a phone generally needs HTTPS; use a trusted HTTPS tunnel or deployment to test on a phone. A laptop can also test the 390×844 layout through browser device emulation, but that does not validate real-phone alignment or touch behavior.

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

The parrot demo has agent-estimated stud placements for its first 15 steps. Base-connected steps use the saved placement and alignment without an AR model call. They show the stored ghost without a camera-detected source-piece box. Detached tower and flower steps, later steps, and other manuals use an amber, dashed, approximate camera guide backed by the existing Claude key. That fallback first locates the assembly and loose source piece, then zooms the camera crop for a finer hint. Low-texture scenes may prevent motion tracking; re-align after moving the build or camera. Camera access needs HTTPS or localhost.

The overlay pauses during a check and leaves mistake boxes to the existing check UI. Real-phone stud accuracy has not been verified; compare every footprint with the manual before relying on it. The guide has no depth or 3D pose estimate.

With the microphone on, say **“show me where”**, **“replay”**, **“hide guide”**, **“show guide”**, **“rescan”**, **“align”**, or **“rotate it”**. “Next,” “back,” and “go to step 8” move both the active manual step and its AR guide. Stored base placements need no AR model request; detached pieces and steps without a usable stored placement use the approximate camera guide. Voice answers about a placement receive the current stud and alignment context.

Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build`. For automated 390×844 browser checks, install Playwright's Chromium once with `npx playwright install chromium` (on Linux, `npx playwright install --with-deps chromium` may be needed). Start `npm run start -- --port 3101` in one terminal. In another, run `npm run test:e2e:local` for the fresh-browser featured-manual flow, `npm run test:e2e:ar` for placement, dragging, and Check build, and `npm run test:e2e:voice` for voice command and step sync. Set `E2E_BASE_URL` if you use another port. The AR tests use a fake camera and mocked guide/check endpoints, so they need no API key and do not verify physical placement. If you already have a local Chrome executable, `CHROME_PATH` may point to it instead of installing Playwright Chromium.
