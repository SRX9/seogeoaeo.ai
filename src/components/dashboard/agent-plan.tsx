import { Card } from "@heroui/react";
import { ArrowRightIcon } from "@/components/icons";
import type { AgentState, AgentTaskView } from "@/lib/agent/types";

function PlanMoment({
  label,
  task,
  emptyLabel,
  count,
}: {
  label: "Now" | "Next";
  task: AgentTaskView | null;
  emptyLabel: string;
  count: number;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">{label}</p>
        {count > 0 ? (
          <span className="text-xs font-medium text-muted tabular-nums">
            {count} {count === 1 ? "task" : "tasks"}
          </span>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-foreground text-pretty">
        {task?.title ?? emptyLabel}
      </p>
    </div>
  );
}

export function AgentPlan({ state }: { state: AgentState }) {
  return (
    <Card aria-label="Current work sequence" className="h-full p-5 sm:p-6">
      <Card.Header>
        <Card.Title className="text-lg font-semibold tracking-[-0.015em]">
          Work queue
        </Card.Title>
        <Card.Description className="mt-1 leading-5 text-pretty">
          What Claudia is doing now and next.
        </Card.Description>
      </Card.Header>
      <Card.Content className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center xl:grid-cols-1">
        <PlanMoment
          label="Now"
          task={state.now}
          emptyLabel={state.waiting ? "Waiting for your decision" : "No task running"}
          count={state.now ? 1 : 0}
        />
        <ArrowRightIcon className="hidden size-4 text-muted sm:block xl:mx-auto xl:rotate-90" aria-hidden />
        <PlanMoment
          label="Next"
          task={state.next[0] ?? null}
          emptyLabel="No task queued"
          count={state.next.length}
        />
      </Card.Content>
    </Card>
  );
}
