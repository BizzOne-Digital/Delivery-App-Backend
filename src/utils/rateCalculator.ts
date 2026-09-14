import type { IPharmacyRatePlan } from "../models/PharmacyRatePlan.js";

export interface RateSnapshot {
  planId: string;
  planName: string;
  currency: string;
  baseDeliveryFee: number;
  distanceKm: number;
  distanceFee: number;
  urgentSurcharge: number;
  afterHoursSurcharge: number;
  taxRate: number;
  taxAmount: number;
  totalClientCharge: number;
  calculatedAt: Date;
}

export function calculateRateSnapshot(
  plan: IPharmacyRatePlan,
  distanceKm: number,
  options: { urgent?: boolean; afterHours?: boolean } = {},
): RateSnapshot {
  const extraKm = Math.max(0, distanceKm - plan.includedDistanceKm);
  const distanceFee = extraKm * plan.perKmFee;
  const urgentSurcharge = options.urgent ? plan.urgentSurcharge : 0;
  const afterHoursSurcharge = options.afterHours ? plan.afterHoursSurcharge : 0;
  const subtotal =
    plan.baseDeliveryFee + distanceFee + urgentSurcharge + afterHoursSurcharge;
  const taxAmount = subtotal * (plan.taxRate / 100);
  const totalClientCharge = subtotal + taxAmount;

  return {
    planId: String(plan._id),
    planName: plan.name,
    currency: plan.currency,
    baseDeliveryFee: plan.baseDeliveryFee,
    distanceKm,
    distanceFee,
    urgentSurcharge,
    afterHoursSurcharge,
    taxRate: plan.taxRate,
    taxAmount,
    totalClientCharge,
    calculatedAt: new Date(),
  };
}
