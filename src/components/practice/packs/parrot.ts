// LEGO 31136 Exotic Parrot, book 1, steps 1–10: the base, then the tree trunk. 18 placements.
// Parts and colours follow the pre-read manual (public/steps/6455750.json, pages 5–7), with each colour mapped
// to the official LEGO colour (see PARROT_DATA_COLORS, checked by scripts/test-practice.mjs).
// Steps 6–9 build the trunk as a separate sub-assembly on an axle, lying on its side (as the manual draws it), in a
// workspace in front of the base; step 10 stands the whole trunk up on the base, connector at the top.
//
// Layout (mm): the two 4x8 half-round plates make an 8x8 circle centred on the origin, studs on the 8 mm grid
// at ±4, ±12, ±20, ±28. Heights stack in plate units: plates 0–3.2, brick and slopes 3.2–12.8, tan plate 12.8–16.0,
// bar plate 16.0–19.2, top brick 19.2–28.8.

import { LEGO, axleLength } from "../dims";
import { LEGO_COLORS } from "../colors";
import type { Pack, Part, PartSpec, Placement, Vec3 } from "../engine";

const C = LEGO_COLORS;
const P = LEGO.PLATE_H;

const parts: Record<string, Part> = {
  halfPlate: { id: "halfPlate", name: "bright green half-round plate", label: "Half-round 4x8", detail: "Bright Green", spec: { kind: "legoHalfRound", studs: 8, color: C.brightGreen.hex } },
  halfPlateDark: {
    id: "halfPlateDark",
    name: "dark green half-round plate",
    label: "Half-round 4x8",
    detail: "Dark Green",
    spec: { kind: "legoHalfRound", studs: 8, color: C.darkGreen.hex },
    wrongHint: "Right shape, wrong green. The base is bright green.",
  },
  roundPlate4Green: {
    id: "roundPlate4Green",
    name: "4x4 round plate",
    label: "Round plate 4x4",
    detail: "Bright Green",
    spec: { kind: "legoRoundPlate", studs: 4, color: C.brightGreen.hex },
    wrongHint: "That's a 4x4 round plate, half the size. The base is the big half-circle.",
  },
  roundBrick: { id: "roundBrick", name: "2x2 round brick", label: "Round brick 2x2", detail: "Reddish Brown", spec: { kind: "legoRoundBrick", color: C.reddishBrown.hex } },
  squareBrick: {
    id: "squareBrick",
    name: "2x2 square brick",
    label: "Brick 2x2",
    detail: "Reddish Brown",
    spec: { kind: "legoBrick", studsX: 2, studsZ: 2, plates: 3, color: C.reddishBrown.hex },
  },
  roundPlate2Brown: {
    id: "roundPlate2Brown",
    name: "2x2 round plate",
    label: "Round plate 2x2",
    detail: "Reddish Brown",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.reddishBrown.hex },
  },
  slope: { id: "slope", name: "dark green 2x2 slope", label: "Slope 45° 2x2", detail: "Dark Green", spec: { kind: "legoSlope45", color: C.darkGreen.hex } },
  slopeBright: {
    id: "slopeBright",
    name: "bright green 2x2 slope",
    label: "Slope 45° 2x2",
    detail: "Bright Green",
    spec: { kind: "legoSlope45", color: C.brightGreen.hex },
    wrongHint: "Close, but that slope is bright green. Use the dark green ones.",
  },
  brickDarkGreen: {
    id: "brickDarkGreen",
    name: "dark green 2x2 brick",
    label: "Brick 2x2",
    detail: "Dark Green",
    spec: { kind: "legoBrick", studsX: 2, studsZ: 2, plates: 3, color: C.darkGreen.hex },
    wrongHint: "That's a plain 2x2 brick. This step needs the one with a sloped side.",
  },
  tanPlate: { id: "tanPlate", name: "tan 4x4 round plate", label: "Round plate 4x4", detail: "Tan · with hole", spec: { kind: "legoRoundPlate", studs: 4, color: C.tan.hex, hole: true } },
  tanPlate2: {
    id: "tanPlate2",
    name: "tan 2x2 round plate",
    label: "Round plate 2x2",
    detail: "Tan",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.tan.hex },
    wrongHint: "That's the small 2x2 round plate. You need the 4x4 one with the hole.",
  },
  darkTanPlate: {
    id: "darkTanPlate",
    name: "dark tan 4x4 round plate",
    label: "Round plate 4x4",
    detail: "Dark Tan · with hole",
    spec: { kind: "legoRoundPlate", studs: 4, color: C.darkTan.hex, hole: true },
    wrongHint: "That one's dark tan. This step uses the lighter tan plate.",
  },
  barPlate: { id: "barPlate", name: "round plate with four bars", label: "Round 2x2 + bars", detail: "Reddish Brown", spec: { kind: "legoBarPlate", color: C.reddishBrown.hex } },
  barPlateGray: {
    id: "barPlateGray",
    name: "dark grey round plate with bars",
    label: "Round 2x2 + bars",
    detail: "Dark Bluish Gray",
    spec: { kind: "legoBarPlate", color: C.darkBluishGray.hex },
    wrongHint: "Right shape, wrong colour. The tree trunk is reddish brown.",
  },
  tile: {
    id: "tile",
    name: "tan 2x2 round tile with hole",
    label: "Round tile 2x2",
    detail: "Tan · with hole",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.tan.hex, hole: true, tile: true },
  },
  tanPlate2Studs: {
    id: "tanPlate2Studs",
    name: "tan 2x2 round plate",
    label: "Round plate 2x2",
    detail: "Tan · studs",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.tan.hex },
    wrongHint: "That one has studs on top. You need the smooth tile with a hole.",
  },
  tileDarkTan: {
    id: "tileDarkTan",
    name: "dark tan round tile",
    label: "Round tile 2x2",
    detail: "Dark Tan · with hole",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.darkTan.hex, hole: true, tile: true },
    wrongHint: "Right shape, but that tile is dark tan. Use the lighter tan one.",
  },
  axle9: { id: "axle9", name: "length 9 axle with connector", label: "Axle 9 + connector", detail: "Grey · Reddish Brown", spec: axleWithConnector(9, C.reddishBrown.hex) },
  axle7: {
    id: "axle7",
    name: "length 7 axle with connector",
    label: "Axle 7 + connector",
    detail: "Grey · Reddish Brown",
    spec: axleWithConnector(7, C.reddishBrown.hex),
    wrongHint: "That axle is only 7 long. The manual's circle says 9: hold it against the 1:1 drawing to check.",
  },
  axle9Gray: {
    id: "axle9Gray",
    name: "axle with a grey connector",
    label: "Axle 9 + connector",
    detail: "Grey · Light Gray",
    spec: axleWithConnector(9, C.lightBluishGray.hex),
    wrongHint: "Right axle, wrong connector: this step uses the reddish-brown one.",
  },
  grayPlate: {
    id: "grayPlate",
    name: "dark grey 2x2 round plate",
    label: "Round plate 2x2",
    detail: "Dark Bluish Gray",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.darkBluishGray.hex, axleHole: true },
  },
  blackPlate: {
    id: "blackPlate",
    name: "black 2x2 round plate",
    label: "Round plate 2x2",
    detail: "Black",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.black.hex, axleHole: true },
    wrongHint: "That one's black. The step uses the dark bluish grey round plate.",
  },
  lightGrayPlate: {
    id: "lightGrayPlate",
    name: "light grey 2x2 round plate",
    label: "Round plate 2x2",
    detail: "Light Bluish Gray",
    spec: { kind: "legoRoundPlate", studs: 2, color: C.lightBluishGray.hex, axleHole: true },
    wrongHint: "That's the light grey one. This step needs the darker grey plate.",
  },
};

