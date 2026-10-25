import { validPlacement, type Placement } from "./buildFrame";

export type PlacementCatalog = { reference: string; points: [{ x: number; y: number }, { x: number; y: number }]; steps: Record<string, Placement> };
const cache = new Map<string, Promise<PlacementCatalog | null>>();

export function loadPlacements(pdfPath: string): Promise<PlacementCatalog | null> {
  const id = pdfPath.match(/(\d+)\.pdf(?:$|\?)/)?.[1];
  if (!id) return Promise.resolve(null);
  let job = cache.get(id);
  if (!job) {
    job = fetch(`/steps/${id}.placements.json`).then(async (response) => {
      if (!response.ok) return null;
      const data = await response.json() as Partial<PlacementCatalog>;
      if (!data || typeof data.reference !== "string" || !Array.isArray(data.points) || data.points.length !== 2 || !data.steps) return null;
      return { reference: data.reference, points: data.points as PlacementCatalog["points"], steps: Object.fromEntries(Object.entries(data.steps).filter((entry) => validPlacement(entry[1]))) };
    }).catch(() => null);
    cache.set(id, job);
  }
  return job;
}
