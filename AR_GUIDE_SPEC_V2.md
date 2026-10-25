# Autonomous Task: BuildSight AR Guide v2 (build-frame placements + registration + draggable assistant)

## Instructions
Continue working until all todos are complete.
Do not stop to ask questions.
Do not wait for confirmation at checkpoints.
Make reasonable assumptions and proceed. Log each assumption in Notes.
If a fix does not work, try a different approach.
Run validation after every meaningful change.
Update progress in this file as you go (tick boxes, write to Notes).
Before writing Next.js code, read the relevant guides in `node_modules/next/dist/docs/` (AGENTS.md: this Next.js, 16.4.3, differs from older versions).
Work on a branch `ar-guide`. Commit after each milestone. Never touch `main`.
Do not stop after writing architecture notes. Working code and passing checks are the deliverable.

## Task Description
Add an **AR Guide** to the BuildSight build screen (`src/components/BuildView.tsx`): guidance drawn over the live camera video for a phone on a stand above the work area, showing **where the next brick goes** with a translucent ghost piece and short animations, plus a **draggable on-screen AR assistant** the user can move anywhere.

### The core idea (this replaces "ask Claude for a pixel box every step")
Split the problem in two:
1. **Placement in the BUILD frame** (what and where, deterministic, from data): `{ ref, dx, dy, rotation, layer, footprint }` in **studs**, relative to the build's origin (the first plate). Comes from a per-manual placements file, not from the camera.
2. **Registration** (where the build is in the camera): a similarity transform (translation + rotation + uniform scale = stud pitch in pixels) from build coordinates to CAMERA-frame pixels. Computed once per build from **two user taps** on marked studs, then kept aligned by cheap **patch tracking**. Per-step guidance then needs NO model call: project the step's stud placement through the registration and draw the ghost, snapped to the stud lattice.

Claude is used only as a fallback/assist: (a) to find the assembly and the source part in the camera ("coarse-to-fine": locate the assembly, crop and zoom it, ground again with a percent grid), and (b) for steps with no stored placement, an **approximate** camera-space placement drawn dashed amber with a "tap to position" prompt.

Everything is 2D and honest: a single photo gives no metric depth or pose. Label the ghost a "2D guide". Never claim 3D registration. The existing `/api/check` verification remains the ground truth for "done correctly".

### Milestones
- **Part A (required):** 1) build-frame placements + two-tap registration + snapped ghost, 2) correct camera/`object-cover` coordinate transforms, 3) animations (pick-to-place flight path, press-in, rotation), 4) draggable AR assistant + drag-to-adjust ghost, 5) patch tracking, lost-target recovery, AI fallbacks
- **Part B (optional stretch, only after every Part A validation item passes):** pseudo-3D ghost rendered with the existing three.js `Hologram` geometry in a transparent top-down orthographic canvas; four-corner homography work-mat calibration (plane only)
- **Do not build:** marker/OpenCV.js pose or full 3D projection. Document in DECISIONS.md as future work (ArUco markers + `solvePnP` would give a real pose; iOS Safari has no WebXR).

Reference repos (inspiration only; write original TypeScript; check each license before reusing any code; if GitHub is unreachable log that in Notes):
- Bluebook (`github.com/rishabhroyy/bluebook`): normalized boxes, agreement between detections, stable target identity, re-detection after loss, smoothing, dropping stale markers, user-correctable anchors.
- AR-Vision (`github.com/catplotlib/AR-Vision`): image-to-plane correspondences, calibration, homography, projection.