// ---------- the trunk (steps 6–10) ----------
// Positions along the trunk, measured up from its bottom face (where it meets the base in step 10).
// Bottom to top: dark grey plate, brick, bar plate, brick, brick, tile, connector; the 9L axle runs through all of
// them and 25.6 mm below, ending on the base plate's top face once the trunk is mounted.
export const TRUNK = {
  gray: 0,
  brick3: P,
  bars: 4 * P,
  brick2: 5 * P,
  brick1: 8 * P,
  tile: 11 * P,
  axle: -8 * P, // axle bottom end
  connectorOnAxle: axleLength(9) - 7.8, // the axle reaches 7.8 mm into the connector
  mountY: 9 * P, // step 10: the trunk sits on the round brick from step 5 (top at 28.8 mm)
};

function axleWithConnector(length: number, connector: string): PartSpec {
  const a = axleLength(length);
  return {
    kind: "assembly",
    parts: [
      { spec: { kind: "legoAxle", length, color: C.lightBluishGray.hex }, y: 0 },
      { spec: { kind: "legoAxleConnector", color: connector }, y: a - 7.8 },
    ],
  };
}

// The workspace: the trunk lies along x in front of the base, connector end at -x (as the manual shows it),
// its axis 16 mm above the table so the bars clear it.
const WS = { x: 14.4, y: 16, z: 72 };
const SIDEWAYS: Vec3 = [0, 0, Math.PI / 2]; // the part's up (+y) points along -x
const ws = (t: number): Vec3 => [WS.x - t, WS.y, WS.z];
const WS_FOCUS = { target: [WS.x - 14, WS.y, WS.z - 10] as Vec3, distance: 175 };

