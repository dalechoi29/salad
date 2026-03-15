"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { confirmPickup } from "@/lib/actions/pickup";
import { handleActionError } from "@/lib/handle-action-error";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";

interface HomePickupCardProps {
  todayStr: string;
  initialConfirmed: boolean;
  hasDeliveryToday: boolean;
  todayMenuName: string | null;
}

export function HomePickupCard({
  todayStr,
  initialConfirmed,
  hasDeliveryToday,
  todayMenuName,
}: HomePickupCardProps) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    setIsLoading(true);
    try {
      const result = await confirmPickup(todayStr);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      setConfirmed(true);
      toast.success("챙겼어요!");
    } finally {
      setIsLoading(false);
    }
  }

  if (!hasDeliveryToday) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 py-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            confirmed
              ? "bg-green-500/10"
              : "bg-orange-500/10"
          }`}
        >
          <Check
            className={`h-5 w-5 ${
              confirmed ? "text-green-500" : "text-orange-500"
            }`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">
            {confirmed ? "잘 하셨어요!" : "오늘 샐러드 챙기셨나요?"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {confirmed
              ? new Date().getHours() < 15
                ? "점심으로 든든할 거에요:)"
                : "오늘도 내 몸을 위한 한 걸음"
              : todayMenuName
                ? `${todayMenuName}가 냉장고에 있어요`
                : null}
          </p>
        </div>
        {confirmed ? (
          <Link href="/pickup">
            <Button variant="ghost" size="sm" className="text-sm text-muted-foreground">
              상세
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            챙겼어요
          </Button>
        )}
      </CardHeader>
    </Card>
  );
}
