"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Users,
  TrendingUp,
  Package,
  CreditCard,
  Loader2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { DashboardStats } from "@/lib/actions/admin";
import { getDashboardStats } from "@/lib/actions/admin";
import type { SubscriptionPeriod } from "@/types";

// Recharts is heavy; load it only in the browser after the dashboard shell
// paints instead of shipping it in the route's SSR bundle.
const chartLoading = () => <Skeleton className="h-[280px] w-full" />;
const DailyDeliveryBarChart = dynamic(
  () => import("./dashboard-charts").then((m) => m.DailyDeliveryBarChart),
  { ssr: false, loading: chartLoading }
);
const MenuPopularityPieChart = dynamic(
  () => import("./dashboard-charts").then((m) => m.MenuPopularityPieChart),
  { ssr: false, loading: chartLoading }
);

interface DashboardViewProps {
  initialStats: DashboardStats;
  periods: SubscriptionPeriod[];
}

export function DashboardView({ initialStats, periods }: DashboardViewProps) {
  const [stats, setStats] = useState(initialStats);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);

  async function handlePeriodChange(periodId: string) {
    setSelectedPeriod(periodId);
    setIsLoading(true);
    try {
      const newStats = await getDashboardStats(
        periodId === "all" ? undefined : periodId
      );
      setStats(newStats);
    } finally {
      setIsLoading(false);
    }
  }

  const dailyChartData = stats.dailyDeliveries.map((d) => ({
    date: d.date.slice(5),
    주문수: d.count,
  }));

  const pieData = stats.menuPopularity.map((m) => ({
    name: m.menuTitle,
    value: m.count,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
      </div>

      {/* Period filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">구독 기간:</span>
        <Select
          value={selectedPeriod}
          onValueChange={(v) => handlePeriodChange(v ?? "all")}
        >
          <SelectTrigger className="w-[200px]">
            <span className="flex flex-1 text-left">{selectedPeriod === "all" ? "전체" : periods.find((p) => p.id === selectedPeriod)?.target_month ?? selectedPeriod}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.target_month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          title="전체 사용자"
          value={stats.totalUsers}
          sub={`승인됨: ${stats.approvedUsers}`}
        />
        <StatCard
          icon={CreditCard}
          title="구독자"
          value={stats.activeSubscribers}
          sub={`결제 완료: ${stats.paidSubscribers}`}
        />
        <StatCard
          icon={Package}
          title="총 배달"
          value={stats.totalDeliveries}
          sub={`수령: ${stats.totalPickups}`}
        />
        <StatCard
          icon={TrendingUp}
          title="수령률"
          value={`${stats.pickupRate}%`}
          sub={`${stats.totalPickups} / ${stats.totalDeliveries}`}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily delivery chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">일별 주문 수</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                데이터가 없습니다
              </p>
            ) : (
              <DailyDeliveryBarChart data={dailyChartData} />
            )}
          </CardContent>
        </Card>

        {/* Menu popularity pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">메뉴 인기도</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                데이터가 없습니다
              </p>
            ) : (
              <MenuPopularityPieChart data={pieData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Menu popularity ranking */}
      {stats.menuPopularity.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">메뉴 선택 순위</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.menuPopularity.map((menu, idx) => (
                <div
                  key={menu.menuId}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium">
                    {menu.menuTitle}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {menu.count}회
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string | number;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
