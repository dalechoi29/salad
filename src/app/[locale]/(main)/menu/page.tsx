import { Suspense } from "react";
import { getMenuPageShellData } from "@/lib/actions/menu-page";
import { shellToViewProps } from "@/lib/menu-page-types";
import { MenuSelectionView } from "./menu-selection-view";
import { MenuWeekHydrationProvider } from "./menu-week-hydration";
import { MenuWeekServerLoader } from "./menu-week-loader";

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
    <Suspense fallback={null}>
      <MenuPageContent focusDate={focusDate} />
    </Suspense>
  );
}

async function MenuPageContent({ focusDate }: { focusDate?: string }) {
  const shell = await getMenuPageShellData(focusDate);

  return (
    <MenuWeekHydrationProvider>
      <MenuSelectionView {...shellToViewProps(shell)} weekDataPending />
      <Suspense fallback={null}>
        <MenuWeekServerLoader
          weekStart={shell.initialWeekStart}
          weekEnd={shell.initialWeekEnd}
          weekKey={shell.initialWeekMonday}
        />
      </Suspense>
    </MenuWeekHydrationProvider>
  );
}
