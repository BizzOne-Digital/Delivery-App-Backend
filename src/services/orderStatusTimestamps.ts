import type { IOrder } from "../models/Order.js";
import { OrderStatus } from "../types/enums.js";

const MAIN_FLOW: string[] = [
  OrderStatus.ACTION_REQUIRED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.ON_THE_WAY,
  OrderStatus.COMPLETED,
];

/** Ensure all prior main-flow steps + current have timestamps when status advances. */
export function mergeStatusTimestamps(order: IOrder, newStatus: string): Record<string, Date> {
  const now = new Date();
  const existing = { ...(order.statusTimestamps ?? {}) } as Record<string, Date>;
  const created = order.createdAt ?? now;

  if (newStatus === OrderStatus.CANCELLED) {
    return { ...existing, [newStatus]: now };
  }

  if (newStatus === OrderStatus.RETURNING) {
    const ts = { ...existing };
    const first = MAIN_FLOW[0]!;
    for (const s of MAIN_FLOW.slice(0, 4)) {
      if (!ts[s]) ts[s] = ts[first] ?? created;
    }
    if (!ts[OrderStatus.ON_THE_WAY]) ts[OrderStatus.ON_THE_WAY] = now;
    ts[OrderStatus.RETURNING] = now;
    return ts;
  }

  const idx = MAIN_FLOW.indexOf(newStatus);
  if (idx < 0) {
    return { ...existing, [newStatus]: now };
  }

  const ts = { ...existing };
  for (let i = 0; i <= idx; i++) {
    const key = MAIN_FLOW[i]!;
    if (!ts[key]) {
      const prev = i > 0 ? MAIN_FLOW[i - 1]! : undefined;
      ts[key] = i === 0 ? created : (prev && ts[prev] ? ts[prev] : now);
    }
  }
  ts[newStatus] = now;
  return ts;
}
