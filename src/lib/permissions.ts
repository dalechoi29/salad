export const ALL_PERMISSIONS = [
  { key: "users.view", label: "사용자 목록 조회", group: "사용자 관리" },
  { key: "users.approve", label: "사용자 승인", group: "사용자 관리" },
  { key: "users.reset_password", label: "비밀번호 재설정", group: "사용자 관리" },
  { key: "users.disable", label: "사용자 비활성화/활성화", group: "사용자 관리" },
  { key: "users.delete", label: "사용자 삭제", group: "사용자 관리" },
  { key: "users.domains", label: "허용 도메인 관리", group: "사용자 관리" },
  { key: "dashboard", label: "대시보드", group: "전체 추이" },
  { key: "subscription_status", label: "구독 현황", group: "전체 추이" },
  { key: "delivery_summary", label: "배달 현황", group: "전체 추이" },
  { key: "vendor_report", label: "납품 보고서", group: "전체 추이" },
  { key: "subscriptions", label: "구독 기간 관리", group: "등록 및 관리" },
  { key: "menus", label: "메뉴 관리", group: "등록 및 관리" },
  { key: "holidays", label: "공휴일 관리", group: "등록 및 관리" },
  { key: "settings", label: "마감일 관리", group: "등록 및 관리" },
  { key: "community", label: "커뮤니티 관리", group: "커뮤니티" },
  { key: "categories", label: "커뮤니티 카테고리", group: "커뮤니티" },
] as const;

export type PermissionKey = (typeof ALL_PERMISSIONS)[number]["key"];
