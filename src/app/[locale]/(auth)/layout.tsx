import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen overflow-hidden">
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <div className="flex h-full w-full items-center justify-center overflow-auto px-4 py-12 lg:w-1/2">
        {children}
      </div>

      <div className="hidden lg:block lg:w-1/2">
        <img
          src="/images/auth-salads.png"
          alt="Fresh salads"
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
