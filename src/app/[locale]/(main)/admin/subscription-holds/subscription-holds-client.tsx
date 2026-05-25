"use client";

import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, Settings, Users, List, Pause } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  expirePastSubscriptionHoldsForAdmin,
  type AdminSubscriptionHoldListRow,
} from "@/lib/actions/subscription-hold-admin";
import {
  saveSubscriptionHoldAdminSettings,
  setUserSubscriptionHoldEligible,
} from "@/lib/actions/admin";
import { HOLD_DURATION_OPTIONS } from "@/lib/subscription-hold";
import type { Profile, SubscriptionHoldDurationKind } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "예정",
  active: "진행 중",
  cancelled: "취소됨",
  completed: "완료",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const ADMIN_ROLES = ["admin", "super_admin"];

interface Props {
  initialRows: AdminSubscriptionHoldListRow[];
  initialHoldMasterEnabled: boolean;
  initialHoldAllowedKinds: SubscriptionHoldDurationKind[];
  initialUsers: Profile[];
}

export function SubscriptionHoldsClient({
  initialRows,
  initialHoldMasterEnabled,
  initialHoldAllowedKinds,
  initialUsers,
}: Props) {
  const router = useRouter();

  // ── Global settings state ──────────────────────────────────────────────────
  const [holdMasterEnabled, setHoldMasterEnabled] = useState(initialHoldMasterEnabled);
  const [holdAllowedSet, setHoldAllowedSet] = useState(
    () => new Set<string>(initialHoldAllowedKinds)
  );
  const [settingsSaving, setSettingsSaving] = useState(false);

  const sortedInitialKinds = useMemo(
    () => [...initialHoldAllowedKinds].sort().join(","),
    [initialHoldAllowedKinds]
  );
  const settingsDirty =
    holdMasterEnabled !== initialHoldMasterEnabled ||
    [...holdAllowedSet].sort().join(",") !== sortedInitialKinds;

  // ── User eligibility state ─────────────────────────────────────────────────
  const [users, setUsers] = useState(initialUsers);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  // ── Expire state ───────────────────────────────────────────────────────────
  const [expireLoading, setExpireLoading] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleSaveSettings() {
    if (holdAllowedSet.size === 0) {
      toast.error("최소 한 가지 홀드 기간을 선택해 주세요");
      return;
    }
    setSettingsSaving(true);
    try {
      const allowedOrdered = HOLD_DURATION_OPTIONS.map((o) => o.kind).filter(
        (k) => holdAllowedSet.has(k)
      );
      const result = await saveSubscriptionHoldAdminSettings({
        masterEnabled: holdMasterEnabled,
        allowedDurationKinds: allowedOrdered,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("홀드 설정이 저장되었습니다");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleToggleEligible(userId: string, eligible: boolean) {
    setLoadingUserId(userId);
    const result = await setUserSubscriptionHoldEligible(userId, eligible);
    setLoadingUserId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(eligible ? "홀드 허용으로 설정했습니다" : "홀드 허용을 해제했습니다");
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, subscription_hold_eligible: eligible } : u
      )
    );
  }

  async function handleExpire() {
    setExpireLoading(true);
    try {
      const result = await expirePastSubscriptionHoldsForAdmin();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.count != null && result.count > 0
          ? `${result.count}건의 홀드를 완료 처리했습니다`
          : "만료할 홀드가 없습니다"
      );
      router.refresh();
    } finally {
      setExpireLoading(false);
    }
  }

  const eligibleCount = users.filter(
    (u) => u.subscription_hold_eligible && !ADMIN_ROLES.includes(u.role)
  ).length;
  const regularUsers = users.filter((u) => !ADMIN_ROLES.includes(u.role));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">구독 홀드 관리</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            홀드 전역 설정 · 허용 사용자 관리 · 신청 내역 조회
          </p>
        </div>
      </div>

      {/* ── Section 1: Global settings ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            전역 설정
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            전역 스위치를 켜야 허용된 회원이 구독 화면에서 홀드를 신청할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">홀드 기능 사용</p>
              <p className="text-xs text-muted-foreground">
                끄면 허용된 회원에게도 신규 신청·기간 변경이 막힙니다
              </p>
            </div>
            <Switch
              checked={holdMasterEnabled}
              onCheckedChange={setHoldMasterEnabled}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">허용할 홀드 기간</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {HOLD_DURATION_OPTIONS.map((o) => (
                <label
                  key={o.kind}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <Checkbox
                    checked={holdAllowedSet.has(o.kind)}
                    onCheckedChange={() => {
                      setHoldAllowedSet((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.kind)) next.delete(o.kind);
                        else next.add(o.kind);
                        return next;
                      });
                    }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => void handleSaveSettings()}
              disabled={!settingsDirty || settingsSaving}
            >
              {settingsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              설정 저장
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: User eligibility ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            허용 사용자 관리
            {eligibleCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {eligibleCount}명 허용
              </Badge>
            )}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            홀드 신청을 허용할 구독자를 선택합니다. 관리자 계정은 목록에서 제외됩니다.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {regularUsers.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              활성 구독자가 없습니다
            </p>
          ) : (
            regularUsers.map((user, index) => (
              <div key={user.id}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{user.real_name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {user.subscription_hold_eligible ? "허용됨" : "미허용"}
                    </span>
                    <Switch
                      checked={!!user.subscription_hold_eligible}
                      disabled={loadingUserId === user.id}
                      onCheckedChange={(v) =>
                        void handleToggleEligible(user.id, !!v)
                      }
                    />
                    {loadingUserId === user.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
                {index < regularUsers.length - 1 && <Separator />}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: Hold records ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <List className="h-4 w-4" />
            홀드 신청 내역
          </CardTitle>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              최근 300건 · 지원·분쟁 대응용 조회
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={expireLoading}
              onClick={() => void handleExpire()}
            >
              {expireLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              기간 지난 홀드 일괄 완료
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 font-medium">상태</th>
                  <th className="px-3 py-2 font-medium">홀드 기간</th>
                  <th className="px-3 py-2 font-medium">길이</th>
                  <th className="px-3 py-2 font-medium">구독자</th>
                  <th className="px-3 py-2 font-medium">구독 기간</th>
                  <th className="px-3 py-2 font-medium">신청일</th>
                </tr>
              </thead>
              <tbody>
                {initialRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      표시할 홀드가 없습니다
                    </td>
                  </tr>
                ) : (
                  initialRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status] ?? ""}`}
                        >
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.start_date} ~ {row.end_date}
                      </td>
                      <td className="px-3 py-2 text-xs">{row.duration_kind}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-[180px] truncate font-medium">
                          {row.user_real_name ?? "—"}
                        </div>
                        <div className="max-w-[180px] truncate text-xs text-muted-foreground">
                          {row.user_email ?? ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.target_month ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleString("ko-KR", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
