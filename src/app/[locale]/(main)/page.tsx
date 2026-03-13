import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Salad,
  CalendarCheck,
  Flame,
  UtensilsCrossed,
  Check,
  Clock,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getActivePeriod,
  getMySubscription,
  getMySubscriptions,
} from "@/lib/actions/subscription";
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { deliveryDaysToDateStrings, getTodayStr, countSelectedDays, formatDateFull } from "@/lib/utils";
import { getDailyMenusByDate, getMyMenuSelections } from "@/lib/actions/menu";
import { getPickupStreak, getMyPickups } from "@/lib/actions/pickup";
import { Link } from "@/i18n/navigation";
import { HomePickupCard } from "./home-pickup-card";
import type { DailyMenu, MenuSelection, Subscription, SubscriptionPeriod } from "@/types";

function findCurrentSubscription(
  subscriptions: Subscription[],
  todayStr: string
): Subscription | null {
  for (const sub of subscriptions) {
    const period = (sub as Subscription & { subscription_periods: SubscriptionPeriod })
      .subscription_periods;
    if (!period?.delivery_start || !period?.delivery_end) continue;
    const delStart = period.delivery_start.slice(0, 10);
    const delEnd = period.delivery_end.slice(0, 10);
    if (delStart <= todayStr && delEnd >= todayStr) {
      return sub;
    }
  }
  return subscriptions[0] ?? null;
}

export default async function HomePage() {
  const todayStr = getTodayStr();

  const [profile, period, allSubscriptions, todayMenus] = await Promise.all([
    getCurrentProfile(),
    getActivePeriod(),
    getMySubscriptions(),
    getDailyMenusByDate(todayStr),
  ]);

  const subscription = findCurrentSubscription(allSubscriptions, todayStr);
  const periodSubscription = period
    ? await getMySubscription(period.id)
    : null;

  let deliveryDayCount = 0;
  let nextDeliveryDate: string | null = null;
  let nextDeliveryMenus: DailyMenu[] = [];
  let nextDeliverySelection: MenuSelection | null = null;
  let isMyDeliveryDay = false;

  if (subscription) {
    const days = await getMyDeliveryDays(subscription.id);
    deliveryDayCount = countSelectedDays(days);

    const myDates = deliveryDaysToDateStrings(days);
    const myDateSet = new Set(myDates);
    isMyDeliveryDay = myDateSet.has(todayStr);

    const futureDates = myDates.filter((d) => d > todayStr);
    if (futureDates.length > 0) {
      nextDeliveryDate = futureDates[0];
      nextDeliveryMenus = await getDailyMenusByDate(nextDeliveryDate);
      const selections = await getMyMenuSelections(nextDeliveryDate, nextDeliveryDate);
      if (selections.length > 0) {
        nextDeliverySelection = selections[0];
      }
    }
  }

  const isWeekday = new Date().getDay() >= 1 && new Date().getDay() <= 5;

  const [streak, todayPickups, todaySelections] = await Promise.all([
    getPickupStreak(),
    getMyPickups(todayStr, todayStr),
    getMyMenuSelections(todayStr, todayStr),
  ]);

  const todayConfirmed = todayPickups.some((p) => p.confirmed);

  const todaySelectedMenuName =
    todaySelections.length > 0
      ? (todaySelections[0].daily_menu_assignment as any)?.menu?.title ?? null
      : null;

  return (
    <HomeContent
      nickname={profile?.nickname ?? "User"}
      period={period}
      subscription={subscription}
      periodSubscription={periodSubscription}
      todayMenus={isWeekday ? todayMenus : []}
      isMyDeliveryDay={isMyDeliveryDay}
      deliveryDayCount={deliveryDayCount}
      streak={streak}
      todayStr={todayStr}
      todayConfirmed={todayConfirmed}
      nextDeliveryDate={nextDeliveryDate}
      nextDeliveryMenus={nextDeliveryMenus}
      nextDeliverySelection={nextDeliverySelection}
      todaySelectedMenuName={todaySelectedMenuName}
    />
  );
}

const DIETARY_LABELS: Record<string, string> = {
  vegan: "비건",
  gluten_free: "글루텐프리",
  nut_free: "견과류 없음",
  dairy_free: "유제품 없음",
  low_carb: "저탄수화물",
  high_protein: "고단백",
};