parts.trunk = {
  id: "trunk",
  name: "finished trunk",
  label: "Trunk",
  detail: "Steps 6–9",
  spec: {
    kind: "assembly",
    parts: [
      { spec: parts.grayPlate.spec, y: TRUNK.gray },
      { spec: parts.roundBrick.spec, y: TRUNK.brick3 },
      { spec: parts.barPlate.spec, y: TRUNK.bars },
      { spec: parts.roundBrick.spec, y: TRUNK.brick2 },
      { spec: parts.roundBrick.spec, y: TRUNK.brick1 },
      { spec: parts.tile.spec, y: TRUNK.tile },
      { spec: parts.axle9.spec, y: TRUNK.axle },
    ],
  },
};

const trunkPiece = (id: string, part: string, decoys: string[], t: number, step: number, title: string, say: string, stuck: string): Placement => ({
  id,
  part,
  decoys,
  pos: ws(t),
  rotY: 0,
  symmetry: 0,
  tilt: SIDEWAYS,
  lockRotation: true,
  spawn: [ws(t)[0] + 50, WS.y, WS.z + 18],
  snap: { kind: "grid", pitch: LEGO.PITCH },
  step,
  title,
  say,
  stuck,
  motion: "drop",
  focus: WS_FOCUS,
});

const SLOPE_ROT = "Turn the slope so its studs face the round brick and the slope runs down towards the edge.";
const SLOPE_STUCK = "The slope sits right against the round brick: studs on the inside, slope facing out to the edge of the base.";

const slope = (id: string, pos: [number, number], rotY: number, say: string): Placement => ({
  id,
  part: "slope",
  decoys: ["brickDarkGreen", "slopeBright"],
  pos: [pos[0], P, pos[1]],
  rotY,
  symmetry: 1,
  startRotY: 0,
  snap: { kind: "grid", pitch: LEGO.PITCH },
  step: 3,
  title: "Dark green slopes",
  say,
  stuck: SLOPE_STUCK,
  rotHint: SLOPE_ROT,
  motion: "drop",
});

