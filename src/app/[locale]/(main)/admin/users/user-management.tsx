"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  approveUser,
  disableUser,
  enableUser,
  addAllowedDomain,
  removeAllowedDomain,
} from "@/lib/actions/admin";
import { toast } from "sonner";
import {
  UserCheck,
  UserX,
  Shield,
  Globe,
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  UserPlus,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Profile, AllowedDomain } from "@/types";

interface UserManagementProps {
  initialUsers: Profile[];
  initialDomains: AllowedDomain[];
}

const statusLabels: Record<string, string> = {
  pending: "승인 대기",
  approved: "승인됨",
  disabled: "비활성화",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  disabled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function UserManagement({
  initialUsers,
  initialDomains,
}: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers);
  const [domains, setDomains] = useState(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [approvePassword, setApprovePassword] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleApprove(userId: string) {
    if (!approvePassword || approvePassword.length !== 4) {
      toast.error("4자리 비밀번호를 입력해주세요");
      return;
    }

    setLoadingId(userId);
    const result = await approveUser(userId, approvePassword);
    setLoadingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("사용자가 승인되었습니다");
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: "approved" as const } : u))
    );
    setApprovePassword("");
  }

  async function handleDisable(userId: string) {
    setLoadingId(userId);
    const result = await disableUser(userId);
    setLoadingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("사용자가 비활성화되었습니다");
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: "disabled" as const } : u))
    );
  }

  async function handleEnable(userId: string) {
    setLoadingId(userId);
    const result = await enableUser(userId);
    setLoadingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("사용자가 다시 활성화되었습니다");
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: "approved" as const } : u))
    );
  }

  async function handleAddDomain() {
    if (!newDomain.trim()) return;

    const result = await addAllowedDomain(newDomain);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("도메인이 추가되었습니다");
    setNewDomain("");
    setDomains((prev) => [
      ...prev,
      { id: crypto.randomUUID(), domain: newDomain.replace(/^@/, "").trim() },
    ]);
  }

  async function handleRemoveDomain(id: string) {
    const result = await removeAllowedDomain(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("도메인이 삭제되었습니다");
    setDomains((prev) => prev.filter((d) => d.id !== id));
  }

  const pendingUsers = users.filter((u) => u.status === "pending");
  const activeUsers = users.filter((u) => u.status === "approved");
  const disabledUsers = users.filter((u) => u.status === "disabled");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Shield className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">사용자 관리</h1>
      </div>

      {/* Allowed Domains */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            허용 이메일 도메인
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="예: company.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
            />
            <Button size="sm" onClick={handleAddDomain}>
              <Plus className="mr-1 h-4 w-4" />
              추가
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {domains.map((domain) => (
              <Badge
                key={domain.id}
                variant="secondary"
                className="gap-1 px-3 py-1"
              >
                @{domain.domain}
                <button
                  onClick={() => handleRemoveDomain(domain.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-destructive/20"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4" />
              승인 대기 ({pendingUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-0">
            {pendingUsers.map((user, index) => (
              <div key={user.id}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{user.real_name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      닉네임: {user.nickname}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger
                        render={<Button size="sm" variant="default" />}
                      >
                        <UserCheck className="mr-1 h-4 w-4" />
                        승인
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{user.real_name} 승인</DialogTitle>
                          <DialogDescription>
                            {user.email}에 4자리 비밀번호를 지정해주세요
                          </DialogDescription>
                        </DialogHeader>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="\d{4}"
                          maxLength={4}
                          placeholder="4자리 비밀번호"
                          value={approvePassword}
                          onChange={(e) =>
                            setApprovePassword(
                              e.target.value.replace(/\D/g, "").slice(0, 4)
                            )
                          }
                        />
                        <DialogFooter>
                          <DialogClose render={<Button variant="outline" />}>
                            취소
                          </DialogClose>
                          <Button
                            onClick={() => handleApprove(user.id)}
                            disabled={
                              loadingId === user.id ||
                              approvePassword.length !== 4
                            }
                          >
                            {loadingId === user.id && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            승인
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                {index < pendingUsers.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" />
            활성 사용자 ({activeUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {activeUsers.map((user, index) => (
            <div key={user.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{user.real_name}</p>
                    {user.role === "admin" && (
                      <Badge variant="default" className="text-xs">
                        관리자
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors.approved}`}
                  >
                    {statusLabels.approved}
                  </span>
                  {user.role !== "admin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDisable(user.id)}
                      disabled={loadingId === user.id}
                      title="비활성화"
                    >
                      {loadingId === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserX className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
              {index < activeUsers.length - 1 && <Separator />}
            </div>
          ))}
          {activeUsers.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              활성 사용자가 없습니다
            </p>
          )}
        </CardContent>
      </Card>

      {/* Disabled Users */}
      {disabledUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserX className="h-4 w-4" />
              비활성화된 사용자 ({disabledUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-0">
            {disabledUsers.map((user, index) => (
              <div key={user.id}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-muted-foreground">{user.real_name}</p>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors.disabled}`}
                    >
                      {statusLabels.disabled}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEnable(user.id)}
                      disabled={loadingId === user.id}
                    >
                      {loadingId === user.id ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="mr-1 h-4 w-4" />
                      )}
                      활성화
                    </Button>
                  </div>
                </div>
                {index < disabledUsers.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
