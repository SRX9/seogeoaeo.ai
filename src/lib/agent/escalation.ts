import { z } from "zod";

export const agentEscalationReasonSchema = z.enum([
  "ambiguous_objective",
  "policy_conflict",
  "insufficient_evidence",
  "contradictory_evidence",
  "low_value_for_cost",
  "authority_exceeded",
  "missing_brand_fact",
  "irreversible_action",
  "recovery_exhausted",
  "budget_exhausted",
  "owner_interrupted",
  "no_viable_action",
]);

export const agentEscalationChoiceSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    label: z.string().min(1).max(80),
    consequence: z.string().min(1).max(280),
    proposalHash: z.string().min(1).max(128).optional(),
  })
  .strict();

export const agentEscalationSchema = z
  .object({
    kind: z.enum(["clarification", "approval"]),
    reason: agentEscalationReasonSchema,
    question: z.string().min(1).max(280),
    known: z.array(z.string().min(1).max(280)).min(1).max(8),
    uncertain: z.array(z.string().min(1).max(280)).min(1).max(8),
    choices: z.array(agentEscalationChoiceSchema).min(2).max(3),
    recommendedChoiceId: z.string().nullable(),
    evidenceRefs: z.array(z.string().min(1).max(500)).max(16),
  })
  .strict()
  .superRefine((value, ctx) => {
    const choiceIds = value.choices.map((choice) => choice.id);
    if (new Set(choiceIds).size !== choiceIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "Escalation choice ids must be unique.",
      });
    }
    if (
      value.recommendedChoiceId !== null &&
      !choiceIds.includes(value.recommendedChoiceId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendedChoiceId"],
        message: "The recommended choice must reference a supplied choice.",
      });
    }
  });

export type AgentEscalationReason = z.infer<typeof agentEscalationReasonSchema>;
export type AgentEscalationChoice = z.infer<typeof agentEscalationChoiceSchema>;
export type AgentEscalation = z.infer<typeof agentEscalationSchema>;

/**
 * Questions at the authority boundary are deliberately structured. Callers
 * cannot emit an open-ended prompt without saying what is known, what remains
 * uncertain, and the consequence of each bounded choice.
 */
export function defineAgentEscalation(input: AgentEscalation): AgentEscalation {
  return agentEscalationSchema.parse(input);
}
