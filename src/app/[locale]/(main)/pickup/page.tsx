import { getActivePeriod, getMySubscription } from "@/lib/actions/subscription";
import { getMyPickups } from "@/lib/actions/pickup";
import { getMyMenuSelections } from "@/lib/actions/menu";
import { formatDateISO } from "@/lib/utils";
import { PickupView } from "./pickup-view";

export default async function PickupPage() {
  const period = await getActivePeriod();

  const today = new Date();
  const pastStart = new Date(today);
  pastStart.setDate(pastStart.getDate() - 30);

  const rangeStart = period?.delivery_start
    ? period.delivery_start < formatDateISO(pastStart)
      ? period.delivery_start
      : formatDateISO(pastStart)
    : formatDateISO(pastStart);

  const rangeEnd = period?.delivery_end
    ? period.delivery_end > formatDateISO(today)
      ? period.delivery_end
      : formatDateISO(today)
    : formatDateISO(today);

  const [pickups, selections] = await Promise.all([
    getMyPickups(rangeStart, rangeEnd),
    getMyMenuSelections(rangeStart, rangeEnd),
  ]);

  if (selections.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-muted-foreground">
        선택한 메뉴가 없습니다. 먼저 메뉴를 선택해주세요.
      </div>
    );
  }

  return (
    <PickupView
      pickups={pickups}
      selections={selections}
      deliveryStart={rangeStart}
      deliveryEnd={rangeEnd}
    />
  );
}
