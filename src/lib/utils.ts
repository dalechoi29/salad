import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DeliveryDay } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayStr(): string {
  return formatDateISO(new Date());
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()} (${DAY_NAMES[d.getDay()]})`;
}

export function formatDateCompact(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${DAY_NAMES[d.getDay()]}요일)`;
}

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR");
}

export function countSelectedDays(
  deliveryDays: { selected_days: number[] }[]
): number {
  return deliveryDays.reduce((sum, d) => sum + d.selected_days.length, 0);
}

export function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

export function deliveryDaysToDateStrings(days: DeliveryDay[]): string[] {
  const dates: string[] = [];
  for (const dd of days) {
    for (const dayOfWeek of dd.selected_days) {
      const weekStart = new Date(dd.week_start + "T00:00:00");
      const date = new Date(weekStart);
      date.setDate(date.getDate() + (dayOfWeek - 1));
      dates.push(formatDateISO(date));
    }
  }
  return dates.sort();
}
