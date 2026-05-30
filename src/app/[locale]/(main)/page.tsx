import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Salad,
  CalendarCheck,
  Flame,
  UtensilsCrossed,
  Check,
  Clock,
  LogIn,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/actions/auth";
import {
  getActivePeriod,
  getMySubscription,
  getMySubscriptions,
  getSubscriptionPeriods,
} from "@/lib/actions/subscription";
import { getMyDeliveryDaysBySubscriptionIds } from "@/lib/actions/delivery";
import { deliveryDaysToDateStrings, getTodayStr, getKSTDate, countSelectedDays, formatDateFull, isSelectionClosed } from "@/lib/utils";
import { getDailyMenusByDate, getMyMenuSelections } from "@/lib/actions/menu";
import { getMyPickups } from "@/lib/actions/pickup";
import { getSubscriptionDayCounts, getDailySaladStatus, getCompanyUsers, getMenuSelectionCutoff, getWeeklyMenuDeadlines } from "@/lib/actions/admin";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { Link } from "@/i18n/navigation";
import { HomePickupCard } from "./home-pickup-card";
import { HomeFridgeCard } from "./home-fridge-card";
import { SubscriptionStatusView } from "./admin/subscription-status/subscription-status-view";
import { HomeSkeleton } from "./home-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyMenu, MenuSelection, Subscription, SubscriptionPeriod, Holiday, DailySaladStatus } from "@/types";

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

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type SubscriptionWithPeriod = Subscription & {
  subscription_periods?: SubscriptionPeriod | null;
};

function getEffectiveTotalDays(subscription: Subscription): number {
  return (
    (subscription.total_delivery_days ?? 0) ||
    (subscription.frequency_per_week ?? 0) * 4
  );
}

