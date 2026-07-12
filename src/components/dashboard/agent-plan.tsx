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
    <section
      className="border-t border-separator/70 px-6 py-6 sm:px-8 lg:px-10"
      aria-labelledby="agent-plan-title"
    >
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted">Working sequence</p>
          <h2
            id="agent-plan-title"
            className="mt-1 text-lg font-semibold tracking-[-0.015em] text-foreground"
          >
            Now, next, and waiting
          </h2>
        </div>
        <span className="shrink-0 text-xs text-muted tabular-nums">v{state.plan.version}</span>
      </div>

      <div className="grid md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="pb-5 md:border-r md:border-separator/60 md:pb-0 md:pr-6">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            Now
          </p>
          {state.now ? (
            <TaskLine task={state.now} />
          ) : (
            <p className="text-sm leading-6 text-muted">No task is in flight.</p>
          )}
        </div>
        <div className="border-t border-separator/60 py-5 md:border-r md:border-t-0 md:px-6 md:py-0">
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
        <div className="border-t border-separator/60 pt-5 md:border-t-0 md:pl-6 md:pt-0">
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
