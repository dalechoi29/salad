import { redirect, notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getAdminUserDetail } from "@/lib/actions/admin";
import { UserDetailView } from "./user-detail-view";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { userId } = await params;

  const profile = await getCurrentProfile();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const detail = await getAdminUserDetail(userId);
  if (!detail) notFound();

  return <UserDetailView detail={detail} />;
}
