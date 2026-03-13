"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, Holiday } from "@/types";

export async function getHolidays(
  year?: number,
  month?: number
): Promise<Holiday[]> {
  const supabase = await createClient();

  let query = supabase.from("holidays").select("*").order("holiday_date");

  if (year && month) {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
    query = query.gte("holiday_date", start).lt("holiday_date", end);
  } else if (year) {
    query = query
      .gte("holiday_date", `${year}-01-01`)
      .lt("holiday_date", `${year + 1}-01-01`);
  }

  const { data } = await query;
  return (data as Holiday[]) ?? [];
}

async function cleanupDeliveryDaysForHoliday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string
) {
  await supabase.rpc("cleanup_delivery_days_for_holiday", {
    holiday_date_param: date,
  });
}

export async function addHoliday(
  date: string,
  name: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("holidays").insert({
    holiday_date: date,
    name,
    source: "manual",
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "이미 등록된 날짜입니다" };
    }
    return { error: error.message };
  }

  await cleanupDeliveryDaysForHoliday(supabase, date);

  revalidatePath("/admin/holidays");
  revalidatePath("/delivery");
  return { success: true };
}

export async function removeHoliday(id: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.from("holidays").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/holidays");
  revalidatePath("/delivery");
  return { success: true };
}

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  types: string[];
}

export async function importKoreanHolidays(
  year: number
): Promise<ActionResult> {
  const supabase = await createClient();

  let holidays: { holiday_date: string; name: string; source: string }[] = [];

  try {
    const res = await fetch(
      `https://date.nager.at/api/v3/publicholidays/${year}/KR`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) throw new Error(`API returned ${res.status}`);

    const data: NagerHoliday[] = await res.json();

    holidays = data
      .filter((h) => h.types.includes("Public"))
      .map((h) => ({
        holiday_date: h.date,
        name: h.localName,
        source: "api",
      }));
  } catch {
    holidays = getFallbackHolidays(year);
  }

  if (holidays.length === 0) {
    return { error: "공휴일 데이터를 가져올 수 없습니다" };
  }

  const { error } = await supabase
    .from("holidays")
    .upsert(holidays, { onConflict: "holiday_date" });

  if (error) return { error: error.message };

  for (const h of holidays) {
    await cleanupDeliveryDaysForHoliday(supabase, h.holiday_date);
  }

  revalidatePath("/admin/holidays");
  revalidatePath("/delivery");
  return { success: true };
}

function getFallbackHolidays(year: number) {
  const fixed: { month: number; day: number; name: string }[] = [
    { month: 1, day: 1, name: "신정" },
    { month: 3, day: 1, name: "삼일절" },
    { month: 5, day: 5, name: "어린이날" },
    { month: 6, day: 6, name: "현충일" },
    { month: 8, day: 15, name: "광복절" },
    { month: 10, day: 3, name: "개천절" },
    { month: 10, day: 9, name: "한글날" },
    { month: 12, day: 25, name: "성탄절" },
  ];

  return fixed.map(({ month, day, name }) => ({
    holiday_date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    name,
    source: "api",
  }));
}
