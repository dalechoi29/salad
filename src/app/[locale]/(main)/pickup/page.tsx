import { getSubscriptionPeriods } from "@/lib/actions/subscription";
import { getMyPickups } from "@/lib/actions/pickup";
import { getMyMenuSelections, getDailyMenusByDates } from "@/lib/actions/menu";
import { getMyDeliveryDateStrings } from "@/lib/actions/delivery";
import { formatDateISO, getKSTDate } from "@/lib/utils";
import { PickupView } from "./pickup-view";

export default async function PickupPage() {
  const allPeriods = await getSubscriptionPeriods();

  const today = getKSTDate();
  const todayISO = formatDateISO(today);

  let rangeStart = todayISO;
  let rangeEnd = todayISO;

  for (const p of allPeriods) {
    if (p.delivery_start && p.delivery_start < rangeStart) rangeStart = p.delivery_start;
    if (p.delivery_end && p.delivery_end > rangeEnd) rangeEnd = p.delivery_end;
  }

  const [pickups, selections, myDeliveryDates] = await Promise.all([
    getMyPickups(rangeStart, rangeEnd),
    getMyMenuSelections(rangeStart, rangeEnd),
    getMyDeliveryDateStrings(),
  ]);

  const selectionDateSet = new Set(selections.map((s) => s.delivery_date));
  const unselectedDates = myDeliveryDates.filter(
    (d) => d >= rangeStart && d <= todayISO && !selectionDateSet.has(d)
  );

  const unselectedMenusMap = await getDailyMenusByDates(unselectedDates);

  if (selections.length === 0 && unselectedDates.length === 0) {
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
      unselectedMenusMap={unselectedMenusMap}
      todayStr={todayISO}
    />
  );
}
