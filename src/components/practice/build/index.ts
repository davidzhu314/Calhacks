// Builds any practice part as a three.js group, with the given materials (solid, ghost or thumbnail).

import * as THREE from "three";
import type { PartSpec } from "../engine";
import { axle, axleConnector, barPlate, brick, halfRoundPlate, roundBrick, roundPlate, slope45 } from "./lego";
import type { MaterialFor } from "./materials";
import { dimm, gpu, motherboard, nic, plug } from "./pc";

export function buildPart(spec: PartSpec, mat: MaterialFor): THREE.Group {
  switch (spec.kind) {
    case "legoBrick":
      return brick(spec.studsX, spec.studsZ, spec.plates, spec.color, mat);
    case "legoRoundBrick":
      return roundBrick(spec.color, mat);
    case "legoRoundPlate":
      return roundPlate(spec.studs, spec.color, !!spec.hole, mat, { axleHole: spec.axleHole, tile: spec.tile });
    case "legoAxle":
      return axle(spec.length, spec.color, mat);
    case "legoAxleConnector":
      return axleConnector(spec.color, mat);
    case "assembly": {
      const g = new THREE.Group();
      for (const c of spec.parts) {
        const child = buildPart(c.spec, mat);
        child.position.y = c.y;
        child.rotation.y = c.rotY ?? 0;
        g.add(child);
      }
      g.name = "assembly";
      return g;
    }
    case "legoHalfRound":
      return halfRoundPlate(spec.studs, spec.color, mat);
    case "legoSlope45":
      return slope45(spec.color, mat);
    case "legoBarPlate":
      return barPlate(spec.color, mat);
    case "motherboard":
      return motherboard(mat);
    case "dimm":
      return dimm(spec.variant, mat);
    case "gpu":
      return gpu(mat);
    case "nic":
      return nic(mat);
    case "plug":
      return plug(spec.variant, mat);
  }
}
