import type { AgentState, AgentTaskView } from "@/lib/agent/types";

function TaskLine({ task }: { task: AgentTaskView }) {
  return (
    <div>
      <p className="font-medium leading-6 text-foreground">{task.title}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{task.reason}</p>
    </div>
  );
}

export function AgentPlan({ state }: { state: AgentState }) {
  return (
    <section aria-labelledby="agent-plan-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="agent-plan-title" className="text-xl text-foreground">
            Current plan
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">{state.plan.rationale}</p>
        </div>
        <span className="shrink-0 text-xs text-muted tabular-nums">v{state.plan.version}</span>
      </div>

      <div className="grid overflow-hidden rounded-2xl bg-surface-secondary/65 md:grid-cols-3">
        <div className="p-5 md:border-r md:border-separator/60">
          <p className="mb-3 text-sm font-medium text-muted">Now</p>
          {state.now ? (
            <TaskLine task={state.now} />
          ) : (
            <p className="text-sm leading-6 text-muted">No task is in flight.</p>
          )}
        </div>
        <div className="border-t border-separator/60 p-5 md:border-r md:border-t-0">
          <p className="mb-3 text-sm font-medium text-muted">Next</p>
          {state.next.length ? (
            <div className="space-y-4">
              {state.next.map((task) => (
                <TaskLine key={task.id} task={task} />
              ))}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">The next task will be chosen from fresh evidence.</p>
          )}
        </div>
        <div className="border-t border-separator/60 p-5 md:border-t-0">
          <p className="mb-3 text-sm font-medium text-muted">Waiting</p>
          {state.waiting ? (
            <div>
              <p className="font-medium leading-6 text-foreground">{state.waiting.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{state.waiting.blockedValue}</p>
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">Nothing needed from you.</p>
          )}
        </div>
      </div>
    </section>
  );
}
