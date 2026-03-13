"use client";

import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  UtensilsCrossed,
  ImagePlus,
  X,
  CalendarDays,
  ArrowLeft,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Menu, DietaryPreference } from "@/types";
import {
  createMenu,
  updateMenu,
  deleteMenu,
  getMenus,
} from "@/lib/actions/menu";

const DIETARY_OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: "vegan", label: "비건" },
  { value: "gluten_free", label: "글루텐프리" },
  { value: "nut_free", label: "견과류 없음" },
  { value: "dairy_free", label: "유제품 없음" },
  { value: "low_carb", label: "저탄수화물" },
  { value: "high_protein", label: "고단백" },
];

const CATEGORY_OPTIONS = [
  { value: "salad", label: "샐러드" },
  { value: "sandwich", label: "샌드위치" },
  { value: "bowl", label: "보울" },
];

interface MenuFormData {
  title: string;
  description: string;
  sauce: string;
  protein: string;
  kcal: string;
  category: string;
  is_main: boolean;
  dietary_tags: DietaryPreference[];
  image_url: string | null;
}

const emptyForm: MenuFormData = {
  title: "",
  description: "",
  sauce: "",
  protein: "",
  kcal: "",
  category: "salad",
  is_main: true,
  dietary_tags: [],
  image_url: null,
};

