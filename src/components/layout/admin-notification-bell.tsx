"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, CalendarX2, RefreshCw } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getAdminNotifications,
  getAdminUnreadNotificationCount,
  markAdminNotificationsRead,
  markAllAdminNotificationsRead,
  type AdminNotification,
} from "@/lib/actions/admin-notifications";
import { cn } from "@/lib/utils";

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function NotificationIcon({ type }: { type: AdminNotification["type"] }) {
  if (type === "delivery_reschedule") {
    return <RefreshCw className="h-4 w-4 shrink-0 text-blue-500" />;
  }
  return <CalendarX2 className="h-4 w-4 shrink-0 text-amber-500" />;
}

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const [count, items] = await Promise.all([
        getAdminUnreadNotificationCount(),
        getAdminNotifications(30),
      ]);
      setUnreadCount(count);
      setNotifications(items);
    });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    const items = await getAdminNotifications(30);
    setNotifications(items);
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await markAdminNotificationsRead(unreadIds);
      setUnreadCount(0);
      setNotifications(items.map((n) => ({ ...n, read: true })));
    }
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllAdminNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            aria-label="관리자 알림"
          />
        }
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <PopoverHeader className="flex flex-row items-center justify-between border-b px-3 py-2.5">
          <PopoverTitle className="text-sm font-semibold">알림</PopoverTitle>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              모두 읽음
            </button>
          )}
        </PopoverHeader>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              새 알림이 없어요
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/admin/users/${n.targetUserId}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex gap-2.5 px-3 py-3 transition-colors hover:bg-accent/50",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <NotificationIcon type={n.type} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm leading-snug">{n.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
