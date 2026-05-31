import { Suspense } from "react";
import { getMenuPageShellData, getMenuPageWeekData } from "@/lib/actions/menu-page";
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
  const weekData = await getMenuPageWeekData(
    shell.initialWeekStart,
    shell.initialWeekEnd
  );

  return (
    <MenuWeekHydrationProvider>
      <MenuSelectionView
        {...shellToViewProps(shell)}
        initialMenus={weekData.menus}
        initialSelections={weekData.selections}
      />
    </MenuWeekHydrationProvider>
  );
}
