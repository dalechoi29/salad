import { getHolidays } from "@/lib/actions/holiday";
import { getKSTDate } from "@/lib/utils";
import { HolidayManagement } from "./holiday-management";

export default async function AdminHolidaysPage() {
  const currentYear = getKSTDate().getFullYear();
  const holidays = await getHolidays(currentYear);

  return <HolidayManagement initialHolidays={holidays} year={currentYear} />;
}
