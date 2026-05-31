"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { DailyMenu, MenuSelection } from "@/types";

type WeekHydrateFn = (
  menus: DailyMenu[],
  selections: MenuSelection[],
  weekKey: string
) => void;

type MenuWeekHydrationContextValue = {
  registerHydrate: (fn: WeekHydrateFn) => () => void;
  hydrateWeek: WeekHydrateFn;
};

const MenuWeekHydrationContext =
  createContext<MenuWeekHydrationContextValue | null>(null);

export function MenuWeekHydrationProvider({ children }: { children: ReactNode }) {
  const hydrateRef = useRef<WeekHydrateFn | null>(null);

  const registerHydrate = useCallback((fn: WeekHydrateFn) => {
    hydrateRef.current = fn;
    return () => {
      if (hydrateRef.current === fn) hydrateRef.current = null;
    };
  }, []);

  const hydrateWeek = useCallback<WeekHydrateFn>((menus, selections, weekKey) => {
    hydrateRef.current?.(menus, selections, weekKey);
  }, []);

  const value = useMemo(
    () => ({ registerHydrate, hydrateWeek }),
    [registerHydrate, hydrateWeek]
  );

  return (
    <MenuWeekHydrationContext.Provider value={value}>
      {children}
    </MenuWeekHydrationContext.Provider>
  );
}

export function useMenuWeekHydration() {
  return useContext(MenuWeekHydrationContext);
}

export function MenuWeekHydrator({
  menus,
  selections,
  weekKey,
}: {
  menus: DailyMenu[];
  selections: MenuSelection[];
  weekKey: string;
}) {
  const ctx = useMenuWeekHydration();

  useEffect(() => {
    ctx?.hydrateWeek(menus, selections, weekKey);
  }, [ctx, menus, selections, weekKey]);

  return null;
}
