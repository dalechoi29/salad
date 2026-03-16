import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { getCallerAdminRole, getMyPermissions } from "@/lib/actions/admin";
import { redirect } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  Users,
  UtensilsCrossed,
  CalendarOff,
  BarChart3,
  MessageSquare,
  CreditCard,
  LayoutDashboard,
  FileSpreadsheet,
  Tag,
  TrendingUp,
  Settings,
  Leaf,
  CalendarCheck,
  Salad,
} from "lucide-react";

interface AdminMenuItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  permission?: string;
}

interface AdminSection {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: AdminMenuItem[];
}

const adminSections: AdminSection[] = [
  {
    label: "전체 추이",
    icon: TrendingUp,
    items: [
      {
        href: "/admin/dashboard",
        icon: LayoutDashboard,
        title: "대시보드",
        description: "구독자, 수령률, 메뉴 인기도 등 주요 지표",
        permission: "dashboard",
      },
      {
        href: "/admin/subscription-status",
        icon: CalendarCheck,
        title: "구독 현황",
        description: "이번 달, 다음 달 일별 구독자 수 현황",
        permission: "subscription_status",
      },
      {
        href: "/admin/summary",
        icon: BarChart3,
        title: "배달 현황",
        description: "일별 샐러드 수량 및 메뉴 선택 내역",
        permission: "delivery_summary",
      },
      {
        href: "/admin/reports",
        icon: FileSpreadsheet,
        title: "납품 보고서",
        description: "월별 납품 보고서 조회 및 CSV 내보내기",
        permission: "vendor_report",
      },
    ],
  },
  {
    label: "등록 및 관리",
    icon: Settings,
    items: [
      {
        href: "/admin/users",
        icon: Users,
        title: "사용자 관리",
        description: "사용자 승인, 비밀번호 설정, 도메인 관리",
        permission: "users.view",
      },
      {
        href: "/admin/today",
        icon: Salad,
        title: "오늘의 샐러드",
        description: "오늘 주문 현황, 냉장고 배치 관리",
      },
      {
        href: "/admin/subscriptions",
        icon: CreditCard,
        title: "구독 기간 관리",
        description: "신청 기간 및 결제 기간 설정",
        permission: "subscriptions",
      },
      {
        href: "/admin/menus",
        icon: UtensilsCrossed,
        title: "메뉴 관리",
        description: "메뉴 생성, 수정, 일일 배정",
        permission: "menus",
      },
      {
        href: "/admin/holidays",
        icon: CalendarOff,
        title: "공휴일 관리",
        description: "공휴일 추가 및 배달 일정 관리",
        permission: "holidays",
      },
      {
        href: "/admin/settings",
        icon: CalendarOff,
        title: "마감일 관리",
        description: "메뉴 선택 마감일 설정",
        permission: "settings",
      },
    ],
  },
  {
    label: "커뮤니티",
    icon: Leaf,
    items: [
      {
        href: "/admin/community",
        icon: MessageSquare,
        title: "커뮤니티 관리",
        description: "게시글 및 댓글 관리, 삭제",
        permission: "community",
      },
      {
        href: "/admin/categories",
        icon: Tag,
        title: "커뮤니티 카테고리",
        description: "카테고리 추가, 삭제, 순서 변경",
        permission: "categories",
      },
    ],
  },
];

export default async function AdminPage() {
  const t = await getTranslations("nav");
  const [adminRole, myPermissions] = await Promise.all([
    getCallerAdminRole(),
    getMyPermissions(),
  ]);

  if (!adminRole) redirect("/");

  const isSuperAdmin = adminRole === "super_admin";
  const permSet = new Set(myPermissions);

  const filteredSections = adminSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || permSet.has(item.permission)
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">{t("admin")}</h1>
      </div>

      {/* Roles management - super_admin only */}
      {isSuperAdmin && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">시스템</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/admin/roles" className="block">
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-sm">관리자 권한 설정</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      관리자 추가, 역할 및 접근 권한 관리
                    </p>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </section>
      )}

      {filteredSections.map((section) => (
        <section key={section.label} className="space-y-3">
          <div className="flex items-center gap-2">
            <section.icon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">
              {section.label}
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.items.map((item) => (
              <Link key={item.title} href={item.href} className="block">
                <Card className="transition-colors hover:bg-accent/50">
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-sm">{item.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
