"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Profile, AllowedDomain } from "@/types";

interface UserManagementProps {
  initialUsers: Profile[];
  initialDomains: AllowedDomain[];
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  disabled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function UserManagement({
  initialUsers,
  initialDomains,
}: UserManagementProps) {
  const t = useTranslations("nav");
  const [users, setUsers] = useState(initialUsers);
  const [domains, setDomains] = useState(initialDomains);
  const [newDomain, setNewDomain] = useState("");
  const [approvePassword, setApprovePassword] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleApprove(userId: string) {
    if (!approvePassword || approvePassword.length !== 4) {
      toast.error("Please enter a 4-digit password");
      return;
    }

    setLoadingId(userId);
    const result = await approveUser(userId, approvePassword);
    setLoadingId(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("User approved");
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

    toast.success("User disabled");
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: "disabled" as const } : u))
    );
  }

  async function handleAddDomain() {
    if (!newDomain.trim()) return;

    const result = await addAllowedDomain(newDomain);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Domain added");
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

    toast.success("Domain removed");
    setDomains((prev) => prev.filter((d) => d.id !== id));
  }

  const pendingUsers = users.filter((u) => u.status === "pending");
  const otherUsers = users.filter((u) => u.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Shield className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
      </div>

      {/* Allowed Domains */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4" />
            Allowed Email Domains
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. company.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
            />
            <Button size="sm" onClick={handleAddDomain}>
              <Plus className="mr-1 h-4 w-4" />
              Add
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
              Pending Approval ({pendingUsers.length})
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
                      Nickname: {user.nickname}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Dialog>
                      <DialogTrigger
                        render={<Button size="sm" variant="default" />}
                      >
                        <UserCheck className="mr-1 h-4 w-4" />
                        Approve
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Approve {user.real_name}</DialogTitle>
                          <DialogDescription>
                            Assign a 4-digit password for {user.email}
                          </DialogDescription>
                        </DialogHeader>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="\d{4}"
                          maxLength={4}
                          placeholder="4-digit password"
                          value={approvePassword}
                          onChange={(e) =>
                            setApprovePassword(
                              e.target.value.replace(/\D/g, "").slice(0, 4)
                            )
                          }
                        />
                        <DialogFooter>
                          <DialogClose render={<Button variant="outline" />}>
                            Cancel
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
                            Approve
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

      {/* All Users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {otherUsers.map((user, index) => (
            <div key={user.id}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{user.real_name}</p>
                    {user.role === "admin" && (
                      <Badge variant="default" className="text-xs">
                        Admin
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[user.status]}`}
                  >
                    {user.status}
                  </span>
                  {user.status === "approved" && user.role !== "admin" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDisable(user.id)}
                      disabled={loadingId === user.id}
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {index < otherUsers.length - 1 && <Separator />}
            </div>
          ))}
          {otherUsers.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No approved or disabled users yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
