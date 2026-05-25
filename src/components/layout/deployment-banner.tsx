/**
 * When NEXT_PUBLIC_SITE_LABEL is set, shows a persistent bar so local/staging
 * is never confused with production. Optionally shows the Supabase hostname
 * (no secrets) to confirm which project is connected.
 */
export function DeploymentBanner() {
  const label = process.env.NEXT_PUBLIC_SITE_LABEL?.trim();
  if (!label) return null;

  let hostHint: string | null = null;
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (rawUrl) {
    try {
      hostHint = new URL(rawUrl).hostname;
    } catch {
      hostHint = null;
    }
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-[200] border-b border-amber-300 bg-amber-200 px-3 py-1.5 text-center text-xs font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-900/90 dark:text-amber-50"
    >
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
        <span>{label}</span>
        {hostHint ? (
          <span className="font-normal opacity-90">· DB: {hostHint}</span>
        ) : null}
      </span>
    </div>
  );
}
