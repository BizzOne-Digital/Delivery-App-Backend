const R = 6371;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Nearest-neighbour ordering (local estimate, no live traffic). */
export function nearestNeighbourOrder(start: LatLng, stops: LatLng[]): number[] {
  const remaining = stops.map((_, i) => i);
  const order: number[] = [];
  let current = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const idx = remaining[i]!;
      const stop = stops[idx]!;
      const d = haversineKm(current.latitude, current.longitude, stop.latitude, stop.longitude);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const picked = remaining.splice(bestIdx, 1)[0]!;
    order.push(picked);
    current = stops[picked]!;
  }
  return order;
}
