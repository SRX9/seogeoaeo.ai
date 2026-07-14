import { Card, Skeleton } from "@heroui/react";

function Line({ className }: { className: string }) {
  return <Skeleton animationType="shimmer" className={className} />;
}

export function DashboardLoadingState() {
  return (
    <div className="flex flex-col gap-6 lg:gap-7" aria-busy="true" aria-label="Loading Claudia">
      <Card className="overflow-hidden rounded-3xl p-2">
        <div className="grid min-h-[34rem] gap-0 xl:grid-cols-[minmax(24rem,0.95fr)_minmax(0,1.05fr)]">
          <div className="relative min-h-80 overflow-hidden rounded-2xl xl:min-h-full">
            <Line className="absolute inset-0 rounded-2xl" />
            <Line className="absolute left-5 top-5 h-5 w-20 rounded-lg" />
            <div className="absolute bottom-4 left-4 right-4 flex justify-between gap-3">
              <Line className="h-10 w-32 rounded-3xl" />
              <Line className="h-10 w-28 rounded-3xl" />
            </div>
          </div>
          <div className="p-5 sm:p-7 xl:p-8">
            <Line className="h-10 w-full max-w-xl rounded-lg" />
            <Line className="mt-3 h-5 w-full max-w-lg rounded-lg" />
            <Line className="mt-5 h-36 w-full rounded-2xl" />
            <div className="mt-7 flex items-center justify-between gap-3">
              <Line className="h-8 w-32 rounded-lg" />
              <Line className="h-4 w-16 rounded-lg" />
            </div>
            <div className="mt-5 space-y-5">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <Line className="size-6 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Line className="h-4 w-full max-w-xs rounded-lg" />
                    <Line className="mt-2 h-3 w-full max-w-sm rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="min-h-44 p-5">
            <Line className="h-4 w-28 rounded-lg" />
            <Line className="mt-3 h-8 w-20 rounded-lg" />
            <Line className="mt-1.5 h-4 w-32 rounded-lg" />
            <Line className="mt-4 h-12 w-full rounded-lg" />
          </Card>
        ))}
      </div>
    </div>
  );
}