## Context
- Relevant files (verified to exist in the repo as shipped):
  - `src/components/BuildView.tsx`: step state, `pageReader`, `crop`, `go`, `runCheck`, `selectPart` + `located` cache (`/api/locate` = MANUAL-image coords), `IssueBoxOverlay`/`IssueTag` (amber numbered error boxes on the frozen checked photo), voice `handleVoice` + `goToStep`, `advanceTimer`, `pendingStep`, `seekId`, `useIsPhone`, phone swipe sheet (`motion.section` with `drag`), `compact`, z-index layout
  - `src/components/CameraFeed.tsx`: `<video className="h-full w-full object-cover">`; `capture()` returns a JPEG data URL resized to max side 1024 (same aspect as the video). Needs geometry exposed (see pitfalls)
  - `src/components/Hologram.tsx`: three.js part preview from `ExtractedStep.parts[]` (`shape`, `studsX`, `studsY`, `color`)
  - `src/app/api/locate/route.ts` (`Box`, `LocateResult`, MANUAL coords), `src/app/api/check/route.ts`, `src/lib/issues.ts` (`IssueBox`, `parseBox`, `parseIssues`, `describeIssue`), `src/app/api/extract/route.ts` (`ExtractedStep`), `src/lib/prebuilt.ts` (`Prebuilt`, `loadPrebuilt`), `src/lib/claude.ts` (`askClaude`, `Part`), `src/lib/json.ts`, `src/lib/commands.ts` (pure, no imports), `scripts/commands.test.mjs` (the test style to copy), `scripts/preread.py`, `public/steps/6455750.json` + `public/steps/6455750/<page>.jpg` (manual page pictures), `DECISIONS.md`, `AGENTS.md`
