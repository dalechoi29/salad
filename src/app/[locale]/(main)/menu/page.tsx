import { Suspense } from "react";
import {
  getMenuPageShellData,
  getMenuPageWeekData,
  getMenuPagePeriodSelections,
} from "@/lib/actions/menu-page";
import { shellToViewProps } from "@/lib/menu-page-types";
import { MenuPageLoading } from "./menu-page-loading";
import { MenuSelectionView } from "./menu-selection-view";
import { MenuWeekHydrationProvider } from "./menu-week-hydration";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const focusDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : undefined;

  return (
    <Suspense fallback={<MenuPageLoading />}>
      <MenuPageContent focusDate={focusDate} />
    </Suspense>
  );
}

async function MenuPageContent({ focusDate }: { focusDate?: string }) {
  const shell = await getMenuPageShellData(focusDate);
  const [weekData, periodSelections] = await Promise.all([
    getMenuPageWeekData(shell.initialWeekStart, shell.initialWeekEnd),
    getMenuPagePeriodSelections(shell.deliveryStart, shell.deliveryEnd),
  ]);

  return (
    <MenuWeekHydrationProvider>
      <MenuSelectionView
        {...shellToViewProps(shell)}
        initialMenus={weekData.menus}
        initialSelections={periodSelections}
      />
    </MenuWeekHydrationProvider>
  );
}
