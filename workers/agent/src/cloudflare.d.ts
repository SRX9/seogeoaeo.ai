// Minimal ambient types for the Cloudflare Workflows runtime modules this Worker
// uses. The real implementations are provided by the Workers runtime at deploy
// time (wrangler treats `cloudflare:*` as built-in externals); these declarations
// only give us local type-checking without pulling in @cloudflare/workers-types.

declare module "cloudflare:workers" {
  export type WorkflowEvent<P> = {
    payload: Readonly<P>;
    timestamp: Date;
    instanceId: string;
    workflowName: string;
  };

  export type WorkflowStepConfig = {
    retries?: {
      limit: number;
      delay: string | number;
      backoff?: "constant" | "linear" | "exponential";
    };
    timeout?: string | number;
  };

  export interface WorkflowStep {
    do<T>(name: string, callback: () => Promise<T>): Promise<T>;
    do<T>(name: string, config: WorkflowStepConfig, callback: () => Promise<T>): Promise<T>;
    sleep(name: string, duration: string | number): Promise<void>;
    sleepUntil(name: string, timestamp: Date | number): Promise<void>;
  }

  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected env: Env;
    protected ctx: unknown;
    abstract run(event: WorkflowEvent<Params>, step: WorkflowStep): Promise<unknown>;
  }
}

declare module "cloudflare:workflows" {
  export class NonRetryableError extends Error {
    constructor(message: string, name?: string);
  }
}
