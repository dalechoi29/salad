import { toast } from "sonner";

export function handleActionError(
  error: string,
  router: { replace: (path: string) => void }
): boolean {
  if (error === "AUTH_REQUIRED") {
    toast.error("로그인이 필요해요");
    router.replace("/login");
    return true;
  }
  return false;
}
