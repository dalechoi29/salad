import { redirect } from "next/navigation";
import {
  getCallerAdminRole,
  getMyPermissions,
  getCompensationCredits,
} from "@/lib/actions/admin";
import { getAllUsers } from "@/lib/actions/admin";
import { CompensationView } from "./compensation-view";

export default async function AdminCompensationPage() {
  const [adminRole, permissions, credits, users] = await Promise.all([
    getCallerAdminRole(),
    getMyPermissions(),
    getCompensationCredits(),
    getAllUsers(),
  ]);

  if (
    !adminRole ||
    (adminRole !== "super_admin" && !permissions.includes("subscription_status"))
  ) {
    redirect("/admin");
  }

  return <CompensationView initialCredits={credits} users={users} />;
}
