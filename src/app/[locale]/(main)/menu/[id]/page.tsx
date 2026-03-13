import { getMenu } from "@/lib/actions/menu";
import { notFound } from "next/navigation";
import { MenuDetail } from "./menu-detail";

export default async function MenuDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const menu = await getMenu(id);

  if (!menu) return notFound();

  return <MenuDetail menu={menu} />;
}
