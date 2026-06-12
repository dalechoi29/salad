import { Suspense } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Salad,
  CalendarCheck,
  CalendarDays,
  UtensilsCrossed,
  Check,
  Clock,
  LogIn,
} from "lucide-react";
import {
  getSubscriptionPeriods,
} from "@/lib/actions/subscription";
import { getTodayStr, getKSTDate } from "@/lib/utils";
import { getHolidays } from "@/lib/actions/holiday";
import { getStoreClosures } from "@/lib/actions/store-closure";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getSubscriptionDayCounts } from "@/lib/actions/admin";
import { getHomePageShellData } from "@/lib/actions/home-page";
import { shellToHomeContentProps } from "@/lib/home-page-types";
import { Link } from "@/i18n/navigation";
import { HomePickupCard } from "./home-pickup-card";
import { HomeFridgeCard } from "./home-fridge-card";
import { HomeDeliveryStrip } from "./home-delivery-strip";
import { HomeDeliveryActions } from "./home-delivery-actions";
import { HomeStripHydrationProvider } from "./home-strip-hydration";
import { SubscriptionStatusView } from "./admin/subscription-status/subscription-status-view";
import { HomeSkeleton } from "./home-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyMenu, SubscriptionPeriod, DailySaladStatus } from "@/types";
import type { HomeStripData } from "@/lib/home-page-types";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomePageContent />
    </Suspense>
  );
}

async function HomePageContent() {
  const shell = await getHomePageShellData();
  const initialStripData: HomeStripData = {
    menuDetailByDate: shell.menuDetailByDate,
    availableMenusByDate: shell.availableMenusByDate,
    guestBrowseMenusByDate: shell.guestBrowseMenusByDate,
  };

  return (
    <HomeStripHydrationProvider
      key={shell.isLoggedIn ? "auth" : "guest"}
      initialStripData={initialStripData}
      stripDataPending={false}
    >
      <HomeContent {...shellToHomeContentProps(shell)} />
    </HomeStripHydrationProvider>
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
  todayStr,
  todayConfirmed,
  nextDeliveryDate,
  todaySelectedMenuName,
  saladStatus,
  currentUserName,
  needsMoreDeliveryDates,
  remainingDeliverySlots,
  hasStoreClosureInActivePeriod,
  myDeliveryDates,
  loggedInStripDates,
  guestStripDates,
  selectedDatesInPeriod,
  cutoffDay,
  cutoffTime,
  initialStripData,
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
  todayStr: string;
  todayConfirmed: boolean;
  nextDeliveryDate: string | null;
  todaySelectedMenuName: string | null;
  saladStatus: DailySaladStatus | null;
  currentUserName: string;
  needsMoreDeliveryDates: boolean;
  remainingDeliverySlots: number;
  hasStoreClosureInActivePeriod: boolean;
  myDeliveryDates: string[];
  loggedInStripDates: string[];
  guestStripDates: string[];
  selectedDatesInPeriod: string[];
  cutoffDay: number;
  cutoffTime: string;
  initialStripData: HomeStripData;
}) {
  const t = useTranslations("home");
  const tSub = useTranslations("subscription");

  const showDeliverySchedule = isLoggedIn
    ? loggedInStripDates.length > 0
    : guestStripDates.length > 0;
  const stripDates = isLoggedIn ? loggedInStripDates : guestStripDates;
  const stripSelectedDates = isLoggedIn ? selectedDatesInPeriod : [];

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
        <h1 className="text-2xl font-bold tracking-tight">
          {t("welcome", { name: nickname })}
        </h1>
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
          currentUserName={currentUserName}
        />
      )}

      {/* ── Personal delivery schedule ───────────────────────────── */}
      {showDeliverySchedule && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">나의 배송 일정</h2>
          </div>

          <HomeDeliveryStrip
            key={`${isLoggedIn ? "in" : "guest"}-${stripDates.join(",")}`}
            deliveryDates={stripDates}
            selectedDateSet={stripSelectedDates}
            todayStr={todayStr}
            cutoffDay={cutoffDay}
            cutoffTime={cutoffTime}
            guestMode={!isLoggedIn}
            initialStripData={initialStripData}
          />

          <HomeDeliveryActions
            isLoggedIn={isLoggedIn}
            myDeliveryDates={myDeliveryDates}
            selectedDatesInPeriod={selectedDatesInPeriod}
            nextDeliveryDate={nextDeliveryDate}
            todayStr={todayStr}
            cutoffDay={cutoffDay}
            cutoffTime={cutoffTime}
          />
        </div>
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
                      <div className="relative aspect-square w-full">
                        <Image
                          src={dm.menu.image_url}
                          alt={dm.menu.title}
                          fill
                          sizes="(min-width: 768px) 21rem, 50vw"
                          className="object-cover"
                        />
                      </div>
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

      {/* Date-picking CTA — only shown when delivery slots remain and no store closure */}
      {needsMoreDeliveryDates && !hasStoreClosureInActivePeriod && (
        <Link href="/delivery" className="block">
          <Card className="border-red-300 bg-red-50 transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/15">
                <CalendarCheck className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base text-red-700 dark:text-red-300">
                  배달 날짜를 선택할 수 있어요.
                </CardTitle>
                <p className="text-sm text-red-700/80 dark:text-red-300/80">
                  {remainingDeliverySlots}일을 선택해 주세요.
                </p>
              </div>
            </CardHeader>
          </Card>
        </Link>
      )}

      {/* Subscription card shown only during the actionable apply/pay window */}

      {/* 구독 현황 — visible to all; guests are sent to login on interaction */}
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
    </div>
  );
}