function hasClosureInPeriod(
  period: SubscriptionPeriod | null | undefined,
  closures: { closure_date: string }[]
): boolean {
  if (!period?.delivery_start || !period.delivery_end) return false;
  const start = period.delivery_start.slice(0, 10);
  const end = period.delivery_end.slice(0, 10);
  return closures.some(
    (closure) => closure.closure_date >= start && closure.closure_date <= end
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}

async function SubscriptionStatusSection() {
  const kstNow = getKSTDate();
  const cm = kstNow.getMonth() + 1;
  const cy = kstNow.getFullYear();
  const nm = cm === 12 ? 1 : cm + 1;
  const ny = cm === 12 ? cy + 1 : cy;
  const curMonthStr = `${cy}년 ${cm}월`;
  const nxtMonthStr = `${ny}년 ${nm}월`;

  const [allPeriods, hols, storeClosures, profile] = await Promise.all([
    getSubscriptionPeriods(),
    getHolidays(),
    getStoreClosures(),
    getCurrentProfile(),
  ]);
  const blockedDays = [
    ...hols,
    ...storeClosures.map((closure) => ({
      id: closure.id,
      holiday_date: closure.closure_date,
      name: closure.reason || "매장 휴무",
      source: "store_closure" as const,
    })),
  ];

  const curPeriod = allPeriods.find((p) => p.target_month === curMonthStr) ?? null;
  const nxtPeriod = allPeriods.find((p) => p.target_month === nxtMonthStr) ?? null;

  const [cc, nc] = await Promise.all([
    curPeriod ? getSubscriptionDayCounts(curPeriod.id) : {},
    nxtPeriod ? getSubscriptionDayCounts(nxtPeriod.id) : {},
  ]);

  const nowMs = Date.now();
  const curDeliveryEndMs = curPeriod?.delivery_end
    ? new Date(curPeriod.delivery_end + "T23:59:59+09:00").getTime()
    : Number.POSITIVE_INFINITY;
  const defaultTabIndex = curDeliveryEndMs < nowMs && nxtPeriod ? 1 : 0;

  return (
    <SubscriptionStatusView
      currentPeriod={curPeriod}
      nextPeriod={nxtPeriod}
      currentCounts={cc}
      nextCounts={nc}
      holidays={blockedDays}
      showBackButton={false}
      showTitle
      isLoggedIn={!!profile}
      defaultTabIndex={defaultTabIndex}
    />
  );
}

async function HomePageContent() {
  const todayStr = getTodayStr();
  const kstNow = getKSTDate();
  const isWeekday = kstNow.getDay() >= 1 && kstNow.getDay() <= 5;

  // Single parallel batch for independent data. Weekend-only views don't need
  // the daily menu/pickup/status queries that only affect delivery-day UI.
  const [
    profile,
    period,
    allSubscriptions,
    todayMenus,
    todayPickups,
    todaySelections,
    saladStatus,
  ] = await Promise.all([
    getCurrentProfile(),
    getActivePeriod(),
    getMySubscriptions(),
    isWeekday ? getDailyMenusByDate(todayStr) : [],
    isWeekday ? getMyPickups(todayStr, todayStr) : [],
    isWeekday ? getMyMenuSelections(todayStr, todayStr) : [],
    isWeekday ? getDailySaladStatus(todayStr) : null,
  ]);

  const subscription = findCurrentSubscription(allSubscriptions, todayStr);
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  // Second batch: all dependent fetches in parallel
  const [periodSubscription, storeClosures] = await Promise.all([
    period ? getMySubscription(period.id) : null,
    getStoreClosures(),
  ]);

  // For the "paid but haven't finished picking dates" CTA, we need the
  // active period's delivery days. During the overlap window (e.g. April
  // delivering while May is open for payment) periodSubscription and
  // subscription point at different rows; in the common case they match
  // and we reuse `deliveryDays` without an extra query.
  const incompleteClosureCandidates = (
    allSubscriptions as SubscriptionWithPeriod[]
  )
    .map((sub) => {
      const subPeriod = sub.subscription_periods;
      return { sub, subPeriod };
    })
    .filter(
      ({ sub, subPeriod }) =>
        sub.payment_status === "completed" &&
        hasClosureInPeriod(subPeriod, storeClosures)
    )
    .sort((a, b) =>
      (a.subPeriod?.delivery_start ?? "").localeCompare(
        b.subPeriod?.delivery_start ?? ""
      )
    );

  const deliverySubIds = [
    subscription?.id,
    periodSubscription?.id,
    ...incompleteClosureCandidates.map(({ sub }) => sub.id),
  ].filter((id): id is string => !!id);
  const deliveryDaysBySub = await getMyDeliveryDaysBySubscriptionIds(deliverySubIds);
  const deliveryDays = subscription ? (deliveryDaysBySub[subscription.id] ?? []) : [];
  const periodDeliveryDays = periodSubscription
    ? (deliveryDaysBySub[periodSubscription.id] ?? [])
    : [];
  const companyUsers =
    isAdmin && isWeekday && todayMenus.length > 0 && !saladStatus?.is_checked
      ? await getCompanyUsers()
      : [];

  // Compute the "needs to pick more dates" flag. Same `|| frequency × 4`
  // fallback we use in the admin roster so a subscriber whose row has
  // total_delivery_days=0 still gets prompted to finish picking. Only
  // nags paid subscribers — pending users haven't committed yet.
  let needsMoreDeliveryDates = false;
  let remainingDeliverySlots = 0;
  let hasStoreClosureInActivePeriod = false;

  for (const { sub } of incompleteClosureCandidates) {
    const candidateDays =
      sub.id === subscription?.id
        ? deliveryDays
        : sub.id === periodSubscription?.id
          ? periodDeliveryDays
          : (deliveryDaysBySub[sub.id] ?? []);
    const selectedCount = countSelectedDays(candidateDays);
    const usedCarryoverDays = (allSubscriptions as Subscription[]).reduce(
      (sum, other) =>
        other.carryover_from_subscription_id === sub.id
          ? sum + ((other.carryover_delivery_days ?? 0) as number)
          : sum,
      0
    );
    const remaining = Math.max(
      0,
      getEffectiveTotalDays(sub) - selectedCount - usedCarryoverDays
    );
    const isClosureReplacement =
      sub.closure_reselection_required === true || selectedCount > 0;

    if (remaining > 0 && isClosureReplacement) {
      needsMoreDeliveryDates = true;
      remainingDeliverySlots = remaining;
      hasStoreClosureInActivePeriod = true;
      break;
    }
  }

  if (!needsMoreDeliveryDates && periodSubscription?.payment_status === "completed") {
    const effectiveTotal = getEffectiveTotalDays(periodSubscription);
    const selectedCount = countSelectedDays(periodDeliveryDays);
    remainingDeliverySlots = Math.max(0, effectiveTotal - selectedCount);
    needsMoreDeliveryDates = remainingDeliverySlots > 0;
    hasStoreClosureInActivePeriod = false;
  }

  let deliveryDayCount = 0;
  let nextDeliveryDate: string | null = null;
  let nextDeliveryMenus: DailyMenu[] = [];
  let nextDeliverySelection: MenuSelection | null = null;
  let nextDeliveryMenuSelectionClosed = false;
  let isMyDeliveryDay = false;

  if (subscription && deliveryDays.length > 0) {
    deliveryDayCount = countSelectedDays(deliveryDays);
    const myDates = deliveryDaysToDateStrings(deliveryDays);
    isMyDeliveryDay = new Set(myDates).has(todayStr);

    const futureDates = myDates.filter((d) => d > todayStr);
    if (futureDates.length > 0) {
      nextDeliveryDate = futureDates[0];
      const weekStart = getMondayISO(nextDeliveryDate);
      const [menus, selections, cutoff, deadlines] = await Promise.all([
        getDailyMenusByDate(nextDeliveryDate),
        getMyMenuSelections(nextDeliveryDate, nextDeliveryDate),
        getMenuSelectionCutoff(),
        getWeeklyMenuDeadlines(weekStart, weekStart),
      ]);
      nextDeliveryMenus = menus;
      if (selections.length > 0) nextDeliverySelection = selections[0];
      const override = deadlines[0]?.deadline_at;
      nextDeliveryMenuSelectionClosed = override
        ? new Date() >= new Date(override)
        : isSelectionClosed(nextDeliveryDate, cutoff.day, cutoff.time);
    }
  }

  const todayConfirmed = todayPickups.some((p) => p.confirmed);

  const todaySelectedMenuName =
    todaySelections.length > 0
      ? (todaySelections[0].daily_menu_assignment as any)?.menu?.title ?? null
      : null;

  return (
    <HomeContent
      isLoggedIn={!!profile}
      isAdmin={isAdmin}
      nickname={profile?.nickname ?? ""}
      period={period}
      subscription={subscription}
      periodSubscription={periodSubscription}
      todayMenus={isWeekday ? todayMenus : []}
      isMyDeliveryDay={isMyDeliveryDay}
      deliveryDayCount={deliveryDayCount}
      streak={profile?.pickup_streak ?? 0}
      todayStr={todayStr}
      todayConfirmed={todayConfirmed}
      nextDeliveryDate={nextDeliveryDate}
      nextDeliveryMenus={nextDeliveryMenus}
      nextDeliverySelection={nextDeliverySelection}
      nextDeliveryMenuSelectionClosed={nextDeliveryMenuSelectionClosed}
      todaySelectedMenuName={todaySelectedMenuName}
      saladStatus={saladStatus}
      companyUsers={companyUsers as { id: string; realName: string }[]}
      currentUserName={profile?.real_name ?? ""}
      needsMoreDeliveryDates={needsMoreDeliveryDates}
      remainingDeliverySlots={remainingDeliverySlots}
      hasStoreClosureInActivePeriod={hasStoreClosureInActivePeriod}
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
  isLoggedIn,
  isAdmin,
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
  nextDeliveryMenuSelectionClosed,
  todaySelectedMenuName,
  saladStatus,
  companyUsers,
  currentUserName,
  needsMoreDeliveryDates,
  remainingDeliverySlots,
  hasStoreClosureInActivePeriod,
}: {
  isLoggedIn: boolean;
  isAdmin: boolean;
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
  nextDeliveryMenuSelectionClosed: boolean;
  todaySelectedMenuName: string | null;
  saladStatus: DailySaladStatus | null;
  companyUsers: { id: string; realName: string }[];
  currentUserName: string;
  needsMoreDeliveryDates: boolean;
  remainingDeliverySlots: number;
  hasStoreClosureInActivePeriod: boolean;
}) {
  const t = useTranslations("home");
  const tSub = useTranslations("subscription");

  const hasPeriodSub = !!periodSubscription;
  const isPeriodPaid = periodSubscription?.payment_status === "completed";

  const hasSubscription = !!subscription;
  const totalSalads = hasSubscription
    ? deliveryDayCount * (subscription.salads_per_delivery ?? 1)
    : 0;

  const now = getKSTDate();
  const isApplyingPeriod =
    period &&
    now >= new Date(period.apply_start) && now <= new Date(period.apply_end);
  const isPayingPeriod =
    period &&
    now >= new Date(period.pay_start) && now <= new Date(period.pay_end);
  const isActionablePeriod = isApplyingPeriod || isPayingPeriod;

  const targetMonthShort = period?.target_month
    ? period.target_month.replace(/^\d{4}년\s*/, "")
    : null;

  let subscriptionCardTitle = tSub("title");
  if (isApplyingPeriod) {
    subscriptionCardTitle = targetMonthShort
      ? `${targetMonthShort} 구독 신청 기간`
      : "구독 신청 기간";
  } else if (isPayingPeriod && !isPeriodPaid) {
    subscriptionCardTitle = "결제 기간";
  }

  const formatApplyEnd = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일까지 신청해주세요`;
  };

  const formatPayStart = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일부터 결제 가능해요`;
  };

  let subscriptionCardSubtitle: string | null = null;
  if (isPayingPeriod && !hasPeriodSub) {
    subscriptionCardSubtitle = "구독 신청 후, 결제를 진행해주세요";
  } else if (isPayingPeriod && !isPeriodPaid) {
    subscriptionCardSubtitle = "결제하고 '결제 완료 신청'을 눌러주세요";
  } else if (hasPeriodSub && !isPeriodPaid && period?.pay_start) {
    subscriptionCardSubtitle = formatPayStart(period.pay_start);
  } else if (isApplyingPeriod && period?.apply_end) {
    subscriptionCardSubtitle = formatApplyEnd(period.apply_end);
  } else {
    subscriptionCardSubtitle = period?.target_month ?? null;
  }

  const subscriptionCard = (
    <Link href={isLoggedIn ? "/subscription" : "/login"} className="block">
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
      {isLoggedIn ? (
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
      ) : (
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">로그인이 필요해요</h1>
          <Link href="/login">
            <Button size="sm" className="gap-1.5">
              <LogIn className="h-4 w-4" />
              로그인
            </Button>
          </Link>
        </div>
      )}

      {/* Show subscription card at top during application/payment period */}
      {isActionablePeriod && !isPeriodPaid && subscriptionCard}

      {isLoggedIn && !todayConfirmed && (
        <HomePickupCard
          todayStr={todayStr}
          initialConfirmed={todayConfirmed}
          hasDeliveryToday={isMyDeliveryDay && todayMenus.length > 0}
          todayMenuName={todaySelectedMenuName}
          adminCheckedIn={saladStatus?.is_checked ?? false}
          saladLocation={saladStatus?.location ?? null}
          todayMenus={todayMenus}
        />
      )}

      {isAdmin && todayMenus.length > 0 && !saladStatus?.is_checked && (
        <HomeFridgeCard
          todayStr={todayStr}
          companyUsers={companyUsers}
          currentUserName={currentUserName}
        />
      )}

      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Salad className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">{t("todaysMenu")}</h2>
          </div>
          {isLoggedIn && todayMenus.length > 0 && (
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

      {/* Paid-but-not-finished-picking CTA. Only shown to a user whose
          active-period subscription is marked complete but still has
          unfilled delivery slots. Sits below today's menus so it reads
          as "finish what you've paid for" follow-up action. */}
      {needsMoreDeliveryDates && (
        <Link href="/delivery" className="block">
          <Card className="border-red-300 bg-red-50 transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:hover:bg-red-950/60">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/15">
                <CalendarCheck className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base text-red-700 dark:text-red-300">
                  {hasStoreClosureInActivePeriod
                    ? "매장 휴무일로 날짜 변경이 필요해요."
                    : "배달 날짜를 선택할 수 있어요."}
                </CardTitle>
                <p className="text-sm text-red-700/80 dark:text-red-300/80">
                  {hasStoreClosureInActivePeriod
                    ? `${remainingDeliverySlots}일을 다시 선택해주세요.`
                    : `${remainingDeliverySlots}일을 선택해 주세요.`}
                </p>
              </div>
            </CardHeader>
          </Card>
        </Link>
      )}

      {isLoggedIn && (
        <Link href="/menu" className="block">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <CalendarCheck className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">
                  {nextDeliveryDate
                    ? `${formatDateFull(nextDeliveryDate)}에 다음 배송이 와요`
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
                        {nextDeliveryMenuSelectionClosed
                          ? nextDeliveryMenus
                              .filter(
                                (dm) =>
                                  dm.slot_type === "main" &&
                                  dm.menu?.category === "salad"
                              )
                              .slice(0, 2)
                              .map((dm) => dm.menu?.title)
                              .filter(Boolean)
                              .join(", ") ||
                            nextDeliveryMenus
                              .map((dm) => dm.menu?.title)
                              .filter(Boolean)
                              .slice(0, 2)
                              .join(", ")
                          : "메뉴를 선택해 주세요."}
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
      )}

      {/* Subscription Status - loaded independently */}
      <div id="subscription-status" className="pt-2">
        <Suspense
          fallback={
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <Skeleton className="h-40 w-full" />
              </CardContent>
            </Card>
          }
        >
          <SubscriptionStatusSection />
        </Suspense>
      </div>

      {/* Show subscription card at bottom if not in actionable period or already paid */}
      {(!isActionablePeriod || isPeriodPaid) && subscriptionCard}

    </div>
  );
}
