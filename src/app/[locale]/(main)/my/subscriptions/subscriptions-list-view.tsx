"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { SubscriptionCard } from "../my-list-items";
import type { SubscriptionWithDetails } from "../page";

export function SubscriptionsListView({
  subscriptions,
}: {
  subscriptions: SubscriptionWithDetails[];
}) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <UtensilsCrossed className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">구독 이력</h1>
        <Badge variant="secondary" className="text-xs">
          {subscriptions.length}
        </Badge>
      </div>

      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">구독 이력이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((entry) => (
            <SubscriptionCard key={entry.subscription.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
