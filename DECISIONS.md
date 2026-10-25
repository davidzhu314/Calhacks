# BuildSight — Decisions Log

Running record of every product and technical decision, newest at the bottom of each section.
Feeds the README, the Devpost write-up, and the demo script. Add a line whenever something changes.

Format: **Decision** — why. *(date, PT)*

---

## Product

- **Build a hands-free build copilot, not a repair copilot.** You show it any picture-based instructions; it watches you build through the camera, tells you what's next, and catches mistakes. — Building moves forward naturally (no faked faults), the instructions-as-input design makes it general, and a caught mistake is a stronger demo moment than naming a part. *(Sat Oct 24, ~1 AM)*
- **Dropped earlier ideas:** FixSight bike repair (story didn't match the factory pitch; purchase step felt forced) and desktop-PC repair (practical but uninspiring). *(Sat Oct 24, ~1 AM)*
- **Target user: frontline workers following work instructions with their hands busy** (assembly lines, kitting, field installs, new hires). LEGO and IKEA are stand-ins judges can watch. *(Sat Oct 24, ~1 AM)*
- **Working name: BuildSight.** Easy to change. *(Sat Oct 24, ~1 AM)*

## Demo

- **Demo build: LEGO 31136 Exotic Parrot** (Creator 3-in-1, 253 pieces, 7+, 3 books; the team bought it). Featured first on the LEGO tab via `FEATURED` in `scripts/build-catalog.mjs`. *(Sat Oct 24, ~1:30 PM)*
- **Main prop: a small LEGO set (100–250 pieces), bright colors, mostly larger bricks. No Technic** (grey pins and beams look alike on camera). *(Sat Oct 24, ~1 AM)*
- **Second prop: a small IKEA piece** (4–8 steps) to prove it isn't LEGO-specific. *(Sat Oct 24, ~1:30 AM)*
- **Demo beats:** guide the next step → catch a deliberate mistake (side-by-side with the manual picture) → switch to the IKEA build by voice. *(Sat Oct 24, ~1 AM)*
- **Camera is fixed overhead on a stand over a plain white mat,** not chest-mounted. — A fixed view makes every frame comparable to the manual picture. *(Sat Oct 24, ~1 AM)*
- **Voice plays through a table speaker** so judges hear it; a live transcript is shown on screen. *(Sat Oct 24, ~1 AM)*

## Platform

- **Website, not an app-store app.** One Next.js codebase runs in the phone's browser and on a laptop; it can be added to the phone's home screen. — No separate builds or store approval, and the demo looks the same. *(Sat Oct 24, ~1:15 AM)*
- **Demo setup: phone as overhead camera, laptop as the big screen,** paired with a room code or QR. *(Sat Oct 24, ~1:15 AM)*
- **Stack:** Next.js 16 + React 19 + TypeScript + Tailwind on Vercel; three.js via react-three-fiber for 3D; Motion for animation. *(Sat Oct 24, ~1:30 AM)*
- **Phone ↔ laptop real-time link: Azure Web PubSub** (Vercel functions can't hold a live socket; also keeps Microsoft in the build). *Not built yet.* *(Sat Oct 24, ~1:15 AM)*
- **Speech to text: Azure AI Speech; voice out: Cartesia; telemetry: Azure Application Insights.** *Keys in; speech to text built (see Voice).* *(Sat Oct 24, ~1:15 AM)*

## AI

- **Claude through OpenRouter** (team has an OpenRouter key). Models: `anthropic/claude-sonnet-5.5` for live checks and questions, `anthropic/claude-opus-5.5` for reading manuals once. Model is set by `OPENROUTER_MODEL`. *(Sat Oct 24, ~1:30 AM)*
- **Step checks compare the camera frame to the manual's own picture for that step** (plus the previous step's), instead of asking the model to work out the build from scratch. Output: `step_complete`, `confidence`, `issues[]`. Below 0.7 confidence it asks for a closer look. *(Sat Oct 24, ~1 AM)*
- **Manuals are turned into step records once** (parts, action, expected picture, things to watch for), and a person approves them. *(Sat Oct 24, ~1 AM)*
- **Simple commands (next, back, repeat) skip the model** for sub-second replies. *(Sat Oct 24, ~1 AM)*
- **Claude is called through one helper (`src/lib/claude.ts`) using the official Anthropic SDK when `ANTHROPIC_API_KEY` is set; OpenRouter is the fallback.** Model `claude-sonnet-5-5`, effort `low` for speed, `max_tokens` 16000 (thinking counts toward it), no `temperature` (Sonnet 5.5 rejects non-default sampling values). Server-side refusal fallback on (`fallbacks: "default"`), so an overcautious safety decline re-runs on a fallback model instead of failing. *(Sat Oct 24, ~9 AM)*
- **Step check endpoint: `POST /api/check`** takes `frame`, `expected`, optional `previous`, `instruction`, `watchFor`; returns `step_complete`, `confidence`, `issues[]`, and a short `say` line. Temperature 0. *(Sat Oct 24, ~1:45 AM)*
- **Test manual: LEGO Creator 31163** (official PDF from lego.com, book 1, 100 pages, 1–2 steps per page with parts boxes). *(Sat Oct 24, ~1:40 AM)*
- **Stand-in test result: 10/10** (5 step pairs × finished / not yet), ~3 s per check, using manual pictures as fake camera frames. Without a test-mode note, Claude refused to call a drawing "finished" and asked for a real photo, which is the behavior we want live. **Real-photo test still needed.** *(Sat Oct 24, ~1:50 AM)*
- **Checks fire when the scene goes still** (hands out of frame ~1.5 s), detected in the browser, rather than sending every frame. *(Sat Oct 24, ~1 AM)*

## Voice

- **The voice loop goes into BuildSight** (not a separate FixSight app): listen with Azure, think with Claude, speak with Cartesia, on the build screen. *(Sat Oct 24, ~1 PM)*
- **Speech to text: Azure AI Speech in the browser** (`microsoft-cognitiveservices-speech-sdk` 1.53). `GET /api/speech-token` trades the key for a 10-minute token (reused for 9 min), so the key never reaches the browser. The connection is opened when the build screen loads, so the first press starts fast. *(Sat Oct 24, ~1 PM)*
- ~~Push-to-talk first: hold the mic button or hold M~~ **Replaced by a mic mute toggle** (Sat Oct 24, ~3:30 PM). *(added ~1 PM)*
- **Voice questions: `POST /api/assist`** takes the question, the latest camera frame, recent turns, and the current manual step; streams plain text back. Claude Sonnet 5.5 with thinking off (`between_tools`) and low effort, for speed: **~1.4 s to the first word**, ~2.2 s total. The prompt keeps answers spoken-style: 1–3 sentences, one step at a time, safety first, asks for a closer look instead of guessing. Refusal fallback on. *(Sat Oct 24, ~1:30 PM)*
- **Voice out: Cartesia `sonic-3.6`, voice "George" (steady British male), through `POST /api/tts`,** which streams raw audio (32-bit float, 24 kHz) straight from Cartesia's bytes endpoint. ~0.35 s to first audio from Cartesia, ~0.6 s through our server. No WebSocket needed: the bytes endpoint already streams. Voice is overridable with `CARTESIA_VOICE_ID`. *(Sat Oct 24, ~2 PM)*
- **Replies are spoken sentence by sentence while Claude is still writing:** each finished sentence goes to Cartesia right away and plays in order (very short ones are merged with the next). Talking interrupts the voice. ~~If Cartesia fails, that sentence uses the browser's voice.~~ *(Sat Oct 24, ~2 PM)*
- **Fix: never two voices at once** (user heard a second, different voice mid-answer and when moving to the next step). Cause: every sentence of an answer asked Cartesia for audio at the same time; Cartesia rejects more than about 4 at once, and rejected sentences fell back to the browser's voice, which could also start late over the next step's announcement. Now only the current and next sentence are fetched (max ~3 open), a rejected one is retried twice, and the browser voice is used only if Cartesia hasn't worked at all this session; otherwise that sentence is skipped (the text stays on screen). Anything new (next step, new question, mute) fully cuts off the old answer, and the mic stays off while any voice is playing. Tested against a fake Cartesia limited to 1 request at a time: one voice throughout. *(Sat Oct 24, ~4 PM)*
- ~~Separate hands-free mode (H key)~~ **Merged into the mic toggle** (Sat Oct 24, ~3:30 PM). *(added ~2:30 PM)*
- **The mic is a mute button, not press-and-hold** (user request): tap it (or press M) to go live, tap again to mute. Starts muted. While live, a sentence is sent when you pause for 0.9 s; the mic stops while BuildSight is thinking or speaking (including step announcements) and comes back 0.3 s after the voice ends, so it never hears itself. Tapping the mic while BuildSight speaks stops the voice. Muted shows a crossed-out mic and "Muted · tap to talk"; live shows a glowing red mic. *(Sat Oct 24, ~3:30 PM)*
- **On phones with the step card collapsed, the voice panel shrinks to a round mic button** plus a one-line status/caption. *(Sat Oct 24, ~2:30 PM)*
- **The voice panel is a small pill by default** (~44 px: mic toggle and one-line status), because the full panel was too big on phones. The latest question and answer open below it while you talk or it answers, and fold away 6 s after it finishes. Tap the status line to keep the whole transcript open. *(Sat Oct 24, ~3 PM)*
- **Voice questions know which part you tapped:** if a part chip is selected, Claude is told, so "where does this piece go?" works. *(Sat Oct 24, ~3:15 PM)*
- **Every part of the step is shown at once, no tapping:** when a step opens, each part is found in the manual's parts box in parallel (one `/api/locate` call per part, cached, up to 6). All parts appear as a row of holograms (cut from the manual, at the manual's scale) and as numbered boxes on the manual picture and in the zoom viewer: blue in the parts box, amber where it goes, numbers matching the holograms. Nothing to tap: the holograms are display-only, numbered to match the boxes. The part-name pills under the instruction are gone (removed Sun Oct 25): the holograms and the instruction text already name the parts. *(Sun Oct 25)*
- **Step strip instead of a step browser:** a slim sideways scroll of every step's picture (48 px tall) sits at the top of the step card, numbered (sub-steps as "22·1"). The current step is highlighted and kept centered; tap any thumbnail to jump straight there, no dialog. It fills in as the book is read in the background and hides with the collapsed step card. Chosen over a full-screen "Browse steps" dialog to keep buttons and space to a minimum. *(Sun Oct 25)*
- **Shorter step card, no Back / Next buttons** *(Sun Oct 25)*: the step strip, voice ("next", "back", "go to step 8"), auto-detect and the arrow keys move between steps, so the buttons went (including the collapsed card's "→"). Check build is one full-width button. Tighter padding, a smaller instruction on phones, the warning capped at two lines, and "Checking where you are…" shows in the header instead of its own line: about a quarter shorter on a phone.
- **Holograms are always the small size**, even for a one-part step (96 px on phones, the same as two parts; three or more go smaller), so they never dominate the screen. *(Sun Oct 25)*
- **Quantities are a bold badge on each hologram** (top-right): white for ×1, amber for ×2 and up so a multi-piece grab isn't missed. *(Sun Oct 25)*
- **The app finds your step from the camera on its own** (always on, nothing to press). Once a step is up, the rest of the book is read in the background, two pages at a time (header shows "read 34/80"). When the whole book is read it checks once, then again whenever the build has changed and the scene has held still for 1.5 s (hands out of the way). Motion is sensed on the phone from a 32x24 grayscale sample (`CameraFeed.sample()`), so watching costs nothing; Claude is called only on a real change, at most every 20 s, and not within 20 s of the builder changing step themselves. It stays quiet unless the step changes: a different step jumps there ("Looks like you're on step 13"); a broken earlier step jumps back to fix it and lists every problem; the same step does nothing. It goes straight to Claude's best guess and never asks for confirmation; automatic checks skip only answers under 0.3 confidence (empty table, a hand in the way), and "needs fixing" is only reported at 0.6+. *(updated Sun Oct 25: no more "it might be step 25, say go to step")* *(Sun Oct 25)*
- **No "Where am I?" button and no Auto switch** (removed Sun Oct 25: detection should just happen). Saying "where am I", "what step am I on" or "find my place" still works as a hidden backup; it runs the same check, jumps to the best guess at any confidence, and says it. The camera frame plus contact sheets of every step picture go to `POST /api/where-am-i` (Sonnet, thinking on, medium effort). Tiles are numbered 1, 2, 3... in book order, not by printed step number, because sub-builds restart at step 1; each tile maps back to its page and step (`src/lib/whereAmI.ts`). *(Sun Oct 25)*
- **Each spoken question carries the camera frame grabbed the moment you stop talking** (from the build screen's live camera, max 1024 px JPEG). A small thumbnail of that frame shows next to the question in the transcript, so judges can see what BuildSight saw. No camera means the question goes without a photo, and Claude is told so. *(Sat Oct 24, ~2:45 PM)*
- **Voice commands act instantly, with no Claude call** (`src/lib/commands.ts`, matched before a phrase is sent to `/api/assist`): next / back / repeat / check / stop, "go to step 8" / "step eight" / "I'm on step 8", and "I finished step 7" (→ step 8). Numbers as digits or words up to ninety-nine. Only whole phrases match, so questions like "what color is the piece in step 8?" still go to Claude. A step on another page is found by reading pages ahead, then behind; numbers can repeat in a book (sub-builds restart at 1), so the nearest match wins. Pre-read books search the whole book for free; others search at most 15 pages each way (each unread page is a Claude call), then say the step wasn't found. "Stop" only works while BuildSight is quiet, because the mic is off while it speaks. Tests: `npm run test:commands`. *(Sat Oct 24, ~6 PM)*

- **Parts are described by appearance, so lookalikes aren't confused** (Sat Oct 24, ~8 PM): `/api/extract` gives each part a `visual_description` ("2x4 lime green plate"); `/api/check` and `/api/locate` get the step's whole parts list with those descriptions and a rule to identify pieces by their listed appearance, not by what the step expects (unsure → not done, low confidence). Older readings and the pre-read demo manual have no description, so one is built from name, size and shape (`src/lib/parts.ts`, tests: `npm run test:parts`). Request fields are optional and response shapes unchanged.

## Hologram / interactive UI

- **Level 1 (building now): floating glass instruction card + a glowing blue 3D model of the next piece, and a pulsing marker roughly where it goes.** *(Sat Oct 24, ~1:15 AM)*
- **Level 2 (maybe): 3D replay of the step** using a community LDraw model of the set, if one exists for the chosen set. *(Sat Oct 24, ~1:15 AM)*
- **Level 3 (out): hologram locked onto the real bricks (true AR).** — Needs precise tracking, and iPhone Safari doesn't support WebXR AR. Roadmap only. *(Sat Oct 24, ~1:15 AM)*
- ~~First hologram pieces are generated in code (bricks and plates from stud size and color).~~ **Replaced** (Sat Oct 24, ~6 PM): generated blocks got shapes wrong (a round brick showed as a square one). *(added ~1:30 AM)*
- **The hologram is the real piece, cut out of the manual's parts box** (user's idea). When a step opens, `/api/locate` finds the part in the parts box; the browser cuts it out (`src/lib/cutout.ts`: removes the paper background by flood fill, drops the "1x" label, trims) and `PieceHologram` floats it over a projector beam with a cyan edge glow and faint scan lines. While it searches: a spinning reticle and "SCANNING PARTS BOX"; then the piece prints in from the bottom with a bright print-head line, and the glow switches on as it lands. If the piece can't be found, no hologram shows (never a wrong shape). *(Sat Oct 24, ~6 PM)*
- **Hologram pieces keep their real proportions to each other**: size comes from the piece's size on the manual page (manuals draw parts boxes at a consistent scale), so a 1x1 looks small and a 6x6 plate big. *(Sat Oct 24, ~6 PM)*
- **The demo manual has 2400 px page images just for hologram cut-outs** (`public/steps/6455750/hi/`, 13.8 MB, made by `scripts/hires.py`); the normal 1200 px pages left parts only ~50 px wide and blurry. Each loads only when its step is shown. Other manuals cut from the page image on screen. *(Sat Oct 24, ~6 PM)*
- **No 3D tilt or CSS filters on the revealing layer:** Chrome draws a faint box around a glowing image inside a filtered/clipped/3D layer, so the float is 2D and the glow turns on only after the print-in. *(Sat Oct 24, ~6 PM)*
- **Practice mode (stretch, Sat evening): build with holograms only, no LEGO needed.** Drag or tap to place the glowing piece; it snaps in if right, shakes if wrong; score and timer. — Not the main product (Microsoft's track is "Built for the Real World", and it skips the camera check), but it doubles as worker training before touching the real line, lets judges try it on their own phones, and is a fallback if the camera or Wi-Fi fails. *(Sat Oct 24, ~2 AM)*
- **Marker position comes from the model as an approximate location,** not exact pixels. Fine because the camera is fixed overhead. *(Sat Oct 24, ~1:15 AM)*

## Hub and manuals

- **Step checks report `can_see`** (Sat Oct 24, ~6:45 PM): when the camera doesn't clearly show the build (dark, covered, blurry, or a printed manual page instead of real bricks), the result is "Need a better look" with no percentage and no issue list. Before, "the camera is black" came back as "Hold on · 95%". The server enforces it (confidence capped at 0.3, issues cleared), so the button, voice "check" and auto-detect all behave the same.
- **On phones, a check result gets room instead of growing the card** (Sat Oct 24, ~6:45 PM): while it shows, the part holograms, part chips and tip step aside, and the comparison shows just a small photo of your build (the manual picture is already on screen; desktop keeps both side by side). Tap the result to dismiss it and bring the holograms back. Before, the card grew past the screen and pushed the holograms into the header.
- **Hub search shows a live scanner** (Sat Oct 24, ~6:45 PM): "Searching IKEA for “kallax”" (or "Looking up LEGO set 31163"), a mono log of the steps the search takes ticking off, and bracketed placeholder cards with a scan sweep. The "nothing in the catalog matches" line no longer shows mid-search, and it names the right store.

- **Home page is a hub, Jarvis-inspired HUD look** (dark navy, cyan glow, rotating rings, corner-bracket panels, Rajdhani + Geist Mono). Inspired by the style only; no Marvel names, logos or assets. *(Sat Oct 24, ~3 AM)*
- **Manual search: a 4–7 digit number searches LEGO by set number** (scraped from lego.com's building-instructions page: book names, sizes, PDFs, covers); **anything else searches IKEA** (IKEA's public product search, then each product page's assembly PDFs, keeping only PDFs named after the product, de-duplicated across color variants). *(Sat Oct 24, ~3 AM)*
- **Hub organized into three tabs: LEGO, IKEA, My projects,** with category chips (LEGO themes; IKEA Tables & desks / Storage / Seating / Beds / Kids). *(Sat Oct 24, ~10 AM)*
- **Browsable catalog: ~100 LEGO sets across 13 themes (newest 8 per theme) and ~37 IKEA products,** built by `scripts/build-catalog.mjs` into `src/data/catalog.json`. Every item is verified to have downloadable instructions; LEGO details (name, theme, age, pieces, year, product photo) come from lego.com's instructions page. The script caches what it found (`scripts/catalog-cache.json`) because lego.com throttles bursts. *(Sat Oct 24, ~10 AM)*
- **Manuals load on tap, not upfront.** The catalog stores each manual's PDF link; the PDF itself is fetched when you open it. Sets with several books open a picker. Typing filters the catalog instantly; Search still looks up anything not listed (any LEGO set number or IKEA product). *(Sat Oct 24, ~10 AM)*
- **My projects = your uploads and every manual you've opened,** with progress; a "Continue …" shortcut under the search bar resumes the latest build. *(Sat Oct 24, ~10 AM)*
- **Upload any PDF** by button or drag-and-drop anywhere on the hub. *(Sat Oct 24, ~3 AM)*
- **PDFs load through our own domain via Next.js rewrites** (`/manual-pdf/lego/…`, `/manual-pdf/ikea/…`) because browsers can't fetch them from lego.com/ikea.com directly; rewrites avoid Vercel's function size limit (LEGO books are ~20 MB). *(Sat Oct 24, ~3 AM)*
- **PDF pages render in the browser with pdf.js.** *(Sat Oct 24, ~3 AM)*
- **Library lives in the browser (IndexedDB) for now:** manual list, uploaded PDFs, reading progress, and extracted steps per page. Each device has its own library until we add shared storage (Azure Blob is the candidate). *(Sat Oct 24, ~3 AM)*
- **Steps are extracted one page at a time, when you reach it** (`POST /api/extract`, ~3.5 s/page, cached), instead of reading the whole book upfront. Pages with no steps are skipped automatically. Unnumbered steps (common in IKEA) get reading-order numbers. *(Sat Oct 24, ~3 AM)*
- **Pre-read demo manual: 31136 Exotic Parrot, Book 1** (`scripts/preread.py` → `public/steps/6455750.json` + 61 page images, 4.5 MB). 68 pages, 122 steps, read once in 82 s. The app checks for a pre-read copy first; if found it needs no PDF and no Claude calls for steps, so it opens in ~0.4 s and works on bad Wi-Fi. Other manuals still read live. *(Sat Oct 24, ~2 PM)*
- **Faster manual opening** *(Sat Oct 24, ~12:30 PM)*:
  - pdf.js loads only the byte ranges it needs (`disableAutoFetch`, 1 MB chunks) instead of the whole file; LEGO books are ~20 MB and a full download through the proxy took minutes or failed.
  - The PDF starts loading the moment a card is tapped, before the build screen mounts.
  - Pages are read ahead in parallel (current + 6 ahead, up to 6 Claude calls at once), so cover/intro pages don't delay step 1 and Next is usually instant.
  - The page image shows (with a scan sweep) while Claude reads it.
  - Measured on the live site, fresh device: step 1 ready in ~11–22 s (was 25–130 s); Next ~0.3–1.3 s. Remaining time is mostly lego.com's slow, variable PDF delivery (1 MB in 1–5 s).
- **Build screen starts at the first page with steps** (or where you left off), shows the step's manual picture as a glowing "target" panel, the next part as a hologram, and a **Check build** button (also Space/Enter). A verified step auto-advances. *(Sat Oct 24, ~3 AM)*
- **Tapping the manual picture opens a full-screen zoom viewer** (`ZoomViewer`): pinch, mouse wheel / trackpad, or double-tap (2.5×, again to reset) to zoom 1–6×; drag to pan, kept from leaving the screen; +, −, Fit and Close buttons (Escape closes). Switch between **This step** (the crop) and **Whole page**, since crops sometimes cut off context. Part highlight boxes zoom with the picture (This step only). The glow toggle moved into the viewer's header; real colors stay the default. One CSS transform plus pointer events with `touch-action: none`, so iPhone Safari doesn't zoom the page. *(Sat Oct 24, ~4 PM)*
- **The manual picture panel can be moved and resized** on phones and desktop (`ManualPanel`): drag it anywhere; drag the bottom-left corner grip to resize (96–640 px wide, aspect kept). A press that moves under 6 px still counts as a tap and opens the zoom viewer. It stays fully on screen (also after rotating or resizing the window), and the position and size are remembered per device in localStorage. Until it's moved, it keeps the default spot and widths. *(Sat Oct 24, ~5 PM)*
- ~~Voice out uses the browser's built-in speech for now~~ **Replaced by Cartesia** (Sat Oct 24, ~2 PM); the browser voice is only a fallback. Mute toggle kept. *(Sat Oct 24, ~3 AM)*
- **Library and build UI share a small navy/cyan system** (`UI_DESIGN.md`): a prominent start/resume action, search and PDF upload on the home screen, consistent card/action styles, and explicit camera loading/error feedback. Multi-book selection uses Radix Dialog for keyboard and focus behavior. The existing routes, manual data, and camera/voice contracts stay in place. *(Sat Oct 24)*
- **Mistakes are pointed out, not just listed** (Sun Oct 25, ~3 AM): a failed check now says where the first mistake is ("The red 2x4 near the top left is turned the wrong way. Two more on screen."), from the box center on a 3x3 grid, so the builder knows where to look without the screen; no box means no location, and other results still say Claude's own sentence. Boxes are red (translucent fill, pulsing glow, off under reduced motion) with a warning glyph in the number badge, dashed for missing pieces, and each problem gets a tag: Wrong piece / Missing / Misplaced. Tapping the checked photo opens it full screen in `ZoomViewer` (new photo mode: the boxes sit on the zoomed layer, so they zoom and pan with it). On phones the photo is taller during a mistake, a long problem list scrolls inside the card, and the bottom Check build hides (Check again does the same). Accessibility: the photo is named "Your build, 2 problems marked" (or 1 / none), each problem reads as one sentence, the full-screen view has a labeled Close, closes on Escape and returns focus to the photo. Helpers live in `src/lib/issueBox.ts` and are tested by `npm test`.
- **Mistake boxes on the live camera too** (Sun Oct 25, ~4 AM): the boxes also draw over the live camera, not just the checked photo, so the builder sees them on the real bricks (swipe the card down for a clear view). The checked photo is the whole camera frame, so its 0-1 boxes map onto the video with the same object-cover transform. That only holds while the phone stays where it was for the check: if the view changes a lot (over 20% of a tiny camera sample, measured every 0.4 s against the sample taken with the photo), the boxes hide and say "The camera moved. Check again to mark the mistakes." They come back if the view returns.

## Prizes

- **Primary: Microsoft "Built for the Real World" / FDE.** Also Anthropic and Cartesia, which the build covers anyway. Visa only as an optional add-on. *(Sat Oct 24, ~1 AM)*
- **Open: whether Azure is required and Microsoft's exact criteria** — ask at the booth Saturday morning. *(Sat Oct 24)*

## Rules and references

- **All code is written during the event** (Cal Hacks rule). Reference repos are used for ideas only; no code copied. *(Sat Oct 24, ~1:30 AM)*
  - [FORGE](https://github.com/kaushikchaturvedula/FORGE) — ideas: grounding tool arguments against a known catalog; verbal confirmation for safety steps; auto-written work order.
  - [AR Technician Assistant](https://github.com/omer-izhaki/-ar-technician-assistant) — ideas: AI-placed highlight markers (box / point / arrow, with severity); captions for both sides; typed input fallback for loud rooms; mic level meter; end-of-session summary.
- ~~Passcode lock on the whole site~~ **Removed** (Sat Oct 24, ~12 PM): not worth the friction for the demo. The API key still never reaches the browser; a spending limit on the Anthropic key is the safeguard. *(added ~9:30 AM)*
- **Secrets live in `.env.local`** (git-ignored) and in Vercel's environment settings. Never committed. *(Sat Oct 24, ~1:30 AM)*

## Step Browser decisions

- **Step Browser state** *(Sat Oct 24)*: preview location, image, loading, and errors are separate from the active build location so browsing cannot change guidance, checks, voice, or part selection.
- **Exact step jumps** *(Sat Oct 24)*: a pending `{page, stepIdx}` is consumed by the active page-load effect for cross-page switches; same-page switches update the index directly.
- **Progress resume** *(Sat Oct 24)*: save the optional `Manual.stepIdx` with the active page; manuals saved before this change resume at index zero.
- **Step Browser tests** *(Sat Oct 24)*: Vitest with jsdom covers pure location logic and client interactions without keys or network calls.
- **Production build fallback** *(Sat Oct 24)*: use Next's supported Webpack build mode with Tailwind's PostCSS plugin so `npm run build` and local browser QA work when native SWC is unavailable; the Turbopack loader remains configured for environments that use it.

## AR Guide local branch

- **Scope and branch:** The 2D AR experiment lives on local `ar-guide`, created before merging the fetched `origin/main`. No push was made and local `main` was not changed. The prior frontend refinements were preserved in a branch commit before the merge.
- **Coordinate spaces:** `/api/locate` refers to the manual drawing; `/api/ar-guide` returns normalized coordinates in the captured camera JPEG. The JPEG preserves the video's aspect ratio. `arGeometry.ts` maps those points through the video's centered `object-cover` crop into CSS pixels and recomputes after resize or rotation. A manual hint, if used, is explicitly labeled as manual space.
- **Grounding and stability:** One Claude call compares previous and current manual states with a camera frame. `parseGuide` rejects malformed, tiny, huge, or spatially unjustified results. `arTracker` accepts a first assembly anchor only at high confidence, smooths agreement, and honors a user-pinned correction. The tiny camera sample detects substantial scene changes between model calls; it is scene-change sensing, not continuous object tracking. The request gate is at least four seconds apart and one request at a time; step and part keys and request IDs discard late replies. Existing `/api/check` stays the only step-verification flow.
- **Interaction:** The header toggles the guide. Cyan shows an accepted 2D part/placement suggestion; amber indicates uncertain, moved, or lost alignment. Rescan, part selection, tap-to-adjust, rotate, reset, and hide are available on the camera screen. The ghost is a flat outline sized from the part metadata. A user correction does not mark a step complete. Reduced-motion users get static outlines.
- **Local visual preview:** `AR_GUIDE_DEMO=1` returns a fixed, explicitly labeled **2D demo** overlay from `/api/ar-guide` without a Claude key. It demonstrates controls and screen composition over the live camera, and deliberately makes no claim that the boxes match physical parts. Unsetting the variable restores normal model grounding.
- **References:** [Bluebook](https://github.com/rishabhroyy/bluebook) inspired the distinction between model grounding and on-device tracking. [AR-Vision](https://github.com/catplotlib/AR-Vision) demonstrates camera calibration and 3D pose work that this browser-only guide does not perform. Neither checked repository exposed a LICENSE file at its root; no source code was copied. Implementation here is original TypeScript. The named UI libraries were not added because the existing Tailwind/Motion HUD already supports these controls; Playwright was added only for browser tests.
- **Limitations:** This is a single-image 2D suggestion, without depth, camera pose, object tracking, or 3D projection. Claude can misplace boxes; motion, occlusion, glare, and low light can make alignment fail. Scene-change sampling uses a small main-thread canvas and may not detect slow motion. The optional mat-plane homography was deferred until real-device alignment is measured; a plane mapping would not register raised components. Real-phone alignment was **not tested** here. A human should check box alignment on a mounted phone, portrait-to-landscape rotation, glare/low light, and recovery after bumping the stand, especially in iOS Safari.
- **Verification:** Existing lint, type check, tests, and production build passed locally. Pure AR tests cover mapping, validation, smoothing, expiry, scene change, throttling, and stale replies. The Playwright test uses a fake camera, prebuilt manual, and mocked guide/check endpoints at 390×844 and 844×390; it does not validate real Claude accuracy or hardware registration.

## Open questions

- [ ] Microsoft booth: Azure required? "Path to production" meaning? Credits for Claude on Foundry?
- [ ] Which LEGO set and IKEA piece; do both instruction PDFs download?
- [ ] Step-check risk test result (goal: 13 of 15 judged right).
- [ ] Team size and roles.

## Step detection says "It seems..."
When auto-detect moves you to another step, it now says "It seems you're on step 12. Going there now." (or "It seems step 8 needs fixing: ..."). The softer wording fits a best guess that jumps without asking.

## Mistake boxes on the checked photo
A failed step check now draws a numbered amber box on each wrong piece and lists every problem with its fix.
- Same `/api/check` call, no second request. The prompt asks for an optional `box` per issue as whole-number percentages (left/top/right/bottom) of the CAMERA image, plus a `kind`. `src/lib/issueBox.ts` validates them (finite, 0-100, at least 2% per side, at most 80% of the photo) and converts to 0-1 `{x, y, w, h}`. A bad box is dropped, its issue text stays. No boxes when `can_see` is false.
- Boxes go on the exact JPEG that was checked, never the live video. The old phone layout cropped that photo with `object-cover`, which would misplace boxes, so `CheckErrorOverlay` shows the whole photo with a wrapper sized to the image: percentages of the wrapper are percentages of the photo. Tested on 4:3, 16:9 and portrait cameras.
- A check result carries the step it ran on and is hidden on any other step. Answers from older checks are dropped, the auto-advance after a pass is canceled if the step changes, and automatic step detection pauses while a mistake is on screen. A mistake stays until Check again passes or the builder taps Close (Close never counts as fixed).
- Model boxes are a pointer, not a measurement: the confidence number isn't calibrated, and box accuracy with real answers still needs a phone test.

## Faster automatic step detection on phones
Every automatic "where am I?" check used to cut all step pictures out of their pages again (up to 160) and redraw 8 contact sheets, in one long block. On a phone that froze the screen for seconds every ~20 s (measured at 4x CPU slowdown: 60 fps dropped to 27 fps, 2.8 s of blocked main thread per 5 s).
- Step pictures are now cut once per page (one decode per page) at 160 px tall and shared by the step strip and "where am I?".
- Contact sheets are kept and only redrawn when their tiles change.
- The picture work yields between pages and before each JPEG encode, so frames keep coming.
After: about 60 fps through the whole check, worst 5 s window 188 ms of blocked main thread.

## Phones stay smooth while a book is read
Reading a not-pre-read manual in the background made phones stutter for the whole read (measured at 4x CPU slowdown on a 61-page PDF: 13 fps, 3 s of every 5 s blocked). The biggest cost was JPEG encoding with `toDataURL`, which runs on the main thread, for every page, its grid copy and its step thumbnails.
- `encodeCanvas` (`src/lib/encode.ts`) encodes with `toBlob` + FileReader instead: same data URLs, off the main thread.
- Phones read one page at a time with a 250 ms rest; the screen re-lists read pages at most every 2 s instead of re-rendering per page.
- Phones (coarse pointer) drop the frosted-glass blur on panels: over live video it's redone every frame, a GPU cost the test browser can't measure. Panels are a dark see-through fill instead.
- The camera asks for 1280x720 instead of 1920x1080 (photos for Claude are at most 896 px).
After: about 53 fps through the read, blocked time mostly 0.
## Jumping between steps doesn't flash the card
The step card used to be keyed to the step, so every step change faded the whole card out and a new one in, and the step strip inside it was rebuilt and slid across from step 1 to re-center. Jumping to a step on another page also showed the loading card first, even for pages already read.
- One card for all steps (keyed to the phase only); a step change updates it in place and just fades in the new instruction.
- Jumps from the strip or from automatic step detection to a page that's already read go straight there, no loading card.
- A strip that has just appeared jumps to the current step instead of sliding there.
