export interface ActionResult {
  success?: boolean;
  error?: string;
}

export type UserRole = "user" | "admin";

export type UserStatus = "pending" | "approved" | "disabled";

export type PaymentMethod = "credit_card" | "gift_certificate" | "bank_transfer";

export type PaymentStatus = "pending" | "completed" | "expired";

export type DietaryPreference =
  | "vegan"
  | "gluten_free"
  | "nut_free"
  | "low_carb"
  | "dairy_free"
  | "high_protein";

export type MenuSlotType = "main" | "optional";

export interface Profile {
  id: string;
  email: string;
  real_name: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  pickup_streak: number;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  period_id: string;
  frequency_per_week: number;
  salads_per_delivery: number;
  total_delivery_days: number | null;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  created_at: string;
}

export interface SubscriptionPeriod {
  id: string;
  apply_start: string;
  apply_end: string;
  pay_start: string;
  pay_end: string;
  delivery_start: string | null;
  delivery_end: string | null;
  target_month: string;
  price_per_salad: number;
  created_at: string;
}

export interface Menu {
  id: string;
  title: string;
  description: string;
  sauce: string;
  protein: number | null;
  kcal: number | null;
  image_url: string | null;
  category: string;
  is_main: boolean;
  is_active: boolean;
  dietary_tags: DietaryPreference[];
  created_at: string;
  updated_at: string;
}

export interface DailyMenu {
  id: string;
  delivery_date: string;
  menu_id: string;
  slot_type: MenuSlotType;
  created_at: string;
  menu?: Menu;
}

export interface MenuSelection {
  id: string;
  user_id: string;
  daily_menu_id: string;
  delivery_date: string;
  created_at: string;
  daily_menu_assignment?: DailyMenu;
}

export interface DeliveryDay {
  id: string;
  user_id: string;
  subscription_id: string;
  week_start: string;
  selected_days: number[];
}

export interface Holiday {
  id: string;
  holiday_date: string;
  name: string;
  source: "manual" | "api";
}

export interface Pickup {
  id: string;
  user_id: string;
  pickup_date: string;
  confirmed: boolean;
  confirmed_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  user_id: string;
  menu_id: string;
  pickup_date: string;
  rating: number;
  comment: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, "nickname">;
  menu?: Pick<Menu, "id" | "title" | "image_url">;
}

export type PostCategory = string;

export interface CommunityCategory {
  id: string;
  key: string;
  label: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: PostCategory;
  vote_count: number;
  created_at: string;
  profile?: Pick<Profile, "nickname">;
  comment_count?: number;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: Pick<Profile, "nickname">;
}

export interface Vote {
  id: string;
  user_id: string;
  post_id: string;
  value: 1 | -1;
}

export interface MenuFavorite {
  id: string;
  user_id: string;
  menu_id: string;
  created_at: string;
  menu?: Menu;
}

export interface AllowedDomain {
  id: string;
  domain: string;
}