function HomeContent({
  nickname,
  period,
  subscription,
  periodSubscription,
  todayMenus,
  isMyDeliveryDay,
  deliveryDayCount,
  streak,
  todayStr,
  todayConfirmed,
  nextDeliveryDate,
  nextDeliveryMenus,
  nextDeliverySelection,
  todaySelectedMenuName,
}: {
  nickname: string;
  period: any;
  subscription: any;
  periodSubscription: any;
  todayMenus: DailyMenu[];
  isMyDeliveryDay: boolean;
  deliveryDayCount: number;
  streak: number;
  todayStr: string;
  todayConfirmed: boolean;
  nextDeliveryDate: string | null;
  nextDeliveryMenus: DailyMenu[];
  nextDeliverySelection: MenuSelection | null;
  todaySelectedMenuName: string | null;
}) {
  const t = useTranslations("home");
  const tSub = useTranslations("subscription");

  const hasPeriodSub = !!periodSubscription;
  const isPeriodPaid = periodSubscription?.payment_status === "completed";

  const hasSubscription = !!subscription;
  const totalSalads = hasSubscription
    ? deliveryDayCount * (subscription.salads_per_delivery ?? 1)
    : 0;

  const now = new Date();
  const isApplyingPeriod =
    period &&
    now >= new Date(period.apply_start) && now <= new Date(period.apply_end);
  const isPayingPeriod =
    period &&
    now >= new Date(period.pay_start) && now <= new Date(period.pay_end);
  const isActionablePeriod = isApplyingPeriod || isPayingPeriod;

  let subscriptionCardTitle = tSub("title");
  if (isApplyingPeriod) {
    subscriptionCardTitle = "구독 신청 기간";
  } else if (isPayingPeriod && !isPeriodPaid) {
    subscriptionCardTitle = "결제 기간";
  }

  let subscriptionCardSubtitle = period?.target_month ?? null;
  if (isPayingPeriod && !isPeriodPaid) {
    subscriptionCardSubtitle = "결제하고 '결제 완료 신청'을 눌러주세요";
  }

  const subscriptionCard = (
    <Link href="/subscription" className="block">
      <Card className={`transition-colors hover:bg-accent/50 ${isActionablePeriod && !isPeriodPaid ? "border-primary/50 ring-1 ring-primary/20" : ""}`}>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
            <UtensilsCrossed className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{subscriptionCardTitle}</CardTitle>
            {subscriptionCardSubtitle && (
              <p className="text-sm text-muted-foreground">
                {subscriptionCardSubtitle}
              </p>
            )}
          </div>
          {hasPeriodSub ? (
            isPeriodPaid ? (
              <Badge
                variant="secondary"
                className="ml-auto gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              >
                <Check className="h-3 w-3" />
                결제 완료
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="ml-auto gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
              >
                <Clock className="h-3 w-3" />
                결제 대기
              </Badge>
            )
          ) : (
            <Badge variant="secondary" className="ml-auto">
              {tSub("notSubscribed")}
            </Badge>
          )}
        </CardHeader>
        {hasPeriodSub && (
          <CardContent>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>주 {periodSubscription.frequency_per_week}회</span>
              <span>·</span>
              <span>배달당 {periodSubscription.salads_per_delivery}개</span>
              <span>·</span>
              <span>월 {(periodSubscription.total_delivery_days ?? 0) * (periodSubscription.salads_per_delivery ?? 1)}개</span>
            </div>
          </CardContent>
        )}
      </Card>
    </Link>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("welcome", { name: nickname })}
        </h1>
        <div className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 dark:bg-orange-900/20">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
            {streak}일 연속 수령
          </span>
        </div>
      </div>

      {/* Show subscription card at top during application/payment period */}
      {isActionablePeriod && !isPeriodPaid && subscriptionCard}

      <HomePickupCard
        todayStr={todayStr}
        initialConfirmed={todayConfirmed}
        hasDeliveryToday={isMyDeliveryDay && todayMenus.length > 0}
        todayMenuName={todaySelectedMenuName}
      />

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Salad className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">{t("todaysMenu")}</h2>
          </div>
          {todayMenus.length > 0 && (
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${isMyDeliveryDay ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              {isMyDeliveryDay
                ? "구독날이니 든든하게 챙겨먹어요 🥗"
                : "오늘은 구독날이 아니에요"}
            </span>
          )}
        </div>
        {todayMenus.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">{t("noDeliveryToday")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {todayMenus.map((dm, idx) =>
              dm.menu ? (
                <Link key={dm.id} href={`/menu/${dm.menu.id}`}>
                  <Card className="overflow-hidden py-0 transition-colors hover:bg-accent/50">
                    {dm.menu.image_url ? (
                      <img
                        src={dm.menu.image_url}
                        alt={dm.menu.title}
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center bg-muted">
                        <UtensilsCrossed className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <CardContent className="space-y-0.5 px-3 pb-3 pt-0">
                      <p className="text-2xl font-extrabold">{idx + 1}</p>
                      <p className="text-base font-semibold leading-tight">
                        {dm.menu.title}
                      </p>
                      {dm.menu.sauce && (
                        <p className="text-sm text-muted-foreground">
                          {dm.menu.sauce}
                        </p>
                      )}
                      {(dm.menu.protein != null || dm.menu.kcal != null) && (
                        <p className="text-xs text-muted-foreground">
                          {dm.menu.protein != null && `${dm.menu.protein}g`}
                          {dm.menu.protein != null && dm.menu.kcal != null && " · "}
                          {dm.menu.kcal != null && `${dm.menu.kcal}kcal`}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ) : null
            )}
          </div>
        )}
      </div>

      <Link href="/menu" className="block">
        <Card className="transition-colors hover:bg-accent/50">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <CalendarCheck className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">
                {nextDeliveryDate
                  ? `${formatDateFull(nextDeliveryDate)}에 다음 배달이 와요`
                  : t("nextDelivery")}
              </CardTitle>
              {nextDeliveryDate ? (
                <div className="text-sm text-muted-foreground">
                  {nextDeliverySelection ? (
                    <p className="font-medium text-foreground">
                      ✓ {(nextDeliverySelection.daily_menu_assignment as any)?.menu?.title ?? "메뉴"}
                    </p>
                  ) : nextDeliveryMenus.length > 0 ? (
                    <p>
                      {nextDeliveryMenus
                        .map((dm) => dm.menu?.title)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  ) : (
                    <p>메뉴 미배정</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  예정된 배달이 없습니다
                </p>
              )}
            </div>
          </CardHeader>
        </Card>
      </Link>

      {/* Show subscription card at bottom if not in actionable period or already paid */}
      {(!isActionablePeriod || isPeriodPaid) && subscriptionCard}

    </div>
  );
}
