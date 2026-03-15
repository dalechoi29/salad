import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { UserProvider } from "@/components/providers/user-provider";
import { getCurrentProfile } from "@/lib/actions/auth";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <UserProvider user={profile}>
      <div className="relative min-h-screen">
        <DesktopSidebar />
        <div className="md:pl-64">
          <Header />
          <main className="px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-6 md:pb-6">{children}</main>
        </div>
        <BottomNav />
      </div>
    </UserProvider>
  );
}
