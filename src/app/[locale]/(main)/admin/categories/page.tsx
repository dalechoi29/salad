import { getCommunityCategories } from "@/lib/actions/category";
import { CategoryManagement } from "./category-management";

export default async function AdminCategoriesPage() {
  const categories = await getCommunityCategories();
  return <CategoryManagement initialCategories={categories} />;
}
