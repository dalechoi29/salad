"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Loader2,
  ArrowLeft,
  Save,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import {
  updateUserPermissions,
  promoteToAdmin,
  demoteFromAdmin,
} from "@/lib/actions/admin";

interface AdminUser {
  id: string;
  realName: string;
  email: string;
  role: string;
  permissions: string[];
}

interface RegularUser {
  id: string;
  realName: string;
  email: string;
}

interface RolesManagementProps {
  initialAdminUsers: AdminUser[];
  regularUsers: RegularUser[];
}

const PERMISSION_GROUPS = (() => {
  const groups = new Map<string, { key: string; label: string }[]>();
  for (const p of ALL_PERMISSIONS) {
    const list = groups.get(p.group) ?? [];
    list.push({ key: p.key, label: p.label });
    groups.set(p.group, list);
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
})();

export function RolesManagement({
  initialAdminUsers,
  regularUsers,
}: RolesManagementProps) {
  const [adminUsers, setAdminUsers] = useState(initialAdminUsers);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [editingPerms, setEditingPerms] = useState<Map<string, Set<string>>>(
    new Map(adminUsers.map((u) => [u.id, new Set(u.permissions)]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [promoteUserId, setPromoteUserId] = useState<string>("");
  const [isPromoting, setIsPromoting] = useState(false);
  const [isDemoting, setIsDemoting] = useState<string | null>(null);

  function togglePermission(userId: string, permission: string) {
    setEditingPerms((prev) => {
      const next = new Map(prev);
      const userPerms = new Set(next.get(userId) ?? []);
      if (userPerms.has(permission)) {
        userPerms.delete(permission);
      } else {
        userPerms.add(permission);
      }
      next.set(userId, userPerms);
      return next;
    });
  }

  function toggleGroup(userId: string, groupKeys: string[]) {
    setEditingPerms((prev) => {
      const next = new Map(prev);
      const userPerms = new Set(next.get(userId) ?? []);
      const allChecked = groupKeys.every((k) => userPerms.has(k));
      for (const k of groupKeys) {
        if (allChecked) {
          userPerms.delete(k);
        } else {
          userPerms.add(k);
        }
      }
      next.set(userId, userPerms);
      return next;
    });
  }

  async function handleSave(userId: string) {
    setSavingId(userId);
    const perms = Array.from(editingPerms.get(userId) ?? []);
    const result = await updateUserPermissions(userId, perms);
    setSavingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("권한이 저장되었습니다");
    setAdminUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, permissions: perms } : u))
    );
  }

  async function handlePromote() {
    if (!promoteUserId) return;
    setIsPromoting(true);
    const result = await promoteToAdmin(promoteUserId);
    setIsPromoting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    const promoted = regularUsers.find((u) => u.id === promoteUserId);
    if (promoted) {
      const newAdmin: AdminUser = {
        id: promoted.id,
        realName: promoted.realName,
        email: promoted.email,
        role: "admin",
        permissions: [],
      };
      setAdminUsers((prev) => [...prev, newAdmin]);
      setEditingPerms((prev) => {
        const next = new Map(prev);
        next.set(promoted.id, new Set());
        return next;
      });
    }

    toast.success("관리자로 지정되었습니다");
    setPromoteUserId("");
  }

  async function handleDemote(userId: string) {
    setIsDemoting(userId);
    const result = await demoteFromAdmin(userId);
    setIsDemoting(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("관리자에서 해제되었습니다");
    setAdminUsers((prev) => prev.filter((u) => u.id !== userId));
    setEditingPerms((prev) => {
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }

  function hasChanged(userId: string): boolean {
    const original = new Set(
      adminUsers.find((u) => u.id === userId)?.permissions ?? []
    );
    const current = editingPerms.get(userId) ?? new Set();
    if (original.size !== current.size) return true;
    for (const p of original) {
      if (!current.has(p)) return true;
    }
    return false;
  }

  const availableRegularUsers = regularUsers.filter(
    (u) => !adminUsers.some((a) => a.id === u.id)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/admin"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <ShieldCheck className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">관리자 권한 설정</h1>
      </div>

      {/* Add admin */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            관리자 추가
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Select value={promoteUserId} onValueChange={(v) => v && setPromoteUserId(v)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="사용자 선택" />
              </SelectTrigger>
              <SelectContent>
                {availableRegularUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.realName} ({u.email})
                  </SelectItem>
                ))}
                {availableRegularUsers.length === 0 && (
                  <SelectItem value="_none" disabled>
                    추가할 수 있는 사용자가 없습니다
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handlePromote}
              disabled={!promoteUserId || isPromoting}
            >
              {isPromoting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Admin users list */}
      {adminUsers.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">등록된 관리자가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {adminUsers.map((admin) => {
            const isExpanded = expandedUser === admin.id;
            const perms = editingPerms.get(admin.id) ?? new Set<string>();
            const changed = hasChanged(admin.id);

            return (
              <Card key={admin.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">{admin.realName}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        관리자
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpandedUser(isExpanded ? null : admin.id)
                        }
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        권한 설정
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{admin.email}</p>
                  {!isExpanded && perms.size > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Array.from(perms).map((p) => {
                        const perm = ALL_PERMISSIONS.find((ap) => ap.key === p);
                        return (
                          <Badge key={p} variant="outline" className="text-xs">
                            {perm?.label ?? p}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 pt-0">
                    <Separator />

                    {PERMISSION_GROUPS.map(({ group, items }) => {
                      const allChecked = items.every((i) => perms.has(i.key));
                      const someChecked =
                        items.some((i) => perms.has(i.key)) && !allChecked;

                      return (
                        <div key={group} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allChecked}
                              indeterminate={someChecked && !allChecked}
                              onCheckedChange={() =>
                                toggleGroup(
                                  admin.id,
                                  items.map((i) => i.key)
                                )
                              }
                            />
                            <span className="text-sm font-semibold text-muted-foreground">
                              {group}
                            </span>
                          </div>
                          <div className="ml-6 space-y-1.5">
                            {items.map((item) => (
                              <label
                                key={item.key}
                                className="flex items-center gap-2 text-sm"
                              >
                                <Checkbox
                                  checked={perms.has(item.key)}
                                  onCheckedChange={() =>
                                    togglePermission(admin.id, item.key)
                                  }
                                />
                                {item.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    <Separator />

                    <div className="flex items-center justify-between">
                      <Dialog>
                        <DialogTrigger
                          render={
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                            />
                          }
                        >
                          <UserMinus className="mr-1.5 h-4 w-4" />
                          관리자 해제
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>관리자 해제</DialogTitle>
                            <DialogDescription>
                              {admin.realName}님을 관리자에서 해제하시겠어요?
                              모든 관리자 권한이 제거됩니다.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <DialogClose render={<Button variant="outline" />}>
                              취소
                            </DialogClose>
                            <Button
                              variant="destructive"
                              onClick={() => handleDemote(admin.id)}
                              disabled={isDemoting === admin.id}
                            >
                              {isDemoting === admin.id && (
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              )}
                              해제
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <Button
                        onClick={() => handleSave(admin.id)}
                        disabled={!changed || savingId === admin.id}
                      >
                        {savingId === admin.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-4 w-4" />
                        )}
                        저장
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
