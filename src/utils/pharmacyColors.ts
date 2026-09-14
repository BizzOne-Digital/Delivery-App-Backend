export const DEFAULT_PHARMACY_PALETTE = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#EF4444",
  "#84CC16",
];

export function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{6})$/.test(color);
}

export function colorsTooSimilar(a: string, b: string): boolean {
  const parse = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const c1 = parse(a);
  const c2 = parse(b);
  const dist = Math.sqrt(
    (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2,
  );
  return dist < 40;
}
