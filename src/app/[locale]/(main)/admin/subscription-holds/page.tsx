import { redirect } from "next/navigation";
import { getCallerAdminRole, getMyPermissions, getAdminSettings } from "@/lib/actions/admin";
import { listSubscriptionHoldsForAdmin } from "@/lib/actions/subscription-hold-admin";
import { createClient } from "@/lib/supabase/server";
import { parseSubscriptionHoldAllowedKindsSetting } from "@/lib/subscription-hold";
import { SubscriptionHoldsClient } from "./subscription-holds-client";
import type { Profile } from "@/types";

export default async function AdminSubscriptionHoldsPage() {
  const [adminRole, permissions] = await Promise.all([
    getCallerAdminRole(),
    getMyPermissions(),
  ]);

  if (
    !adminRole ||
    (adminRole !== "super_admin" && !permissions.includes("subscription_status"))
  ) {
    redirect("/admin");
  }

  const supabase = await createClient();

  const [rows, settings, { data: usersData }] = await Promise.all([
    listSubscriptionHoldsForAdmin(),
    getAdminSettings(),
    supabase
      .from("profiles")
      .select("id, email, real_name, nickname, role, status, subscription_hold_eligible")
      .eq("status", "approved")
      .order("real_name", { ascending: true }),
  ]);

  const approvedUsers = (usersData ?? []) as Profile[];
  const holdAllowedKinds = parseSubscriptionHoldAllowedKindsSetting(
    settings.subscription_hold_allowed_duration_kinds
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <SubscriptionHoldsClient
        initialRows={rows}
        initialHoldMasterEnabled={settings.subscription_hold_master_enabled === "true"}
        initialHoldAllowedKinds={holdAllowedKinds}
        initialUsers={approvedUsers}
      />
    </div>
  );
}
