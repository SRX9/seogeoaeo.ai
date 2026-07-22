import { Skeleton } from "@heroui/react";

function Line({ className }: { className: string }) {
  return <Skeleton animationType="shimmer" className={className} />;
}

export function DashboardLoadingState() {
  return (
    <div className="mx-auto w-full max-w-[96rem] px-5 lg:px-16" aria-busy="true" aria-label="Loading Claudia">
      <div className="grid min-h-[calc(100dvh-8rem)] items-center gap-10 border-b border-separator py-12 md:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
        <div>
          <Line className="h-4 w-28 rounded-lg" />
          <Line className="mt-10 h-16 w-full max-w-2xl rounded-xl" />
          <Line className="mt-3 h-16 w-4/5 max-w-xl rounded-xl" />
          <Line className="mt-6 h-5 w-full max-w-lg rounded-lg" />
          <Line className="mt-2 h-5 w-3/4 max-w-md rounded-lg" />
          <Line className="mt-8 h-11 w-40 rounded-xl" />
        </div>
        <div className="grid place-items-center">
          <Line className="aspect-square w-full max-w-[28rem] rounded-full" />
        </div>
      </div>
      <div className="grid md:grid-cols-2">
        {[0, 1].map((item) => (
          <div key={item} className="min-h-80 border-b border-separator py-12 md:px-10 md:first:border-r md:first:pl-0 md:last:pr-0">
            <Line className="h-4 w-28 rounded-lg" />
            <Line className="mt-8 h-10 w-full max-w-md rounded-xl" />
            <Line className="mt-3 h-10 w-3/4 max-w-sm rounded-xl" />
            <Line className="mt-6 h-4 w-full max-w-lg rounded-lg" />
            <Line className="mt-2 h-4 w-4/5 max-w-md rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