const placements: Placement[] = [
  {
    id: "half-a",
    part: "halfPlate",
    decoys: ["halfPlateDark", "roundPlate4Green"],
    pos: [0, 0, 0],
    rotY: 0,
    symmetry: 1,
    startRotY: 0,
    snap: { kind: "grid", pitch: LEGO.PITCH },
    step: 1,
    title: "Half-round base",
    say: "Step 1. Find the bright green half-round plate and lay it flat on the outline, straight edge towards you.",
    stuck: "It's the big bright green half-circle. Lay it flat inside the outline with the straight edge facing you.",
    rotHint: "Turn it so the straight edge faces you.",
    motion: "drop",
  },
  {
    id: "brick-1",
    part: "roundBrick",
    decoys: ["squareBrick", "roundPlate2Brown"],
    pos: [0, P, 0],
    rotY: 0,
    symmetry: 0,
    snap: { kind: "grid", pitch: LEGO.PITCH },
    step: 1,
    title: "Round brick on the edge",
    say: "Now the reddish-brown 2x2 round brick. Press it onto the middle of the straight edge, half of it hanging over.",
    stuck: "Put the round brick at the centre of the straight edge: two studs on the plate, two hanging off. It will hold the second half.",
    motion: "drop",
  },
  {
    id: "half-b",
    part: "halfPlate",
    decoys: ["roundPlate4Green", "halfPlateDark"],
    pos: [0, 0, 0],
    rotY: Math.PI,
    symmetry: 1,
    startRotY: 0,
    snap: { kind: "grid", pitch: LEGO.PITCH },
    step: 2,
    title: "Close the circle",
    say: "Step 2. Take the second bright green half-round plate, turn it around, and push it under the overhang to close the circle.",
    stuck: "Turn the half-circle so the two straight edges meet, then slide it under the round brick's overhanging studs.",
    rotHint: "Turn it around so the two straight edges meet.",
    motion: "drop",
  },
  slope("slope-front", [0, 16], 0, "Step 3. Four dark green 2x2 slopes go around the round brick: studs in, slopes out. Start with the one in front."),
  slope("slope-right", [16, 0], Math.PI / 2, "Next slope on the right side. Turn it so the slope faces out."),
  slope("slope-back", [0, -16], Math.PI, "Now the slope at the back, sloping away from you."),
  slope("slope-left", [-16, 0], -Math.PI / 2, "Last slope, on the left."),
  {
    id: "tan-plate",
    part: "tanPlate",
    decoys: ["tanPlate2", "darkTanPlate"],
    pos: [0, 4 * P, 0],
    rotY: 0,
    symmetry: 0,
    snap: { kind: "grid", pitch: LEGO.PITCH },
    step: 4,
    title: "Tan round plate",
    say: "Step 4. Cap it with the tan 4x4 round plate, the one with a hole, centred over the slopes.",
    stuck: "Centre the tan round plate on top: it rests on the round brick and the inner studs of all four slopes.",
    motion: "drop",
  },
  {
    id: "bar-plate",
    part: "barPlate",
    decoys: ["roundPlate2Brown", "barPlateGray"],
    pos: [0, 5 * P, 0],
    rotY: 0,
    symmetry: 4,
    snap: { kind: "grid", pitch: LEGO.PITCH },
    step: 5,
    title: "Round plate with bars",
    say: "Step 5. Press the reddish-brown round plate with four bars onto the centre of the tan plate, bars pointing up.",
    stuck: "It goes dead centre on the tan plate, on the four studs around the hole, with the bars sticking up.",
    motion: "drop",
  },
  {
    id: "brick-2",
    part: "roundBrick",
    decoys: ["squareBrick", "roundPlate2Brown"],
    pos: [0, 6 * P, 0],
    rotY: 0,
    symmetry: 0,
    snap: { kind: "grid", pitch: LEGO.PITCH },
    step: 5,
    title: "Round brick between the bars",
    say: "Last one: another reddish-brown 2x2 round brick, pushed down between the four bars.",
    stuck: "Drop the round brick straight down in the middle, between the bars, onto the plate's four studs.",
    motion: "drop",
  },
  trunkPiece(
    "t-brick1",
    "roundBrick",
    ["squareBrick", "roundPlate2Brown"],
    TRUNK.brick1,
    6,
    "Start the trunk",
    "Step 6. Now the trunk, built in your hand. Take a reddish-brown 2x2 round brick, lying on its side like in the manual.",
    "The trunk is built separately, in front of the base. Put the round brick on the outline there, studs pointing left.",
  ),
  trunkPiece(
    "t-tile",
    "tile",
    ["tanPlate2Studs", "tileDarkTan"],
    TRUNK.tile,
    6,
    "Tile with hole",
    "Press the tan round tile with a hole onto the brick's studs. It's smooth on top.",
    "The tan tile goes on the stud end of the round brick, the left side here. Pick the smooth one with the hole.",
  ),
  trunkPiece(
    "t-axle",
    "axle9",
    ["axle7", "axle9Gray"],
    TRUNK.axle,
    7,
    "Axle and connector",
    "Step 7. Slide the length 9 axle into the reddish-brown connector, then push the connector into the hole in the tile, so the axle runs out through the brick.",
    "Check the length against the manual's 1:1 drawing: the circled 9. The connector end goes into the tile; the long grey end sticks out the other side.",
  ),
  trunkPiece(
    "t-brick2",
    "roundBrick",
    ["squareBrick", "roundPlate2Brown"],
    TRUNK.brick2,
    8,
    "Second trunk brick",
    "Step 8. Slide another round brick onto the grey axle, studs first, up against the first one.",
    "It slides on from the open end of the axle, the right side, studs towards the first brick.",
  ),
  trunkPiece(
    "t-bars",
    "barPlate",
    ["roundPlate2Brown", "barPlateGray"],
    TRUNK.bars,
    8,
    "Bars on the trunk",
    "Now the round plate with four bars, studs first, bars pointing back along the trunk.",
    "Same piece as step 5. It slides onto the axle after the second brick, with the bars pointing towards the connector end.",
  ),
  trunkPiece(
    "t-brick3",
    "roundBrick",
    ["squareBrick", "roundPlate2Brown"],
    TRUNK.brick3,
    9,
    "Third trunk brick",
    "Step 9. One more round brick onto the axle, against the bar plate.",
    "Slide it on from the open end, studs first, until it presses into the bar plate.",
  ),
  trunkPiece(
    "t-gray",
    "grayPlate",
    ["blackPlate", "lightGrayPlate"],
    TRUNK.gray,
    9,
    "Dark grey plate",
    "Finish the trunk with the dark grey 2x2 round plate at the end.",
    "It's the dark bluish grey round plate, not the black or light grey one. It caps the open end of the trunk.",
  ),
  {
    id: "mount",
    part: "trunk",
    decoys: [],
    pos: [0, TRUNK.mountY, 0],
    rotY: 0,
    symmetry: 0,
    lockRotation: true,
    spawn: [ws(20)[0] + 30, TRUNK.mountY, WS.z - 20],
    snap: { kind: "grid", pitch: LEGO.PITCH },
    step: 10,
    title: "Stand the trunk up",
    say: "Step 10. Stand the finished trunk up, connector at the top, and push it down onto the centre of the base. The axle goes all the way through.",
    stuck: "Hold the trunk upright with the brown connector at the top, and push the axle end down into the round brick in the middle of the base.",
    done: "That's the tree trunk standing on its base.",
    motion: "drop",
    consumes: ["t-brick1", "t-tile", "t-axle", "t-brick2", "t-bars", "t-brick3", "t-gray"],
    focus: { target: [0, 34, 10], distance: 300 },
  },
];

