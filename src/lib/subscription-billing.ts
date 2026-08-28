/** Paid days from the dates the subscriber actually chose, minus free carryover. */
export function getPaidDeliveryDaysFromSelection(
  selectedDeliveryDayCount: number,
  carryoverDeliveryDays: number
): number {
  return Math.max(
    0,
    selectedDeliveryDayCount - Math.max(0, carryoverDeliveryDays)
  );
}

/**
 * Paid delivery days used for billing (matches /subscription pricing).
 * `total_delivery_days` should store paid-only days; this handles legacy rows
 * where it was set to selected date count or left null.
 *
 * When selected dates are known:
 * - never bill *less* than selected − carryover (fixes undercharge when a
 *   weekday occurs more often than the cheapest same-frequency preset)
 * - never bill *less* than stored paid days (vacation skips shrink dates)
 */
export function getPaidDeliveryDaysForBilling(input: {
  totalDeliveryDays: number | null;
  frequencyPerWeek: number;
  carryoverDeliveryDays: number;
  selectedDeliveryDayCount?: number;
}): number {
  const carryover = Math.max(0, input.carryoverDeliveryDays);
  const stored = input.totalDeliveryDays;

  if (input.selectedDeliveryDayCount !== undefined) {
    const fromSelection = getPaidDeliveryDaysFromSelection(
      input.selectedDeliveryDayCount,
      carryover
    );
    if (stored !== null && stored !== undefined) {
      return Math.max(stored, fromSelection);
    }
    return fromSelection;
  }

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