export function MenuManagement({ initialMenus }: { initialMenus: Menu[] }) {
  const [menus, setMenus] = useState(initialMenus);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [form, setForm] = useState<MenuFormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshMenus() {
    const data = await getMenus();
    setMenus(data);
  }

  function openCreateDialog() {
    setEditingMenu(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(menu: Menu) {
    setEditingMenu(menu);
    setForm({
      title: menu.title,
      description: menu.description,
      sauce: menu.sauce,
      protein: menu.protein != null ? String(menu.protein) : "",
      kcal: menu.kcal != null ? String(menu.kcal) : "",
      category: menu.category,
      is_main: menu.is_main,
      dietary_tags: menu.dietary_tags,
      image_url: menu.image_url,
    });
    setDialogOpen(true);
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
        .from("menu-images")
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (error) {
        toast.error(`업로드 실패: ${error.message}`);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("menu-images")
        .getPublicUrl(fileName);

      setForm((prev) => ({ ...prev, image_url: urlData.publicUrl }));
      toast.success("이미지 업로드 완료");
    } catch (err) {
      toast.error("이미지 업로드 중 오류가 발생했습니다");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleDietaryTag(tag: DietaryPreference) {
    setForm((prev) => ({
      ...prev,
      dietary_tags: prev.dietary_tags.includes(tag)
        ? prev.dietary_tags.filter((t) => t !== tag)
        : [...prev.dietary_tags, tag],
    }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error("메뉴 이름을 입력해주세요");
      return;
    }

    setIsSaving(true);
    try {
      const proteinVal = form.protein ? parseInt(form.protein, 10) : null;
      const kcalVal = form.kcal ? parseInt(form.kcal, 10) : null;

      if (editingMenu) {
        const result = await updateMenu(editingMenu.id, {
          title: form.title.trim(),
          description: form.description.trim(),
          sauce: form.sauce.trim(),
          protein: proteinVal,
          kcal: kcalVal,
          category: form.category,
          is_main: form.is_main,
          dietary_tags: form.dietary_tags,
          image_url: form.image_url,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("메뉴가 수정되었습니다");
      } else {
        const result = await createMenu({
          title: form.title.trim(),
          description: form.description.trim(),
          sauce: form.sauce.trim(),
          protein: proteinVal,
          kcal: kcalVal,
          category: form.category,
          is_main: form.is_main,
          dietary_tags: form.dietary_tags,
          image_url: form.image_url,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("메뉴가 추가되었습니다");
      }
      setDialogOpen(false);
      await refreshMenus();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 메뉴를 삭제하시겠습니까?")) return;

    const result = await deleteMenu(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("메뉴가 삭제되었습니다");
    await refreshMenus();
  }

  async function handleToggleActive(menu: Menu) {
    const result = await updateMenu(menu.id, { is_active: !menu.is_active });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(menu.is_active ? "메뉴가 비활성화되었습니다" : "메뉴가 활성화되었습니다");
    await refreshMenus();
  }

  const dietaryLabel = (tag: string) =>
    DIETARY_OPTIONS.find((d) => d.value === tag)?.label ?? tag;

  const categoryLabel = (cat: string) =>
    CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? cat;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <UtensilsCrossed className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">메뉴 관리</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={<Button size="sm" />}
            onClick={openCreateDialog}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            메뉴 추가
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingMenu ? "메뉴 수정" : "새 메뉴 추가"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>메뉴 이름 *</Label>
                <Input
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="예: 그린 시저 샐러드"
                />
              </div>

              <div className="space-y-2">
                <Label>설명</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="메뉴에 대한 설명을 입력하세요"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>소스</Label>
                <Input
                  value={form.sauce}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, sauce: e.target.value }))
                  }
                  placeholder="예: 시저 드레싱, 발사믹 소스"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>단백질 (g)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.protein}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, protein: e.target.value }))
                    }
                    placeholder="예: 25"
                  />
                </div>
                <div className="space-y-2">
                  <Label>칼로리 (kcal)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.kcal}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, kcal: e.target.value }))
                    }
                    placeholder="예: 350"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>카테고리</Label>
                  <Select
                    value={form.category}
                    onValueChange={(val) =>
                      setForm((prev) => ({ ...prev, category: val ?? prev.category }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-2 pb-0.5">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.is_main}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({ ...prev, is_main: checked }))
                      }
                    />
                    <Label className="text-sm">메인 메뉴</Label>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>식단 태그</Label>
                <div className="flex flex-wrap gap-2">
                  {DIETARY_OPTIONS.map((tag) => (
                    <Badge
                      key={tag.value}
                      variant={
                        form.dietary_tags.includes(tag.value)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer transition-colors"
                      onClick={() => toggleDietaryTag(tag.value)}
                    >
                      {tag.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>이미지</Label>
                {form.image_url ? (
                  <div className="relative">
                    <img
                      src={form.image_url}
                      alt="Menu preview"
                      className="h-40 w-full rounded-lg border object-cover"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute right-2 top-2 h-7 w-7"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, image_url: null }))
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex h-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-muted-foreground/50"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImagePlus className="h-6 w-6" />
                        <span className="text-xs">클릭하여 업로드</span>
                      </div>
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  취소
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  {editingMenu ? "수정" : "추가"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          등록된 메뉴: {menus.length}개
        </p>
        <Link href="/admin/menus/assignments">
          <Button variant="outline" size="sm">
            <CalendarDays className="mr-1.5 h-4 w-4" />
            일일 메뉴 배정
          </Button>
        </Link>
      </div>

      {menus.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <UtensilsCrossed className="mb-2 h-8 w-8" />
            <p>등록된 메뉴가 없습니다</p>
            <p className="text-xs">위의 버튼으로 메뉴를 추가해주세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {menus.map((menu) => (
            <Card
              key={menu.id}
              className={`transition-opacity ${!menu.is_active ? "opacity-50" : ""}`}
            >
              {menu.image_url && (
                <div className="relative h-36 w-full overflow-hidden rounded-t-xl">
                  <img
                    src={menu.image_url}
                    alt={menu.title}
                    className="h-full w-full object-cover"
                  />
                  {!menu.is_active && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Badge variant="secondary">비활성</Badge>
                    </div>
                  )}
                </div>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm">{menu.title}</CardTitle>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {categoryLabel(menu.category)}
                      </Badge>
                      {menu.is_main && (
                        <Badge variant="outline" className="text-[10px]">
                          메인
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditDialog(menu)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(menu.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {menu.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {menu.description}
                  </p>
                )}
                {menu.sauce && (
                  <p className="text-xs text-muted-foreground">
                    🥣 {menu.sauce}
                  </p>
                )}
                {(menu.protein != null || menu.kcal != null) && (
                  <p className="text-xs text-muted-foreground">
                    {menu.protein != null && `단백질 ${menu.protein}g`}
                    {menu.protein != null && menu.kcal != null && " · "}
                    {menu.kcal != null && `${menu.kcal}kcal`}
                  </p>
                )}
                {menu.dietary_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {menu.dietary_tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px] font-normal"
                      >
                        {dietaryLabel(tag)}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {menu.is_active ? "활성" : "비활성"}
                  </span>
                  <Switch
                    checked={menu.is_active}
                    onCheckedChange={() => handleToggleActive(menu)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
