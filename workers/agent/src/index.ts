export { DailyBrandWorkflow } from "./workflow";
export { SetupRunWorkflow } from "./setup-workflow";
export { AuditRunWorkflow } from "./audit-workflow";

// Health stub. Instances are created via the cross-script binding from the app
// (env.AGENT_WORKFLOW.create), so this Worker needs no real HTTP routes.
const handler = {
  async fetch(): Promise<Response> {
    return new Response("agent-workflow: ok\n", { status: 200 });
  },
};

export default handler;
