export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen overflow-hidden">
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
