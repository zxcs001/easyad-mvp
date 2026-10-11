// The app stores map positions as percentages of one fixed North America
// frame. This module owns that frame so that region data, search and the maps
// convert positions the same way.
export const mapBounds = {
  west: -170,
  east: -50,
  north: 75,
  south: 10,
};

export type PercentPoint = { x: number; y: number };

export function geoToMapPoint(latitude: number, longitude: number): PercentPoint {
  return {
    x: clamp(((longitude - mapBounds.west) / (mapBounds.east - mapBounds.west)) * 100, 0, 100),
    y: clamp(((mapBounds.north - latitude) / (mapBounds.north - mapBounds.south)) * 100, 0, 100),
  };
}

/** [longitude, latitude] for a stored percentage position. */
export function mapPointToLngLat(point: PercentPoint): [number, number] {
  return [
    mapBounds.west + (mapBounds.east - mapBounds.west) * (point.x / 100),
    mapBounds.north - (mapBounds.north - mapBounds.south) * (point.y / 100),
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
