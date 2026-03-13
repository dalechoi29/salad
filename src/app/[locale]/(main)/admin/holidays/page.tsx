import { getHolidays } from "@/lib/actions/holiday";
import { HolidayManagement } from "./holiday-management";

export default async function AdminHolidaysPage() {
  const currentYear = new Date().getFullYear();
  const holidays = await getHolidays(currentYear);

  return <HolidayManagement initialHolidays={holidays} year={currentYear} />;
}
