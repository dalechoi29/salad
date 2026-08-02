/**
 * Paid delivery days used for billing (matches /subscription pricing).
 * `total_delivery_days` should store paid-only days; this handles legacy rows
 * where it was set to selected date count or left null.
 */
export function getPaidDeliveryDaysForBilling(input: {
  totalDeliveryDays: number | null;
  frequencyPerWeek: number;
  carryoverDeliveryDays: number;
  selectedDeliveryDayCount?: number;
}): number {
  const carryover = Math.max(0, input.carryoverDeliveryDays);

  // When actual selected dates are known, mirror /subscription: free carryover
  // days are part of the selection and reduce what is paid.
  if (input.selectedDeliveryDayCount !== undefined) {
    return Math.max(0, input.selectedDeliveryDayCount - carryover);
  }

  const stored = input.totalDeliveryDays;
  if (stored !== null && stored !== undefined) {
    if (carryover > 0 && stored <= carryover) {
      return 0;
    }
    return stored;
  }

  return Math.max(0, input.frequencyPerWeek) * 4;
}

export function getSubscriptionPrice(input: {
  paidDeliveryDays: number;
  saladsPerDelivery: number;
  pricePerSalad: number;
  carryoverDeliveryDays?: number;
}): { price: number; originalPrice: number | null } {
  const salads = input.saladsPerDelivery;
  const pricePerSalad = input.pricePerSalad;
  const carryover = input.carryoverDeliveryDays ?? 0;
  const price = input.paidDeliveryDays * salads * pricePerSalad;
  const originalPrice =
    carryover > 0 && pricePerSalad > 0
      ? (input.paidDeliveryDays + carryover) * salads * pricePerSalad
      : null;
  return { price, originalPrice };
}
