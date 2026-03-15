"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Loader2,
  Tag,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  getCommunityCategories,
  createCommunityCategory,
  updateCommunityCategory,
  deleteCommunityCategory,
  reorderCommunityCategories,
} from "@/lib/actions/category";
import type { CommunityCategory } from "@/types";

const COLOR_PRESETS = [
  { value: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: "회색" },
  { value: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", label: "빨강" },
  { value: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "초록" },
  { value: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "파랑" },
  { value: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", label: "노랑" },
  { value: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", label: "보라" },
  { value: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400", label: "분홍" },
  { value: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400", label: "청록" },
];

export function CategoryManagement({
  initialCategories,
}: {
  initialCategories: CommunityCategory[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CommunityCategory | null>(null);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(COLOR_PRESETS[0].value);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  function openAddDialog() {
    setEditingCategory(null);
    setKey("");
    setLabel("");
    setColor(COLOR_PRESETS[0].value);
    setDialogOpen(true);
  }

  function openEditDialog(cat: CommunityCategory) {
    setEditingCategory(cat);
    setKey(cat.key);
    setLabel(cat.label);
    setColor(cat.color);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!label.trim()) {
      toast.error("카테고리 이름을 입력해주세요");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCategory) {
        const result = await updateCommunityCategory(editingCategory.id, label.trim(), color);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        setCategories((prev) =>
          prev.map((c) =>
            c.id === editingCategory.id ? { ...c, label: label.trim(), color } : c
          )
        );
        toast.success("카테고리가 수정되었습니다");
      } else {
        if (!key.trim()) {
          toast.error("카테고리 키를 입력해주세요");
          return;
        }
        if (categories.some((c) => c.key === key.trim())) {
          toast.error("이미 존재하는 키입니다");
          return;
        }
        const result = await createCommunityCategory(key.trim(), label.trim(), color);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        const fresh = await getCommunityCategories();
        setCategories(fresh);
        toast.success("카테고리가 추가되었습니다");
      }
      setDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 카테고리를 삭제하시겠어요?")) return;

    const result = await deleteCommunityCategory(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    toast.success("카테고리가 삭제되었습니다");
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const newCategories = [...categories];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newCategories.length) return;

    [newCategories[index], newCategories[swapIndex]] = [
      newCategories[swapIndex],
      newCategories[index],
    ];
    setCategories(newCategories);

    setIsReordering(true);
    const result = await reorderCommunityCategories(newCategories.map((c) => c.id));
    setIsReordering(false);
    if (result.error) {
      toast.error(result.error);
      setCategories(categories);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/admin"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Tag className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">커뮤니티 카테고리</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">카테고리 목록</CardTitle>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-1 h-4 w-4" />
            추가
          </Button>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              카테고리가 없습니다
            </p>
          ) : (
            <div className="space-y-1">
              {categories.map((cat, idx) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleMove(idx, "up")}
                      disabled={idx === 0 || isReordering}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(idx, "down")}
                      disabled={idx === categories.length - 1 || isReordering}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <Badge variant="secondary" className={`w-fit ${cat.color}`}>
                    {cat.label}
                  </Badge>

                  <span className="text-xs text-muted-foreground">({cat.key})</span>

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => openEditDialog(cat)}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "카테고리 수정" : "카테고리 추가"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!editingCategory && (
              <div className="space-y-2">
                <Label>키 (영문, 고유값)</Label>
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="예: announcement"
                  maxLength={30}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 공지사항"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label>색상</Label>
              <Select value={color} onValueChange={(v) => v && setColor(v)}>
                <SelectTrigger>
                  <span className="flex flex-1 text-left">{COLOR_PRESETS.find((p) => p.value === color)?.label ?? "색상 선택"}</span>
                </SelectTrigger>
                <SelectContent>
                  {COLOR_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value} label={preset.label}>
                      <Badge variant="secondary" className={preset.value}>
                        {preset.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>미리보기</Label>
              <Badge variant="secondary" className={`w-fit ${color}`}>
                {label || "카테고리"}
              </Badge>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editingCategory ? "수정" : "추가"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
