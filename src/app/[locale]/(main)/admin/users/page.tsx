import { getAllUsers, getAllowedDomains, getCallerAdminRole, getMyPermissions } from "@/lib/actions/admin";
import { UserManagement } from "./user-management";
import { redirect } from "next/navigation";

export default async function AdminUsersPage() {
  const [users, domains, adminRole, permissions] = await Promise.all([
    getAllUsers(),
    getAllowedDomains(),
    getCallerAdminRole(),
    getMyPermissions(),
  ]);

  if (!adminRole || !permissions.includes("users.view")) {
    redirect("/admin");
  }

  return (
    <UserManagement
      initialUsers={users}
      initialDomains={domains}
      permissions={permissions}
    />
  );
}
