import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Summary cards + detail table (shown while month data loads in the client). */
export function VendorReportContentSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3 py-4 text-center">
              <Skeleton className="mx-auto h-3 w-20" />
              <Skeleton className="mx-auto h-9 w-14" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-9 w-full rounded-md sm:max-w-xs" />
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-full max-w-lg" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          <div className="mb-3 flex gap-4 border-b pb-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-20" />
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-4 border-b py-3 align-top last:border-0"
            >
              <div className="flex shrink-0 flex-col gap-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-4 w-8 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-6 w-40 max-w-full" />
                <Skeleton className="h-3 w-full max-w-xs" />
                <Skeleton className="h-3 w-2/3 max-w-sm" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/** Full page shell for `loading.tsx` while the server page resolves. */
export function VendorReportPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-5 w-[100px]" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <VendorReportContentSkeleton />
    </div>
  );
}
