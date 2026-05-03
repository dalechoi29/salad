import { getHolidays } from "@/lib/actions/holiday";
import {
  getStoreClosures,
  getStoreClosureReplacementNeeds,
} from "@/lib/actions/store-closure";
import { getKSTDate } from "@/lib/utils";
import { HolidayManagement } from "./holiday-management";

export default async function AdminHolidaysPage() {
  const currentYear = getKSTDate().getFullYear();
  const [holidays, storeClosures, replacementNeeds] = await Promise.all([
    getHolidays(currentYear),
    getStoreClosures(currentYear),
    getStoreClosureReplacementNeeds(),
  ]);

  return (
    <HolidayManagement
      initialHolidays={holidays}
      initialStoreClosures={storeClosures}
      initialReplacementNeeds={replacementNeeds}
      year={currentYear}
    />
  );
}