- Files named in the original brief that DO NOT exist: `ManualPanel.tsx`, `PieceHologram.tsx`, `CheckErrorOverlay.tsx`, `src/lib/issueBox.ts`. Map to the equivalents above; if the working tree has diverged and they exist, prefer them and log it.
- There is no automatic step-position detection in this repo. Do not build one.
- Dependencies: no new runtime dependencies in Part A. No OpenCV.js. Playwright for e2e (add as devDependency if `require("playwright")` doesn't resolve).
- Constraints: no continuous Claude calls; at most one in-flight `/api/ar-guide` request; do not touch existing `public/steps/*.jpg` or `6455750.json`; no unrelated refactors; keep dark HUD styling and `sm` breakpoint behavior; mobile Safari safe.

## Design (follow unless you find a concrete reason not to; log it)
1. **Spaces.** MANUAL image (0-1), CAMERA frame (pixels of the captured JPEG; 0-1 = 0-1 of the video's intrinsic frame), SCREEN (CSS px), BUILD (studs; +x along the first plate's long axis, +y perpendicular, origin = its corner stud (0,0)). Never treat manual coords as camera coords.
2. **`src/lib/arGeometry.ts`** (pure, no imports): `coverMap(videoW, videoH, boxW, boxH)` (`object-cover` scale = max(boxW/videoW, boxH/videoH) with centered offsets), `frameToScreen`, `screenToFrame` (round-trip), visibility (cropped-out points), recompute on resize/rotation. Also `clampToBox(pos, size, box, insets)` used by the draggable assistant.
3. **`src/lib/buildFrame.ts`** (pure): types `Placement = { ref: "origin" | string; dx: number; dy: number; rotation: 0|90|180|270; layer: number; footprint: {w:number; h:number}; source: "verified" | "agent-estimated" | "ai-approx" }`, `footprintCells(placement)` (stud cells covered, after rotation), `sameCell`. Placements keyed by `${page}-${stepIdx}` (step numbers repeat across pages).
4. **Placements data.** `public/steps/<id>.placements.json` + `src/lib/placements.ts` loader (fetch, cache, 404 = none, same pattern as `loadPrebuilt`). Create `public/steps/6455750.placements.json` for the demo manual covering AT LEAST the first 15 steps with placements: open the manual page pictures (`public/steps/6455750/5.jpg` ...) and the step data, work out each step's placement in studs relative to the first plate, and write them. You cannot human-verify these: mark every entry `"source": "agent-estimated"` and list them in Notes for a human to review. The UI treats `agent-estimated` as normal-confidence (solid outline + "check against the manual" hint) and `verified` as highest; nothing is auto-promoted to `verified` by the agent. Optionally support an in-app dev toggle (`?placementDebug=1`) that draws every step's footprint for quick human review.
5. **`src/lib/registration.ts`** (pure, no imports): similarity transform from two correspondences (build stud coords <-> camera-frame pixel coords). Do the math in PIXELS (frame width/height), not anisotropic normalized units. Functions: `fromTwoPoints(b0, b1, f0, f1)`, `apply`, `invert`, `pitchPx(T)` (pixels per stud), `rotationDeg(T)`, `translate(T, dx, dy)`, `isDegenerate` (taps too close, implausible pitch), `studToFrame(T, dx, dy)`. Registration state lives in a ref + state keyed by build session (not by step), with `valid` flag.
6. **Two-tap registration UI** ("Align guide"): shows a small inline diagram of the first plate (from its `studsX`/`studsY`) with stud A and stud B highlighted, and asks the user to tap those two studs on the camera view in order. Tap -> `screenToFrame` -> `fromTwoPoints`. Offer "Re-align" any time. After registration the ghost snaps to the lattice at `pitchPx`.
7. **Patch tracking** (`src/lib/patchTracker.ts`, pure, operates on grayscale `Uint8Array` + dims): pick a template patch (about 48x48 on a 96x72 downscaled grayscale frame) on a textured part of the assembly at registration time; every 250-300 ms (`setInterval`, paused when tab hidden/AR off) search a bounded window for the best SAD/NCC match, return `{dx, dy, score}`; apply translation to the registration only when `score` is good; N consecutive bad scores -> `lost`. Rotation/scale changes of the build are NOT tracked: they drop the score -> lost -> Re-align. Name it honestly in code/UI as "patch tracking" (not object/3D tracking). Frame-difference "scene change" may only be used to flag "camera/assembly moved", never as tracking.
8. **`src/lib/arGuide.ts`** (pure) + **`src/app/api/ar-guide/route.ts`**: one `askClaude` call per request, strict server-side validation. Modes: `ground` (find the assembly box + source part box in the CAMERA frame; `visible:false` strips ALL spatial fields) and `fine` (given a zoomed crop of the assembly drawn with a percent grid, return a refined placement point/orientation hint; used only for steps without a stored placement, producing `source: "ai-approx"` placement drawn dashed amber with "tap to position"). Distinguish statuses: present / absent / occluded / future-placement / ambiguous. No placement unless the assembly is clearly visible. Prompt must say a single image gives no depth/pose. Image size caps like `/api/check`. Reuse the cached `/api/locate` result only as a labeled hint ("MANUAL drawing position, not the camera"). Do not make a second call when cached data suffices (cache per `stepKey+part`).
9. **Guide state machine** `off | aligning | finding | guiding | degraded | lost`, keyed by `stepKey = ${page}-${stepIdx}` + selected part. Re-ground only on: new step (and only if needed: registered + stored placement = no call), different part selected, target lost, explicit Rescan. One in-flight request via ref, throttle >= 4 s, `requestId` discard of stale responses, cleared on any `stepKey` change.
10. **Ghost (`src/components/ARGuideOverlay.tsx` + `PlacementGhost`)**: SVG sized to the video element using `arGeometry`. Footprint rectangle (w x h studs x `pitchPx`, rotated by registration rotation + placement rotation), translucent fill in the part's color (about 40% opacity), cyan outline, stud circles, snapped to the lattice. Colors: cyan = required piece/placement/arrow/next action; amber = approximate, uncertain, degraded; red is RESERVED for `/api/check` errors, which stay in the existing `IssueBoxOverlay` on the frozen photo (do not duplicate or draw them on the live video). Dashed outline when `ai-approx`; solid when stored placement; label always includes "2D guide".
11. **Animations** (replayable, subtle, a few loops then idle to save battery; "Replay" button):
    - pick: pulse the cyan box around the source part (`partBox` from `ground`) if visible
    - fly: a ghost lifts from the source part and follows a quadratic Bezier to the target, rotating if orientation differs (only when `partBox` and a placement both exist)
    - press-in: ghost hovers (offset + soft shadow), lowers, and a ripple ring pulses on the covered studs
    - success: brief green pulse when `/api/check` passes
    Use one rAF loop capped at about 30 fps (or CSS/WAAPI transforms), stopped when idle/hidden/unmounted. Under `prefers-reduced-motion`: static ghost + static arrow, no loops. Mobile Safari safe (no reliance on `offset-path`).
12. **Draggable AR assistant** (`src/components/ARAssistant.tsx`): a floating cyan orb that expands to a compact panel showing the instruction label, guide status ("Locating assembly", "Guiding", "Guide lost alignment — rescan or tap to position."), and controls: Align / Re-align, Rescan, Adjust placement, Replay, Hide guide. The user can **drag it anywhere**:
    - Pointer Events (`pointerdown`/`move`/`up` + `setPointerCapture`), drag handle has `touch-action: none`; a 6 px movement threshold separates a tap (toggle expand, or press a button) from a drag; buttons never start a drag
    - clamped to the viewport minus safe-area insets (`env(safe-area-inset-*)`) using `clampToBox`; re-clamped on resize/orientationchange; optional snap to the nearest edge on release
    - position persisted per orientation in `localStorage` (wrap every read/write in try/catch; works without it); default position does not cover the Hub/Voice header buttons or the step card
    - keyboard accessible: focus the handle, arrow keys nudge it, Escape collapses; `aria-label`s, `role="group"`
    - must not interfere with the phone swipe sheet's `motion` drag or the voice pill; stop propagation on its own pointer events; z-index above the overlay, below modals
    - the "Hide guide" control hides the overlay and collapses the assistant to the orb (never makes it unreachable: the header AR toggle always brings it back)
13. **Adjust placement**: in Adjust mode the ghost itself is draggable (and has a rotate-90 button). Dragging converts the pointer position through `screenToFrame` and the inverse registration into a **per-step nudge in build coordinates** (fractional studs, snapped to whole studs on release), so the correction follows the tracked assembly. The nudge lives until step change or Reset. Never marks a step complete; never changes step progress. Registration itself is corrected with Re-align, not by dragging the ghost.
14. **Header toggle**: "AR Guide" button next to "Voice on", `aria-pressed`, phone-reachable. Toggling must not change `page`/`stepIdx`, call `saveManual`, `speak`, or `runCheck`.

### Known pitfalls in the current code (handle them)
1. `capture()` returns a resized frame; normalized coords on it equal normalized coords on the video, so screen mapping needs only the video's intrinsic size + element box + `object-cover`. Extend `CameraHandle` with geometry (and a grayscale small-frame grabber for the tracker) without breaking `capture`. Re-render on resize + `orientationchange` (ResizeObserver alone is not enough on iOS); clean up on unmount.
2. The bottom card/aside/voice pill sit over the camera. The overlay is `pointer-events-none` except for interactive bits (ghost in Adjust mode, the two-tap layer in Align mode, the assistant), and those sit ABOVE the video but BELOW the existing HUD panels where they would otherwise block them. HUD buttons must stay clickable.
3. Step identity is `${page}-${stepIdx}`. A step change (Back/Next, voice `goToStep`, auto-advance after a passed check via `advanceTimer`, step browser Switch if present) clears per-step state and discards in-flight grounding. Step browser previews must NOT trigger grounding or change anchors/ghost.
4. Grounding and `runCheck` must not run concurrently: if a check is in flight, skip/queue grounding; if the user presses Check while grounding is in flight, the check wins and the grounding result is dropped.
5. `selectPart` highlights the piece in the MANUAL picture; use that selection as the "different part selected" trigger and (optionally) as a `ground` hint, never as camera coordinates.
6. The phone result card is tall: when the check result with issues is shown on phones, hide the ghost animation/assistant panel body (assistant collapses to the orb) so nothing runs under the header, and keep the existing `showingFix` behavior for the hologram/aside.
7. Next route files may only export route handlers/config: helpers live in `src/lib/*`.
8. Sandbox quirks seen earlier in this repo: `next build` fails offline on Google Fonts; to verify, TEMPORARILY stub the Geist fonts in `src/app/layout.tsx`, build, then RESTORE it and confirm with `git diff`. `next start` keeps serving a stale build after `npm run build`: kill the server by PID and restart after every rebuild. Never `pkill -f` a pattern that appears in your own command line (it kills your shell).

## Todo Checklist

### Investigation
- [x] `git checkout -b ar-guide`; `npm ci`; baseline `npm run lint`, `npm test`, `npm run build` (stub fonts only if offline, restore after)
- [x] Read the Next.js docs relevant to route handlers/client components in `node_modules/next/dist/docs/`
- [x] Re-read `BuildView.tsx`, `CameraFeed.tsx`, `Hologram.tsx`, `locate/route.ts`, `check/route.ts`, `issues.ts`, `prebuilt.ts`, `public/steps/6455750.json`; confirm the pitfalls against the real code
- [x] Skim the Bluebook/AR-Vision files named in the brief and their LICENSE if reachable; log what concepts you adapted
- [x] Record the architecture (spaces, build frame, registration, state machine, assistant) in Notes

### Implementation: Part A (required)
- [x] `src/lib/arGeometry.ts` (`coverMap`, `frameToScreen`, `screenToFrame`, visibility, `clampToBox`)
- [x] `src/lib/buildFrame.ts` (types, `footprintCells`) and `src/lib/placements.ts` loader
- [x] `src/lib/registration.ts` (two-point similarity, apply/invert, pitch/rotation, degeneracy)
- [x] `public/steps/6455750.placements.json` for >= first 15 steps (agent-estimated, listed in Notes for human review) and optional `?placementDebug=1` footprint view
- [x] `src/lib/patchTracker.ts` (pure grayscale patch search + quality + lost logic) and the tracker loop (interval, paused when hidden/off)
- [x] `src/lib/arGuide.ts` + `src/app/api/ar-guide/route.ts` (`ground` and `fine` modes, strict validation, coarse-to-fine, statuses, no placement unless assembly clearly visible)
- [x] `CameraFeed` geometry + small grayscale frame access (keep `capture`)
- [x] `ARGuideOverlay.tsx` + `PlacementGhost` (snapped translucent footprint, studs, colors, "2D guide" label, dashed for approximate, reduced-motion)
- [x] Two-tap "Align guide" flow with the inline diagram; Re-align
- [x] Animations: pick pulse, fly path, press-in ripple, rotation, success pulse, Replay, loop limit, 30 fps cap, reduced-motion fallback
- [x] `ARAssistant.tsx`: draggable orb/panel with all behaviors in Design item 12 (thresholded drag, clamping, safe-area, snap-to-edge, persisted position with try/catch, keyboard, no conflict with the swipe sheet/voice pill)
- [x] Adjust placement: drag/rotate ghost -> per-step nudge in build coordinates; Reset adjustment; Rescan; Hide guide
- [x] Guide state machine + scheduler (one in-flight, throttle, request ids, per-step cache, clear on `stepKey` change), `runCheck` concurrency rules, header "AR Guide" toggle
- [x] Lost-target recovery: amber state + "Guide lost alignment — rescan or tap to position."; Re-align/Rescan recovers without changing the step
- [x] Defensive checks: no camera frame, `visible:false`, no placement, ambiguous part, tiny/huge boxes, request errors (amber "Couldn't locate, tap to position"), registration degenerate, missing placements file

### Implementation: Part B (optional, only after Part A validation passes)
- [ ] Pseudo-3D ghost: reuse `Hologram` geometry in a transparent, top-down orthographic three.js canvas matched to `pitchPx`; capped fps; falls back to the SVG ghost; labeled 2D guide
- [ ] Four-corner homography work-mat calibration (`src/lib/homography.ts`: 4-point DLT, 8x8 solve with partial pivoting, apply/invert, degenerate detection); plane-only, labeled as such; invalidated by large camera movement

### Validation
- [x] Run `npm run lint` and fix issues in touched files
- [x] Run `npx tsc --noEmit` (ignore the pre-existing `LayoutProps` error from `layout.tsx` if present; it is generated by `next build`)
- [ ] Run `npm test` and ensure all pass. Add node:test files in `scripts/` (copy `scripts/commands.test.mjs` style: import `.ts` sources with explicit extensions, pure modules only, no enums):
  - [ ] `arGeometry`: `object-cover` for portrait video in a 390x844 box, landscape video in a portrait box, box wider than video; round trip `screenToFrame(frameToScreen(p)) == p`; cropped-out points invisible; rotation (swapped dims); `clampToBox` keeps a 56 px orb inside the box with insets, handles box smaller than element
  - [ ] `registration`: two known correspondences reproduce both points; a third known point maps correctly (rotated 30 degrees, scaled, translated); `invert(apply)` round trip; pixel (not normalized) math with a non-square frame; degenerate taps rejected; `translate` shifts correctly
  - [ ] `buildFrame`: `footprintCells` for 2x4 at all four rotations; cell overlap
  - [ ] `patchTracker`: synthetic shifted image recovers the shift; low-texture/noisy frame gives low score; N bad scores -> lost; large jump outside window -> lost
  - [ ] `arGuide.parseGuide`: `visible:false` strips all spatial fields; no placement when assembly missing; placement outside assembly dropped; tiny/huge boxes dropped; orientation dropped below confidence; malformed/NaN/strings; status variants (present/absent/occluded/future/ambiguous); model returning NO placement is valid
  - [ ] guide scheduler/reducer: step change during grounding discards the late response; rapid Next, Next, Back leaves one fresh state; stale response after Rescan dropped; throttle and one in-flight respected; stored placement + valid registration = no model call
  - [ ] `placements` data: the JSON validates against the type; every key matches a real `${page}-${stepIdx}` in `public/steps/6455750.json`; footprints non-empty; rotations in {0,90,180,270}
  - [ ] homography (Part B only): reproduces 4 points, inverse round trip, degenerate rejected
- [ ] Add a Playwright e2e `scripts/e2e-ar-guide.mjs` at 390x844 (chromium `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, camera permission granted). Seed IndexedDB (`keyval-store`/`keyval`) with `manual:t1` = `{id:"t1", source:"lego", title:"Test", subtitle:"x", pdfPath:"/manual-pdf/lego/6455750.pdf", page:5, addedAt, openedAt}`; mock `/api/ar-guide` and `/api/check` with `page.route`; abort `/api/tts` and `/api/speech-token`. Assert:
  - [ ] toggle AR Guide on without registration: assistant shows "Align guide"; after two taps at known screen points the ghost footprint renders at the positions predicted by `registration` + `coverMap` (compute expected px from the actual video element rect); screenshot
  - [ ] toggling AR does not change the step label and makes no `/api/check` call; moving to the next step (Next) re-projects a new ghost with zero `/api/ar-guide` calls when a stored placement exists
  - [ ] step without a stored placement: `/api/ar-guide` mocked, ghost dashed amber with "tap to position"; mocked `visible:false`: no spatial markers and a clear message
  - [ ] **assistant drag**: mouse drag moves the orb; position is clamped inside 390x844 with insets (try dragging far outside); a plain tap toggles expand without moving it; pressing a panel button does not drag; position persists after reload (localStorage) and still renders if localStorage throws (init script that makes it throw); arrow-key nudge works; rerun at 844x390 and the assistant is re-clamped
  - [ ] **ghost drag** in Adjust mode: dragging moves the ghost by whole studs in build coordinates, persists until the step changes, resets on Reset, never completes a step
  - [ ] step change mid-request (delay the mock, press Next, then release): late response not rendered; call counts bounded, never more than one in flight
  - [ ] lost tracking (force low tracker score or alter the fake scene): amber "Guide lost alignment — rescan or tap to position." shows, no cyan ghost drawn; Re-align recovers without changing the step
  - [ ] Check build with a failing mocked `/api/check` (two boxed issues): existing numbered amber boxes render on the frozen photo only, not on the live video; the assistant collapses and nothing overlaps the header on 390x844; AR and error overlays coexist
  - [ ] `prefers-reduced-motion: reduce`: ghost/assistant animations are `none`, ghost still visible
  - [ ] landscape 844x390: overlay and assistant re-map correctly after rotation
- [x] Run `npm run build` and ensure it succeeds (stub Google Fonts only if offline, restore `layout.tsx`, confirm with `git diff`)
- [ ] Regression checks via tests/run: Back/Next/Check build, voice commands (`npm test` matcher tests), part-chip highlight, hologram, phone swipe sheet (still draggable, not stolen by the assistant), voice panel, existing error boxes
- [ ] Performance checks in the e2e run: bounded `/api/ar-guide` calls, tracker/animation loops stop when AR is off, tab hidden, or after navigating to the Hub; no console errors; no leaked timers

### Cleanup
- [ ] Remove debug code and test hooks; ensure `layout.tsx` is restored; screenshots git-ignored
- [x] Update `DECISIONS.md`: architecture (build frame vs registration, two-tap similarity transform, patch tracking, coarse-to-fine grounding, state machine), why placements are stored in studs, assistant design, inspiration sources + licenses, capabilities, hardware/browser limitations (iOS Safari, rotation, camera aspect), performance observations, remaining accuracy limits (2D only, no depth/pose, build rotation not tracked, elevated parts and perspective error, agent-estimated placements need human review), why markers/3D were not built
- [x] Add an "AR Guide" blurb and the test commands to `README.md`
- [x] State clearly in `DECISIONS.md` and the final summary that real-phone alignment and placement correctness were NOT verified by the agent; list the human checks (ghost lands on the right studs for steps 1-15, rotation, glare/low light, bumping the stand, dragging the assistant with a thumb on a real iPhone)
- [x] Final validation: `npm run lint && npm test && npm run build`, then run the e2e once more

## Definition of Done
- Modules exist and are wired into `BuildView.tsx` behind a header "AR Guide" toggle at 390x844: `src/lib/arGeometry.ts`, `buildFrame.ts`, `placements.ts`, `registration.ts`, `patchTracker.ts`, `arGuide.ts`, `src/app/api/ar-guide/route.ts`, `src/components/ARGuideOverlay.tsx`, `ARAssistant.tsx`, and `public/steps/6455750.placements.json` (>= 15 steps).
- After two-tap alignment, the ghost footprint appears at the registration-predicted screen position (verified against `coverMap` in e2e), snapped to the stud lattice, for portrait and landscape, and follows tracked assembly movement; later steps need no model call when a stored placement exists.
- Animations (pick pulse, fly path, press-in, rotation, success) run a limited number of loops, are replayable, stop when idle/hidden, and are static under reduced motion.
- The AR assistant can be dragged anywhere on screen: thresholded drag vs tap, clamped to the viewport with safe-area insets, re-clamped on rotation, position persisted (and works without storage), keyboard nudge works, buttons never start drags, and it never breaks the phone swipe sheet, voice pill, or header buttons.
- Adjust placement drags/rotates the ghost as a per-step build-frame nudge that never completes a step or changes progress; Rescan, Re-align, Replay and Hide guide all work; "Guide lost alignment — rescan or tap to position." appears on tracking loss and recovery needs no restart.
- Stale/late grounding never renders after a step change; at most one `/api/ar-guide` request is in flight; no per-frame model calls; grounding never runs concurrently with a check.
- Existing check flow and amber error boxes are unchanged and coexist; AR never changes step progress; the UI labels guides "2D guide" and never claims 3D registration; `agent-estimated` placements are labeled and listed for human review.
- All commands pass: `npm run lint`, `npm test`, `npm run build`, `node scripts/e2e-ar-guide.mjs` (against a running production server).
- Part B (if built) is clearly labeled; if not built, DECISIONS.md says so. `DECISIONS.md` and `README.md` updated; Notes filled with design, assumptions, license findings, review list and limitations.

## Notes
Progress (2026-10-24): `ar-guide` fast-forwarded from `ar-akhil`; `main` untouched. `npm ci`, baseline lint/test/build all passed without a font stub. Current checkout already had the v1 AR guide and the supposedly absent `ManualPanel`, `PieceHologram`, `CheckErrorOverlay`, and `issueBox` files; implementation extends these actual files. Read the Next 16.4.3 client component and route handler guides.

Architecture so far: build frame stores stud offsets and footprints; two tapped first-plate studs define a pixel-space similarity transform; 96x72 grayscale patch search translates that registration; `object-cover` mapping projects to screen. The assistant is an independent draggable HUD element. Stored base placements bypass `/api/ar-guide` for the spot; an optional `source` request finds the loose brick for the cyan pick-up box. Detached or missing placements use the existing camera guide. The `/api/check` flow remains separate. A production Playwright test verified one source request per stored step and the existing check flow.

Reference convention: first green half-circle plate, A and B are the left and right end studs along its straight edge, seven pitches apart. All first-15 entries in `6455750.placements.json` are `agent-estimated` and need visual review. Steps 7-9 (tower) and 12-15 (flower) are detached subassemblies; their own `ref` prevents misleading projection onto the first plate. Steps 1-6 and 10-11 are base-referenced but still need correction by a person looking at the physical build.

Human checks remaining: real iPhone alignment and thumb dragging, correct stud footprints for steps 1-15, rotation, glare and low light, stand bumps, and landscape safe areas. Patch tracking is translation only. Single-view 2D cannot establish depth or part height. Part B is unbuilt.

Second milestone: fallback `ground`/`fine` modes are sequential and the fine pass uses a zoomed camera crop with a 10-percent grid. A detached step's browser test makes exactly two mocked guide calls; a rescan with `visible:false` adds one call and clears markers. The test also exercises two-tap projection, a dragged stud nudge, assistant drag/keyboard/persistence, rotation, reduced motion, and the existing check boxes. Short CSS animations run twice and stop; there is no ongoing rAF loop to cap. Edge snapping is optional and was not added. The current root GitHub listings for Bluebook and AR-Vision show no LICENSE file; only conceptual separation of grounding/tracking and calibration was adapted, with original TypeScript.

Assumptions already made by the spec author (review after the run):
- "AR assistant" = the on-screen floating assistant (orb/panel with status and controls). The ghost is separately draggable in Adjust mode.
- The build frame's origin and axes come from the first plate; the two-tap alignment uses two marked studs on that plate. The agent defines exact reference studs per manual and logs it.
- Placement data for the demo manual is agent-estimated from the manual images, not human-verified.
- Patch tracking is translation-only on a main-thread 96x72 grayscale canvas at about 4 Hz; a Web Worker only if profiling shows jank. Part B (3D ghost, homography) and any OpenCV/marker work are out of scope for Part A.
- Existing check errors remain amber on the frozen photo (as shipped); "red for errors" in the brief is satisfied by the current implementation and is not duplicated.
