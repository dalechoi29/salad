import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  Users,
  UtensilsCrossed,
  CalendarOff,
  BarChart3,
  MessageSquare,
  CreditCard,
  LayoutDashboard,
  FileSpreadsheet,
} from "lucide-react";

const adminMenuItems = [
  {
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    title: "대시보드",
    description: "구독자, 수령률, 메뉴 인기도 등 주요 지표",
    ready: true,
  },
  {
    href: "/admin/users",
    icon: Users,
    title: "사용자 관리",
    description: "사용자 승인, 비밀번호 설정, 도메인 관리",
    ready: true,
  },
  {
    href: "/admin/subscriptions",
    icon: CreditCard,
    title: "구독 기간 관리",
    description: "신청 기간 및 결제 기간 설정",
    ready: true,
  },
  {
    href: "/admin/menus",
    icon: UtensilsCrossed,
    title: "메뉴 관리",
    description: "메뉴 생성, 수정, 일일 배정",
    ready: true,
  },
  {
    href: "/admin/holidays",
    icon: CalendarOff,
    title: "공휴일 관리",
    description: "공휴일 추가 및 배달 일정 관리",
    ready: true,
  },
  {
    href: "/admin/summary",
    icon: BarChart3,
    title: "배달 현황",
    description: "일별 샐러드 수량 및 메뉴 선택 내역",
    ready: true,
  },
  {
    href: "/admin/reports",
    icon: FileSpreadsheet,
    title: "납품 보고서",
    description: "월별 납품 보고서 조회 및 CSV 내보내기",
    ready: true,
  },
  {
    href: "/admin/community",
    icon: MessageSquare,
    title: "커뮤니티 관리",
    description: "게시글 및 댓글 관리, 삭제",
    ready: true,
  },
];

export default function AdminPage() {
  const t = useTranslations("nav");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">{t("admin")}</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {adminMenuItems.map((item) => (
          <Link key={item.title} href={item.href}>
            <Card
              className={`transition-colors hover:bg-accent/50 ${!item.ready ? "opacity-60" : ""}`}
            >
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-sm">{item.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
                {!item.ready && (
                  <span className="text-xs text-muted-foreground">Soon</span>
                )}
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
