"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Refrigerator, ImageIcon, X } from "lucide-react";
import { updateDailySaladStatus } from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface HomeFridgeCardProps {
  todayStr: string;
  companyUsers: { id: string; realName: string }[];
  currentUserName: string;
}

export function HomeFridgeCard({
  todayStr,
  companyUsers,
  currentUserName,
}: HomeFridgeCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [helpers, setHelpers] = useState<string[]>([currentUserName]);
  const [helperInput, setHelperInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!helperInput.trim()) return [];
    const lower = helperInput.toLowerCase();
    return companyUsers
      .filter(
        (u) =>
          u.realName.toLowerCase().includes(lower) &&
          !helpers.includes(u.realName)
      )
      .slice(0, 5);
  }, [helperInput, companyUsers, helpers]);

  if (dismissed) return null;

  function addHelper(name: string) {
    if (!name.trim() || helpers.includes(name.trim())) return;
    setHelpers((prev) => [...prev, name.trim()]);
    setHelperInput("");
    setShowSuggestions(false);
  }

  function removeHelper(name: string) {
    setHelpers((prev) => prev.filter((h) => h !== name));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("파일 크기는 5MB 이하만 가능합니다");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const fileName = `${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("salad-location-images")
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (error) {
        toast.error("이미지 업로드 실패: " + error.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("salad-location-images")
        .getPublicUrl(fileName);

      setPhotoUrl(urlData.publicUrl);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await updateDailySaladStatus(
        todayStr,
        true,
        location,
        photoUrl ?? undefined,
        helpers.length > 0 ? helpers.join(", ") : undefined
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("저장되었습니다!");
      setDialogOpen(false);
      setDismissed(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Refrigerator className="h-5 w-5 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              샐러드 냉장고에 넣어주신 분
            </CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-sm"
            onClick={() => setDialogOpen(true)}
          >
            입력
          </Button>
        </CardHeader>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>샐러드 위치 입력</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                넣어주신 분
              </label>
              {helpers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {helpers.map((name) => (
                    <Badge
                      key={name}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeHelper(name)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="relative">
                <Input
                  value={helperInput}
                  onChange={(e) => {
                    setHelperInput(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowSuggestions(false), 150)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addHelper(helperInput);
                    }
                  }}
                  placeholder="이름을 입력하세요"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                    {suggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addHelper(user.realName)}
                      >
                        {user.realName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                샐러드 위치
              </label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="큰 라운지 오른쪽 냉장고 위쪽과 한칸 아래"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                위치 사진
              </label>
              {photoUrl ? (
                <div className="relative">
                  <img
                    src={photoUrl}
                    alt="샐러드 위치"
                    className="h-40 w-full rounded-lg border object-cover"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7 rounded-full bg-background/80"
                    onClick={() => setPhotoUrl(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-muted-foreground hover:bg-muted/50">
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImageIcon className="h-5 w-5" />
                      <span className="text-sm">사진 첨부</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                    disabled={isUploading}
                  />
                </label>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
