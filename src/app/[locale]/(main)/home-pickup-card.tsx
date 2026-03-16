"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Loader2 } from "lucide-react";
import { confirmPickup } from "@/lib/actions/pickup";
import { handleActionError } from "@/lib/handle-action-error";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import type { DailyMenu } from "@/types";

interface HomePickupCardProps {
  todayStr: string;
  initialConfirmed: boolean;
  hasDeliveryToday: boolean;
  todayMenuName: string | null;
  adminCheckedIn: boolean;
  saladLocation: string | null;
  todayMenus: DailyMenu[];
}

export function HomePickupCard({
  todayStr,
  initialConfirmed,
  hasDeliveryToday,
  todayMenuName,
  adminCheckedIn,
  saladLocation,
  todayMenus,
}: HomePickupCardProps) {
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [isLoading, setIsLoading] = useState(false);
  const [menuSelectOpen, setMenuSelectOpen] = useState(false);
  const router = useRouter();

  async function doConfirm(menuId?: string) {
    setIsLoading(true);
    try {
      const result = await confirmPickup(todayStr, menuId);
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

  function handleConfirmClick() {
    if (todayMenuName) {
      doConfirm();
    } else {
      setMenuSelectOpen(true);
    }
  }

  if (!hasDeliveryToday) {
    return null;
  }

  const menuLabel = todayMenuName ?? "샐러드";
  let subtitle: string;
  if (confirmed) {
    subtitle =
      new Date().getHours() < 15
        ? "점심으로 든든할 거에요:)"
        : "오늘도 내 몸을 위한 한 걸음";
  } else if (adminCheckedIn && saladLocation) {
    subtitle = `${menuLabel}가 ${saladLocation}에 있어요`;
  } else if (adminCheckedIn) {
    subtitle = `${menuLabel}가 냉장고에 있어요`;
  } else {
    subtitle = `${menuLabel}가 엘리베이터 앞에 있어요`;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 py-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              confirmed ? "bg-green-500/10" : "bg-orange-500/10"
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
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {confirmed ? (
            <Link href="/pickup">
              <Button
                variant="ghost"
                size="sm"
                className="text-sm text-muted-foreground"
              >
                상세
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-sm"
              onClick={handleConfirmClick}
              disabled={isLoading}
            >
              {isLoading && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              챙겼어요
            </Button>
          )}
        </CardHeader>
      </Card>

      <Dialog open={menuSelectOpen} onOpenChange={setMenuSelectOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>어떤 메뉴 선택하셨어요?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {todayMenus.map((dm) => (
              <Button
                key={dm.id}
                variant="outline"
                className="w-full justify-start text-left"
                disabled={isLoading}
                onClick={() => {
                  setMenuSelectOpen(false);
                  doConfirm(dm.menu?.id);
                }}
              >
                {dm.menu?.title ?? "메뉴"}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
