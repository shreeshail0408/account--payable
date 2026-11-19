import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback while a page chunk downloads. */
export function PageFallback() {
  return (
    <div data-ui="" className="flex flex-col gap-6 p-4 sm:p-6" role="status" aria-label="Loading page">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-[60vw]" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
