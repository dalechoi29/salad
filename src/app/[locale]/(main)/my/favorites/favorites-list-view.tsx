"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { toggleFavorite } from "@/lib/actions/menu";
import { handleActionError } from "@/lib/handle-action-error";
import { toast } from "sonner";
import { FavoriteItem } from "../my-list-items";
import type { MenuFavorite } from "@/types";

export function FavoritesListView({
  initialFavorites,
}: {
  initialFavorites: MenuFavorite[];
}) {
  const router = useRouter();
  const [favorites, setFavorites] = useState(initialFavorites);

  async function handleRemove(menuId: string) {
    const result = await toggleFavorite(menuId);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.menu_id !== menuId));
    toast.success("즐겨찾기가 해제되었습니다");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Heart className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">즐겨찾기</h1>
      </div>

      {favorites.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">즐겨찾기한 메뉴가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {favorites.map((fav, idx) => (
              <FavoriteItem
                key={fav.id}
                fav={fav}
                onRemove={handleRemove}
                showSeparator={idx < favorites.length - 1}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
