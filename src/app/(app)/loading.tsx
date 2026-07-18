import { Card, Skeleton } from "@heroui/react";

export default function AppLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <div className="space-y-3">
        <Skeleton className="h-9 w-52 rounded-xl" />
        <Skeleton className="h-5 w-full max-w-md rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <Card.Content className="gap-4">
              <Skeleton className="h-4 w-24 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-3 w-32 max-w-full rounded-lg" />
            </Card.Content>
          </Card>
        ))}
      </div>
      <Card>
        <Card.Content className="gap-4">
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-5/6 rounded-lg" />
          <Skeleton className="h-4 w-2/3 rounded-lg" />
        </Card.Content>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}
