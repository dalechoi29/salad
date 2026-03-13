import { getAllUsers, getAllowedDomains } from "@/lib/actions/admin";
import { UserManagement } from "./user-management";
import { useTranslations } from "next-intl";

export default async function AdminUsersPage() {
  const [users, domains] = await Promise.all([
    getAllUsers(),
    getAllowedDomains(),
  ]);

  return <UserManagement initialUsers={users} initialDomains={domains} />;
}
