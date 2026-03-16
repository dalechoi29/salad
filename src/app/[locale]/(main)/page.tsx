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
import { getMyDeliveryDays } from "@/lib/actions/delivery";
import { deliveryDaysToDateStrings, getTodayStr, getKSTDate, countSelectedDays, formatDateFull } from "@/lib/utils";
import { getDailyMenusByDate, getMyMenuSelections } from "@/lib/actions/menu";
import { getPickupStreak, getMyPickups } from "@/lib/actions/pickup";
import { getSubscriptionDayCounts, getDailySaladStatus, getCompanyUsers } from "@/lib/actions/admin";
import { getHolidays } from "@/lib/actions/holiday";
import { Link } from "@/i18n/navigation";
import { HomePickupCard } from "./home-pickup-card";
import { HomeFridgeCard } from "./home-fridge-card";
import { SubscriptionStatusView } from "./admin/subscription-status/subscription-status-view";
import { HomeSkeleton } from "./home-skeleton";
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

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}

async function HomePageContent() {
  const todayStr = getTodayStr();
  const kstNow = getKSTDate();
  const isWeekday = kstNow.getDay() >= 1 && kstNow.getDay() <= 5;
  const cm = kstNow.getMonth() + 1;
  const cy = kstNow.getFullYear();
  const nm = cm === 12 ? 1 : cm + 1;
  const ny = cm === 12 ? cy + 1 : cy;
  const curMonthStr = `${cy}년 ${cm}월`;
  const nxtMonthStr = `${ny}년 ${nm}월`;

  // Fetch all independent data in a single parallel batch.
  // getSubscriptionPeriods, getActivePeriod, getHolidays, and getAuthUser are
  // request-scoped cached, so duplicate calls across actions are free.
  const [
    profile,
    period,
    allSubscriptions,
    todayMenus,
    streak,
    todayPickups,
    todaySelections,
    allPeriods,
    hols,
  ] = await Promise.all([
    getCurrentProfile(),
    getActivePeriod(),
    getMySubscriptions(),
    getDailyMenusByDate(todayStr),
    getPickupStreak(),
    getMyPickups(todayStr, todayStr),
    getMyMenuSelections(todayStr, todayStr),
    getSubscriptionPeriods(),
    getHolidays(),
  ]);

  const subscription = findCurrentSubscription(allSubscriptions, todayStr);
  const curPeriod = allPeriods.find((p) => p.target_month === curMonthStr) ?? null;
  const nxtPeriod = allPeriods.find((p) => p.target_month === nxtMonthStr) ?? null;

  const [periodSubscription, deliveryDays, cc, nc] = await Promise.all([
    period ? getMySubscription(period.id) : null,
    subscription ? getMyDeliveryDays(subscription.id) : [],
    curPeriod ? getSubscriptionDayCounts(curPeriod.id) : {},
    nxtPeriod ? getSubscriptionDayCounts(nxtPeriod.id) : {},
  ]);

  let deliveryDayCount = 0;
  let nextDeliveryDate: string | null = null;
  let nextDeliveryMenus: DailyMenu[] = [];
  let nextDeliverySelection: MenuSelection | null = null;
  let isMyDeliveryDay = false;

  if (subscription && deliveryDays.length > 0) {
    deliveryDayCount = countSelectedDays(deliveryDays);
    const myDates = deliveryDaysToDateStrings(deliveryDays);
    isMyDeliveryDay = new Set(myDates).has(todayStr);

    const futureDates = myDates.filter((d) => d > todayStr);
    if (futureDates.length > 0) {
      nextDeliveryDate = futureDates[0];
      const [menus, selections] = await Promise.all([
        getDailyMenusByDate(nextDeliveryDate),
        getMyMenuSelections(nextDeliveryDate, nextDeliveryDate),
      ]);
      nextDeliveryMenus = menus;
      if (selections.length > 0) nextDeliverySelection = selections[0];
    }
  }

  const todayConfirmed = todayPickups.some((p) => p.confirmed);

  const todaySelectedMenuName =
    todaySelections.length > 0
      ? (todaySelections[0].daily_menu_assignment as any)?.menu?.title ?? null
      : null;

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  const [saladStatus, companyUsers] = await Promise.all([
    getDailySaladStatus(todayStr),
    isAdmin ? getCompanyUsers() : [],
  ]);

  const subStatusProps = {
    currentPeriod: curPeriod,
    nextPeriod: nxtPeriod,
    currentCounts: cc,
    nextCounts: nc,
    holidays: hols,
  };

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
      streak={streak}
      todayStr={todayStr}
      todayConfirmed={todayConfirmed}
      nextDeliveryDate={nextDeliveryDate}
      nextDeliveryMenus={nextDeliveryMenus}
      nextDeliverySelection={nextDeliverySelection}
      todaySelectedMenuName={todaySelectedMenuName}
      saladStatus={saladStatus}
      companyUsers={companyUsers as { id: string; realName: string }[]}
      currentUserName={profile?.real_name ?? ""}
      subStatusProps={subStatusProps}
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
  todaySelectedMenuName,
  saladStatus,
  companyUsers,
  currentUserName,
  subStatusProps,
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
  todaySelectedMenuName: string | null;
  saladStatus: DailySaladStatus | null;
  companyUsers: { id: string; realName: string }[];
  currentUserName: string;
  subStatusProps: {
    currentPeriod: SubscriptionPeriod | null;
    nextPeriod: SubscriptionPeriod | null;
    currentCounts: Record<string, number>;
    nextCounts: Record<string, number>;
    holidays: Holiday[];
  } | null;
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
      )}

      {/* Subscription Status */}
      {subStatusProps && (
        <div className="pt-2">
          <SubscriptionStatusView
            currentPeriod={subStatusProps.currentPeriod}
            nextPeriod={subStatusProps.nextPeriod}
            currentCounts={subStatusProps.currentCounts}
            nextCounts={subStatusProps.nextCounts}
            holidays={subStatusProps.holidays}
            showBackButton={false}
            showTitle
            isLoggedIn={isLoggedIn}
          />
        </div>
      )}

      {/* Show subscription card at bottom if not in actionable period or already paid */}
      {(!isActionablePeriod || isPeriodPaid) && subscriptionCard}

    </div>
  );
}
