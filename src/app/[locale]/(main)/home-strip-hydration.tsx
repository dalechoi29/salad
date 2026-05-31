"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MenuDetail } from "@/lib/menu-display-utils";
import type { HomeStripData } from "@/lib/home-page-types";

type StripHydrateFn = (data: HomeStripData) => void;

type HomeStripHydrationContextValue = {
  registerHydrate: (fn: StripHydrateFn) => () => void;
  hydrateStrip: StripHydrateFn;
  menuDetailByDate: Record<string, MenuDetail[]>;
  availableMenusByDate: Record<string, MenuDetail[]>;
  guestBrowseMenusByDate: Record<string, MenuDetail[]>;
  stripDataPending: boolean;
};

const emptyMaps = {
  menuDetailByDate: {} as Record<string, MenuDetail[]>,
  availableMenusByDate: {} as Record<string, MenuDetail[]>,
  guestBrowseMenusByDate: {} as Record<string, MenuDetail[]>,
};

const HomeStripHydrationContext =
  createContext<HomeStripHydrationContextValue | null>(null);

export function HomeStripHydrationProvider({
  children,
  initialStripData,
  stripDataPending = !initialStripData,
}: {
  children: ReactNode;
  initialStripData?: HomeStripData;
  stripDataPending?: boolean;
}) {
  const hydrateRef = useRef<StripHydrateFn | null>(null);
  const [stripData, setStripData] = useState({
    ...(initialStripData ?? emptyMaps),
    pending: stripDataPending,
  });

  useEffect(() => {
    if (initialStripData) {
      setStripData({ ...initialStripData, pending: stripDataPending });
    }
  }, [initialStripData, stripDataPending]);

  const stripDataRef = useRef(stripData);
  stripDataRef.current = stripData;

  const registerHydrate = useCallback((fn: StripHydrateFn) => {
    hydrateRef.current = fn;
    const data = stripDataRef.current;
    if (!data.pending) {
      fn({
        menuDetailByDate: data.menuDetailByDate,
        availableMenusByDate: data.availableMenusByDate,
        guestBrowseMenusByDate: data.guestBrowseMenusByDate,
      });
    }
    return () => {
      if (hydrateRef.current === fn) hydrateRef.current = null;
    };
  }, []);

  const hydrateStrip = useCallback<StripHydrateFn>((data) => {
    hydrateRef.current?.(data);
    setStripData({ ...data, pending: false });
  }, []);

  const value = useMemo(
    () => ({
      registerHydrate,
      hydrateStrip,
      menuDetailByDate: stripData.menuDetailByDate,
      availableMenusByDate: stripData.availableMenusByDate,
      guestBrowseMenusByDate: stripData.guestBrowseMenusByDate,
      stripDataPending: stripData.pending,
    }),
    [registerHydrate, hydrateStrip, stripData]
  );

  return (
    <HomeStripHydrationContext.Provider value={value}>
      {children}
    </HomeStripHydrationContext.Provider>
  );
}

export function useHomeStripHydration() {
  return useContext(HomeStripHydrationContext);
}

export function HomeStripHydrator({ data }: { data: HomeStripData }) {
  const ctx = useHomeStripHydration();

  useEffect(() => {
    ctx?.hydrateStrip(data);
  }, [ctx, data]);

  return null;
}
