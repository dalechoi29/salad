import { getActivePeriod, getMySubscription } from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { getHolidays } from "@/lib/actions/holiday";
import { DeliveryDaySelector } from "./delivery-day-selector";

export default async function DeliveryPage() {
  const period = await getActivePeriod();

  if (!period) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-muted-foreground">
        활성화된 구독 기간이 없습니다
      </div>
    );
  }

  const subscription = await getMySubscription(period.id);

  if (!subscription) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center text-muted-foreground">
        먼저 구독을 신청해주세요
      </div>
    );
  }

  const now = new Date();
  const [deliveryDays, holidays] = await Promise.all([
    getMyDeliveryDays(subscription.id),
    getHolidays(now.getFullYear()),
  ]);

  return (
    <DeliveryDaySelector
      subscription={subscription}
      deliveryDays={deliveryDays}
      holidays={holidays}
      periodMonth={period.target_month}
      deliveryStart={period.delivery_start}
      deliveryEnd={period.delivery_end}
    />
  );
}
