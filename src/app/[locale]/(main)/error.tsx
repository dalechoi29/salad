"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MainLayout Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h2 className="text-lg font-semibold">문제가 발생했습니다</h2>
      <p className="text-sm text-muted-foreground">
        잠시 후 다시 시도해주세요.
      </p>
      <Button onClick={reset}>다시 시도</Button>
    </div>
  );
}
