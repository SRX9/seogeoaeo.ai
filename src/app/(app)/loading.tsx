function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-default ${className}`} />;
}

export default function AppLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Bar className="h-7 w-40" />
        <Bar className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Bar key={index} className="h-24" />
        ))}
      </div>
      <Bar className="h-40" />
      <div className="space-y-3">
        <Bar className="h-16" />
        <Bar className="h-16" />
      </div>
    </div>
  );
}