export const parrot: Pack = {
  id: "parrot",
  title: "Exotic Parrot",
  subtitle: "LEGO 31136 · Book 1, steps 1–10",
  parts,
  placements,
  camera: { target: [0, 6, 0], distance: 235, polar: 0.98, azimuth: 0.42, fov: 32, minDistance: 50, maxDistance: 420 },
  stage: { radius: 110, shadowFar: 70 },
  spawn: [40, 0, 40],
  lift: 16,
  rotateStep: Math.PI / 2,
  intro: "Let's practise the parrot's tree: the base, then the trunk. Pick the right part from the tray, then drag it onto the glowing outline.",
  finish: { title: "You're ready to build it for real", body: "That's the parrot's tree: the base and the trunk, steps 1 to 10, with every part where it belongs." },
};

/** Which part of the pre-read manual each practice part comes from (page, step, part index), for the colour check. */
export const PARROT_DATA_COLORS: { page: string; step: number; part: number; partId: string }[] = [
  { page: "5", step: 1, part: 0, partId: "roundBrick" },
  { page: "5", step: 1, part: 1, partId: "halfPlate" },
  { page: "5", step: 2, part: 0, partId: "halfPlate" },
  { page: "6", step: 3, part: 0, partId: "slope" },
  { page: "7", step: 4, part: 0, partId: "tanPlate" },
  { page: "7", step: 5, part: 0, partId: "roundBrick" },
  { page: "7", step: 5, part: 1, partId: "barPlate" },
  { page: "8", step: 6, part: 0, partId: "roundBrick" },
  { page: "8", step: 6, part: 1, partId: "tile" },
  { page: "9", step: 8, part: 0, partId: "roundBrick" },
  { page: "9", step: 8, part: 1, partId: "barPlate" },
  { page: "9", step: 9, part: 0, partId: "grayPlate" },
];
