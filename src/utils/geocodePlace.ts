/** Best-effort geocode for pharmacy onboarding (OpenStreetMap Nominatim). */
export async function geocodePlace(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (q.length < 4) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "JustDeliveryApp/1.0 (pharmacy-onboarding)",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat?: string; lon?: string }[];
    const hit = data?.[0];
    if (!hit?.lat || !hit.lon) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
