import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <main className="route-loading-shell" aria-label="Loading page" aria-busy="true">
      <div className="route-loading-header">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-11 w-36" />
      </div>
      <div className="route-loading-title">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="route-loading-grid">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-52 rounded-2xl" />
      </div>
    </main>
  );
}
