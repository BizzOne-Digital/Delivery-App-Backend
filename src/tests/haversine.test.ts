import { describe, it, expect } from "vitest";
import { haversineKm, nearestNeighbourOrder } from "../utils/haversine.js";

describe("route fallback", () => {
  it("computes distance", () => {
    const d = haversineKm(43.65, -79.38, 43.66, -79.39);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(5);
  });

  it("orders stops nearest-neighbour", () => {
    const start = { latitude: 0, longitude: 0 };
    const stops = [
      { latitude: 0, longitude: 1 },
      { latitude: 0, longitude: 0.1 },
    ];
    const order = nearestNeighbourOrder(start, stops);
    expect(order[0]).toBe(1);
  });
});
