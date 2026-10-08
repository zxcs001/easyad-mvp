#!/usr/bin/env node
// Builds the Ontario county-level gazetteer used by map search and location
// filtering. Source: Statistics Canada 2021 census division cartographic
// boundaries (Open Government Licence - Canada), as TopoJSON in the
// canadamaps project (Apache-2.0):
// https://raw.githubusercontent.com/pachadotdev/canadamaps/main/data_topojson/census_divisions.topojson
//
// Usage: node scripts/build-ontario-regions.cjs <census_divisions.topojson>
// Writes app/lib/geo/ontario-regions.ts and app/lib/geo/ontario-boundaries.ts.
const fs = require("node:fs");
const path = require("node:path");

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/build-ontario-regions.cjs <census_divisions.topojson>");
  process.exit(1);
}

const ONTARIO_PRUID = "35";
const SIMPLIFY_DEGREES = 0.01; // About 1 km. Enough for county membership.
const topology = JSON.parse(fs.readFileSync(source, "utf8"));
const arcs = topology.arcs;
const arc = (index) => (index >= 0 ? arcs[index] : arcs[~index].slice().reverse());
const round = (value) => Math.round(value * 1000) / 1000;

function simplify(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let best = -1;
    let bestIndex = -1;
    for (let i = a + 1; i < b; i += 1) {
      const [px, py] = points[i];
      const distance = length ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / length : Math.hypot(px - ax, py - ay);
      if (distance > best) { best = distance; bestIndex = i; }
    }
    if (best > epsilon) { keep[bestIndex] = true; stack.push([a, bestIndex], [bestIndex, b]); }
  }
  return points.filter((_, index) => keep[index]);
}

const kinds = {
  CTY: { kind: "County", label: (name) => `${name} County` },
  RM: { kind: "Regional municipality", label: (name) => `${name} Region` },
  DIS: { kind: "District", label: (name) => `${name} District` },
  DM: { kind: "District municipality", label: (name) => `District Municipality of ${name}` },
  UC: { kind: "United counties", label: (name) => `United Counties of ${name}` },
  CDR: { kind: "Single-tier municipality", label: (name) => name },
};

const regions = [];
const boundaries = {};
for (const geometry of topology.objects.census_divisions.geometries) {
  const properties = geometry.properties;
  if (String(properties.pruid) !== ONTARIO_PRUID) continue;
  const name = String(properties.cdname).split(" / ")[0];
  const kind = kinds[properties.cdtype] ?? { kind: "Census division", label: (value) => value };
  const id = `on-${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const polygons = geometry.type === "MultiPolygon" ? geometry.arcs : [geometry.arcs];
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  let area = 0; let cx = 0; let cy = 0;
  const rings = [];
  for (const polygon of polygons) {
    polygon.forEach((ringArcs, ringIndex) => {
      const points = ringArcs.flatMap((index) => arc(index));
      for (const [x, y] of points) {
        west = Math.min(west, x); east = Math.max(east, x); south = Math.min(south, y); north = Math.max(north, y);
      }
      if (ringIndex === 0) {
        let ringArea = 0; let sx = 0; let sy = 0;
        points.forEach(([x1, y1], index) => {
          const [x2, y2] = points[(index + 1) % points.length];
          const cross = x1 * y2 - x2 * y1;
          ringArea += cross; sx += (x1 + x2) * cross; sy += (y1 + y2) * cross;
        });
        if (ringArea) { area += ringArea / 2; cx += sx / 6; cy += sy / 6; }
      }
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      const tiny = Math.max(...xs) - Math.min(...xs) < SIMPLIFY_DEGREES * 3 && Math.max(...ys) - Math.min(...ys) < SIMPLIFY_DEGREES * 3;
      const simplified = simplify(points, SIMPLIFY_DEGREES);
      if (!tiny && simplified.length >= 4) rings.push(simplified.map(([x, y]) => [round(x), round(y)]));
    });
  }
  regions.push({
    id,
    uid: String(properties.cduid),
    name,
    label: kind.label(name),
    kind: kind.kind,
    center: area ? [round(cx / area), round(cy / area)] : [round((west + east) / 2), round((south + north) / 2)],
    bounds: [round(west), round(south), round(east), round(north)],
  });
  boundaries[id] = rings;
}

regions.sort((a, b) => a.name.localeCompare(b.name));
const union = regions.reduce((box, region) => [
  Math.min(box[0], region.bounds[0]), Math.min(box[1], region.bounds[1]),
  Math.max(box[2], region.bounds[2]), Math.max(box[3], region.bounds[3]),
], [Infinity, Infinity, -Infinity, -Infinity]);

const header = "// Generated by scripts/build-ontario-regions.cjs. Do not edit by hand.\n// Source: Statistics Canada 2021 census division cartographic boundaries\n// (Open Government Licence - Canada), via the canadamaps project.\n";
const out = path.join(__dirname, "..", "app", "lib", "geo");
fs.writeFileSync(path.join(out, "ontario-regions.ts"), `${header}import type { RawRegion } from "./regions";\n\n// [west, south, east, north] in degrees.\nexport const ONTARIO_BOUNDS = ${JSON.stringify(union)} as const;\n\nexport const ontarioCensusDivisions: RawRegion[] = [\n${regions.map((region) => `  ${JSON.stringify(region)},`).join("\n")}\n];\n`);
fs.writeFileSync(path.join(out, "ontario-boundaries.ts"), `${header}// Outer and inner rings per region, simplified to about 1 km, as [lng, lat].\n// Loaded on demand: only location filtering needs it.\nexport const ontarioBoundaries: Record<string, number[][][]> = ${JSON.stringify(boundaries)};\n`);
console.log(`Wrote ${regions.length} Ontario census divisions.`);
