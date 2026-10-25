# BuildSight interface system

BuildSight is a camera-guided assembly tool. The interface keeps the camera and current instruction in view while making a manual easy to start or resume.

## Visual language

- **Palette:** near-black navy background (`--ui-bg`), layered navy surfaces (`--ui-surface`, `--ui-surface-raised`), cool white text (`--ui-text`), muted blue-gray secondary text (`--ui-muted`), and one cyan action color (`--ui-accent`). Amber, mint, and rose are reserved for caution, success, and errors.
- **Type:** Geist for instructions and controls; Geist Mono for short labels, progress, and technical metadata. Display headlines use a tight tracking and large size; body text stays at 14–18 px.
- **Spacing:** an 8 px rhythm. Content uses 16–32 px internal padding, 12–16 px gaps between related controls, and larger 48–64 px breaks between sections.
- **Layout:** a 1280 px maximum library width, a two-column start area on desktop, and a single-column start area on phones. The build screen keeps its full-screen camera with floating manual, voice, and instruction surfaces.
- **Shape and elevation:** 12 px control radii, 18 px card radius, quiet hairline borders, and soft shadows. Cyan glow is used only for the main action or an active status.
- **Motion:** 180–300 ms feedback for hover and state changes; short entry transitions for major surfaces. Respect reduced-motion preferences.

## Component rules

`ui-primary` is for the next action: start or continue a build, or check the current step. `ui-secondary` is for supporting actions. `ui-card` provides the shared raised surface, `ui-kicker` labels a section, and `ui-empty` frames empty results. These classes and color tokens live in `src/app/globals.css`.

The multi-book picker uses Radix Dialog for focus management, keyboard dismissal, and screen reader labels. Existing Motion transitions are retained for state changes. Product photos and manual images are real catalog/manual assets; unavailable images receive a labeled fallback.
