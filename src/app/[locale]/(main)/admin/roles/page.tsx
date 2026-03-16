import { redirect } from "next/navigation";
import { getCallerAdminRole, getAdminUsersList, getAllUsers } from "@/lib/actions/admin";
import { RolesManagement } from "./roles-management";

export default async function AdminRolesPage() {
  const adminRole = await getCallerAdminRole();
  if (adminRole !== "super_admin") redirect("/admin");

  const [adminUsers, allUsers] = await Promise.all([
    getAdminUsersList(),
    getAllUsers(),
  ]);

  const regularUsers = allUsers
    .filter((u: any) => u.role === "user" && u.status === "approved")
    .map((u: any) => ({ id: u.id, realName: u.real_name, email: u.email }));

  return (
    <RolesManagement
      initialAdminUsers={adminUsers}
      regularUsers={regularUsers}
    />
  );
}
