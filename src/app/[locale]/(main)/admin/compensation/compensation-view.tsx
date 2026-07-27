"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Gift, CheckCircle2, Clock } from "lucide-react";
import {
  type CompensationCredit,
  addCompensationCredit,
  updateCompensationCredit,
  deleteCompensationCredit,
  revertCompensationCreditApplication,
} from "@/lib/actions/admin";

type UserRow = { id: string; real_name: string | null; email: string | null };

interface Props {
  initialCredits: CompensationCredit[];
  users: UserRow[];
}

const EMPTY_FORM = {
  userId: "",
  days: 1,
  sourcePeriod: "",
  reason: "",
  adminNotes: "",
};

export function CompensationView({ initialCredits, users }: Props) {
  const [credits, setCredits] = useState<CompensationCredit[]>(initialCredits);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const pendingCredits = credits.filter((c) => !c.appliedAt);
  const appliedCredits = credits.filter((c) => !!c.appliedAt);

  // Group pending by user for the summary header
  const pendingSummary = pendingCredits.reduce<
    Record<string, { realName: string; totalDays: number }>
  >((acc, c) => {
    if (!acc[c.userId]) {
      acc[c.userId] = { realName: c.realName, totalDays: 0 };
    }
    acc[c.userId].totalDays += c.days;
    return acc;
  }, {});

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(credit: CompensationCredit) {
    setEditingId(credit.id);
    setForm({
      userId: credit.userId,
      days: credit.days,
      sourcePeriod: credit.sourcePeriod,
      reason: credit.reason ?? "",
      adminNotes: credit.adminNotes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.userId) { toast.error("사용자를 선택해주세요"); return; }
    if (!form.sourcePeriod.trim()) { toast.error("출처 기간을 입력해주세요"); return; }
    if (form.days < 1) { toast.error("1일 이상이어야 합니다"); return; }

    startTransition(async () => {
      let result;
      if (editingId) {
        result = await updateCompensationCredit(editingId, {
          days: form.days,
          sourcePeriod: form.sourcePeriod,
          reason: form.reason || null,
          adminNotes: form.adminNotes || null,
        });
      } else {
        result = await addCompensationCredit({
          userId: form.userId,
          days: form.days,
          sourcePeriod: form.sourcePeriod,
          reason: form.reason || undefined,
          adminNotes: form.adminNotes || undefined,
        });
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editingId ? "수정되었습니다" : "추가되었습니다");
      setDialogOpen(false);

      // Refresh list
      const user = users.find((u) => u.id === form.userId);
      if (editingId) {
        setCredits((prev) =>
          prev.map((c) =>
            c.id === editingId
              ? {
                  ...c,
                  days: form.days,
                  sourcePeriod: form.sourcePeriod,
                  reason: form.reason || null,
                  adminNotes: form.adminNotes || null,
                }
              : c
          )
        );
      } else {
        const newCredit: CompensationCredit = {
          id: crypto.randomUUID(),
          userId: form.userId,
          realName: user?.real_name ?? form.userId,
          days: form.days,
          sourcePeriod: form.sourcePeriod,
          reason: form.reason || null,
          adminNotes: form.adminNotes || null,
          appliedToSubscriptionId: null,
          appliedAt: null,
          createdAt: new Date().toISOString(),
        };
        setCredits((prev) => [newCredit, ...prev]);
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("이 보상 크레딧을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      const result = await deleteCompensationCredit(id);
      if (result.error) { toast.error(result.error); return; }
      toast.success("삭제되었습니다");
      setCredits((prev) => prev.filter((c) => c.id !== id));
    });
  }

  function handleRevert(id: string) {
    if (!confirm("적용 상태를 되돌려 미적용으로 표시할까요?")) return;
    startTransition(async () => {
      const result = await revertCompensationCreditApplication(id);
      if (result.error) { toast.error(result.error); return; }
      toast.success("미적용으로 되돌렸습니다");
      setCredits((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, appliedAt: null, appliedToSubscriptionId: null }
            : c
        )
      );
    });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  const sortedUsers = [...users].sort((a, b) =>
    (a.real_name ?? "").localeCompare(b.real_name ?? "")
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          <h1 className="text-xl font-bold">보상 크레딧 관리</h1>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          보상 추가
        </Button>
      </div>

      {/* Pending summary */}
      {Object.keys(pendingSummary).length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            미적용 보상 현황
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.values(pendingSummary).map((s) => (
              <span
                key={s.realName}
                className="rounded-full bg-amber-200 px-3 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
              >
                {s.realName} · {s.totalDays}일
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pending credits */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <Clock className="h-4 w-4" />
          미적용 ({pendingCredits.length})
        </h2>
        {pendingCredits.length === 0 ? (
          <p className="text-sm text-muted-foreground">미적용 보상이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {pendingCredits.map((c) => (
              <CreditRow
                key={c.id}
                credit={c}
                onEdit={() => openEdit(c)}
                onDelete={() => handleDelete(c.id)}
                formatDate={formatDate}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Applied credits */}
      {appliedCredits.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            적용 완료 ({appliedCredits.length})
          </h2>
          <ul className="space-y-2">
            {appliedCredits.map((c) => (
              <CreditRow
                key={c.id}
                credit={c}
                onEdit={() => openEdit(c)}
                onDelete={() => handleDelete(c.id)}
                onRevert={() => handleRevert(c.id)}
                formatDate={formatDate}
                applied
              />
            ))}
          </ul>
        </section>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "보상 수정" : "보상 추가"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!editingId && (
              <div className="space-y-1.5">
                <Label>사용자</Label>
                <Select
                  value={form.userId}
                  onValueChange={(v) => setForm((f) => ({ ...f, userId: v ?? "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="사용자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.real_name ?? u.email ?? u.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>보상 일수</Label>
              <Input
                type="number"
                min={1}
                value={form.days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, days: parseInt(e.target.value) || 1 }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>출처 기간</Label>
              <Input
                placeholder="예: 2026년 6월"
                value={form.sourcePeriod}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourcePeriod: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>사유</Label>
              <Input
                placeholder="예: 6월 구독 초과 납부"
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>관리자 메모 (선택)</Label>
              <Textarea
                rows={2}
                value={form.adminNotes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, adminNotes: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreditRow({
  credit,
  onEdit,
  onDelete,
  onRevert,
  formatDate,
  applied = false,
}: {
  credit: CompensationCredit;
  onEdit: () => void;
  onDelete: () => void;
  onRevert?: () => void;
  formatDate: (iso: string) => string;
  applied?: boolean;
}) {
  return (
    <li className="flex items-start justify-between rounded-lg border bg-card p-3 text-sm">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{credit.realName}</span>
          <Badge
            variant={applied ? "secondary" : "outline"}
            className={
              applied
                ? "text-green-700 dark:text-green-400"
                : "border-amber-400 text-amber-700 dark:text-amber-400"
            }
          >
            {applied ? (
              credit.adminNotes?.startsWith("archive:applied:") ? "기록 복원" : "적용 완료"
            ) : (
              `+${credit.days}일 미적용`
            )}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          출처: {credit.sourcePeriod}
          {credit.reason && ` · ${credit.reason}`}
        </p>
        {credit.appliedAt && (
          <p className="text-xs text-muted-foreground">
            적용일: {formatDate(credit.appliedAt)}
          </p>
        )}
        {credit.adminNotes?.startsWith("archive:applied:") ? (
          <p className="text-xs text-muted-foreground">
            관리자 삭제분 기록 복원 (재적용되지 않음)
          </p>
        ) : credit.adminNotes ? (
          <p className="text-xs text-muted-foreground">메모: {credit.adminNotes}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          등록: {formatDate(credit.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        {applied && onRevert && !credit.adminNotes?.startsWith("archive:applied:") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onRevert}
          >
            되돌리기
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {!credit.adminNotes?.startsWith("archive:applied:") && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        )}
      </div>
    </li>
  );
}
