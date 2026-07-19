import { Skeleton } from "@heroui/react";

function Line({ className }: { className: string }) {
  return <Skeleton animationType="shimmer" className={className} />;
}

export function DashboardLoadingState() {
  return (
    <div
      className="grid min-h-[calc(100dvh-7rem)] items-center gap-10 px-6 py-10 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(22rem,1.2fr)_minmax(15rem,0.9fr)] lg:px-16"
      aria-busy="true"
      aria-label="Loading Claudia"
    >
      <div>
        <Line className="h-4 w-24 rounded-lg" />
        <Line className="mt-12 h-12 w-full max-w-md rounded-xl" />
        <Line className="mt-3 h-5 w-full max-w-sm rounded-lg" />
        <Line className="mt-2 h-5 w-3/4 max-w-xs rounded-lg" />
      </div>
      <div className="grid place-items-center">
        <Line className="aspect-square w-full max-w-[28rem] rounded-full" />
      </div>
      <div className="space-y-1">
        {[0, 1, 2].map((item) => (
          <div key={item} className="border-t border-separator py-5">
            <Line className="h-3 w-24 rounded-lg" />
            <Line className="mt-3 h-7 w-32 rounded-lg" />
            <Line className="mt-3 h-3 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
