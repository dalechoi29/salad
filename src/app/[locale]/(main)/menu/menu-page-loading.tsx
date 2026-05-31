"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import anim1 from "@/assets/animations/loading-1.json";
import anim2 from "@/assets/animations/loading-2.json";
import anim3 from "@/assets/animations/loading-3.json";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

const ANIMATIONS = [anim1, anim2, anim3];

function MenuLoadingLottie({ size = 96 }: { size?: number }) {
  const [data] = useState(
    () => ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)]
  );

  return (
    <Lottie
      animationData={data}
      loop
      autoplay
      style={{ width: size, height: size }}
    />
  );
}

function MenuDayCardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: rows }, (_, j) => (
          <div key={j} className="flex gap-3 rounded-lg border p-2">
            <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5 py-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex items-center">
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Full menu page loading — initial navigation and Suspense fallback. */
export function MenuPageLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-col items-center pt-2">
        <MenuLoadingLottie size={96} />
        <p className="-mt-1 text-sm text-muted-foreground">메뉴 불러오는 중...</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-14" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14 w-12 shrink-0 rounded-xl" />
        ))}
      </div>

      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <MenuDayCardSkeleton key={i} rows={2} />
        ))}
      </div>
    </div>
  );
}

/** Per-week loading while switching date chips. */
export function MenuWeekLoading() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-center gap-2 py-1">
        <MenuLoadingLottie size={56} />
        <p className="text-sm text-muted-foreground">이번 주 메뉴 불러오는 중...</p>
      </div>
      {[1, 2].map((i) => (
        <MenuDayCardSkeleton key={i} rows={2} />
      ))}
    </div>
  );
}
