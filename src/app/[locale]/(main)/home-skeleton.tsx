import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Welcome header */}
      <div className="flex items-start justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>

      {/* Subscription card */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </CardHeader>
      </Card>

      {/* Today's menu header */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-24" />
        </div>

        {/* Menu cards grid */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((i) => (
            <Card key={i} className="overflow-hidden py-0">
              <Skeleton className="aspect-square w-full rounded-none" />
              <CardContent className="space-y-2 px-3 pb-3 pt-2">
                <Skeleton className="h-7 w-6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Next delivery card */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        </CardHeader>
      </Card>

      {/* Subscription status header */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-8 w-12 rounded-md" />
            <Skeleton className="h-8 w-12 rounded-md" />
          </div>
        </div>

        {/* Calendar skeleton */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between pb-3">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
