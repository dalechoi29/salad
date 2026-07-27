"use server";

import { createAdminClient, createClient, getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type AdminNotificationType =
  | "delivery_postpone"
  | "delivery_reschedule";

export type AdminNotification = {
  id: string;
  type: AdminNotificationType;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  read: boolean;
  targetUserId: string;
  targetUserName: string | null;
};

type NotificationRow = {
  id: string;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  target_user_id: string;
};

type ReadRow = {
  notification_id: string;
};

function formatDatesKR(dates: string[]): string {
  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  return dates
    .map((iso) => {
      const d = new Date(iso + "T00:00:00");
      return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
    })
    .join(", ");
}

async function getProfileName(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("real_name")
    .eq("id", userId)
    .maybeSingle();
  return (data?.real_name as string | null) ?? null;
}

async function requireAdminUser() {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return null;
  }
  return user;
}

export async function notifyAdminsOfDeliveryPostpone(input: {
  targetUserId: string;
  subscriptionId: string;
  targetMonth: string;
  skippedDates: string[];
  actorUserId: string;
}): Promise<void> {
  if (input.skippedDates.length === 0) return;

  const name = (await getProfileName(input.targetUserId)) ?? "회원";
  const datesLabel = formatDatesKR(input.skippedDates);
  const message = `${name}님이 ${input.targetMonth} 구독 배송 ${datesLabel}을(를) 연기했어요.`;

  const admin = createAdminClient();
  await admin.from("admin_notifications").insert({
    type: "delivery_postpone",
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    subscription_id: input.subscriptionId,
    message,
    metadata: {
      targetMonth: input.targetMonth,
      skippedDates: input.skippedDates,
    },
  });
}

export async function notifyAdminsOfDeliveryReschedule(input: {
  targetUserId: string;
  subscriptionId: string;
  targetMonth: string;
  skippedDates: string[];
  replacementDates: string[];
  actorUserId: string;
}): Promise<void> {
  if (input.skippedDates.length === 0) return;

  const name = (await getProfileName(input.targetUserId)) ?? "회원";
  const fromLabel = formatDatesKR(input.skippedDates);
  const toLabel = formatDatesKR(input.replacementDates);
  const message = `${name}님이 ${input.targetMonth} 구독 배송 ${fromLabel}을(를) ${toLabel}(으)로 변경했어요.`;

  const admin = createAdminClient();
  await admin.from("admin_notifications").insert({
    type: "delivery_reschedule",
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    subscription_id: input.subscriptionId,
    message,
    metadata: {
      targetMonth: input.targetMonth,
      skippedDates: input.skippedDates,
      replacementDates: input.replacementDates,
    },
  });
}

export async function getAdminNotifications(
  limit = 30
): Promise<AdminNotification[]> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return [];

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("admin_notifications")
    .select("id, type, message, metadata, created_at, target_user_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: reads } = await supabase
    .from("admin_notification_reads")
    .select("notification_id")
    .eq("admin_user_id", adminUser.id);

  const readSet = new Set(
    ((reads ?? []) as ReadRow[]).map((r) => r.notification_id)
  );

  return ((rows ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type as AdminNotificationType,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    read: readSet.has(row.id),
    targetUserId: row.target_user_id,
    targetUserName: null,
  }));
}

export async function getAdminUnreadNotificationCount(): Promise<number> {
  const adminUser = await requireAdminUser();
  if (!adminUser) return 0;

  const supabase = await createClient();
  const { data: notifications } = await supabase
    .from("admin_notifications")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!notifications?.length) return 0;

  const ids = ((notifications ?? []) as { id: string }[]).map((n) => n.id);
  const { data: reads } = await supabase
    .from("admin_notification_reads")
    .select("notification_id")
    .eq("admin_user_id", adminUser.id)
    .in("notification_id", ids);

  const readSet = new Set(
    ((reads ?? []) as ReadRow[]).map((r) => r.notification_id)
  );
  return ids.filter((id: string) => !readSet.has(id)).length;
}

export async function markAdminNotificationsRead(
  notificationIds: string[]
): Promise<void> {
  const adminUser = await requireAdminUser();
  if (!adminUser || notificationIds.length === 0) return;

  const supabase = await createClient();
  const rows = notificationIds.map((notificationId) => ({
    notification_id: notificationId,
    admin_user_id: adminUser.id,
  }));

  await supabase
    .from("admin_notification_reads")
    .upsert(rows, { onConflict: "notification_id,admin_user_id" });

  revalidatePath("/", "layout");
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  const notifications = await getAdminNotifications(100);
  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
  await markAdminNotificationsRead(unreadIds);
}
