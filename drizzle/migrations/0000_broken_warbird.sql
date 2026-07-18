CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_action_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"task_id" uuid,
	"approval_id" uuid,
	"action_type" text NOT NULL,
	"resource_ref" text NOT NULL,
	"capability" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"before_state" jsonb,
	"applied_change" jsonb NOT NULL,
	"remote_ref" text,
	"rollback_handle" jsonb,
	"status" text DEFAULT 'applied' NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verification_result" jsonb,
	"verified_at" timestamp with time zone,
	"reverted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"task_id" uuid,
	"action_type" text NOT NULL,
	"capability" text,
	"resource_ref" text NOT NULL,
	"destination" text,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"proposal_hash" text DEFAULT '' NOT NULL,
	"policy_version" text DEFAULT 'legacy' NOT NULL,
	"model_prompt_version" text,
	"risk_level" text NOT NULL,
	"expected_benefit" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_callback_receipts" (
	"nonce" text PRIMARY KEY NOT NULL,
	"workflow_instance_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"step_name" text NOT NULL,
	"token_subject" text NOT NULL,
	"request_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mission_id" uuid,
	"task_id" uuid,
	"event_type" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb,
	"actor" text DEFAULT 'claudia' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"brand_id" uuid,
	"step_execution_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tier" text NOT NULL,
	"prompt_version" text DEFAULT 'legacy' NOT NULL,
	"status" text NOT NULL,
	"error_class" text,
	"latency_ms" integer NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"termination_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"provenance" text NOT NULL,
	"scope" text DEFAULT 'brand' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_memory_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"depends_on_record_id" uuid NOT NULL,
	"relation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_memory_dependencies_relation_check" CHECK ("agent_memory_dependencies"."relation" in ('supports','derived_from','corrects','contradicts','outcome_of')),
	CONSTRAINT "agent_memory_dependencies_distinct_check" CHECK ("agent_memory_dependencies"."record_id" <> "agent_memory_dependencies"."depends_on_record_id")
);
--> statement-breakpoint
CREATE TABLE "agent_memory_propagation_markers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"correction_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"retry_after" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "agent_memory_propagation_status_check" CHECK ("agent_memory_propagation_markers"."status" in ('pending','in_progress','applied','dead_letter')),
	CONSTRAINT "agent_memory_propagation_attempt_check" CHECK ("agent_memory_propagation_markers"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_memory_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"memory_class" text NOT NULL,
	"subject_key" text NOT NULL,
	"statement" text NOT NULL,
	"content" jsonb NOT NULL,
	"impact_level" text DEFAULT 'low' NOT NULL,
	"source_type" text NOT NULL,
	"source_ref" text NOT NULL,
	"creator" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"confidence" integer DEFAULT 50 NOT NULL,
	"verification_state" text DEFAULT 'unverified' NOT NULL,
	"sensitivity" text DEFAULT 'internal' NOT NULL,
	"allowed_consumers" jsonb DEFAULT '["planner","research","draft","audit","ask","reflection","learning"]'::jsonb NOT NULL,
	"trust_level" text DEFAULT 'untrusted' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"supersedes_id" uuid,
	"superseded_by_id" uuid,
	"contradiction_group" text,
	"extraction_version" text NOT NULL,
	"model_version" text,
	"lifecycle_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_memory_records_class_check" CHECK ("agent_memory_records"."memory_class" in ('authoritative_fact','preference','correction','episodic_observation','semantic_summary','procedural_learning')),
	CONSTRAINT "agent_memory_records_creator_check" CHECK ("agent_memory_records"."creator" in ('owner','verified_tool','model_inference','system')),
	CONSTRAINT "agent_memory_records_source_type_check" CHECK ("agent_memory_records"."source_type" in ('owner_input','first_party','verified_tool','model_inference','system','task_output','external_content')),
	CONSTRAINT "agent_memory_records_source_creator_check" CHECK (("agent_memory_records"."source_type" <> 'owner_input' or "agent_memory_records"."creator" = 'owner') and ("agent_memory_records"."source_type" <> 'model_inference' or "agent_memory_records"."creator" = 'model_inference') and ("agent_memory_records"."source_type" <> 'external_content' or "agent_memory_records"."creator" <> 'owner')),
	CONSTRAINT "agent_memory_records_authority_check" CHECK ("agent_memory_records"."memory_class" <> 'authoritative_fact' or ("agent_memory_records"."creator" in ('owner','verified_tool','system') and "agent_memory_records"."verification_state" in ('verified','owner_approved') and "agent_memory_records"."trust_level" = 'trusted')),
	CONSTRAINT "agent_memory_records_correction_check" CHECK ("agent_memory_records"."memory_class" <> 'correction' or ("agent_memory_records"."creator" = 'owner' and "agent_memory_records"."verification_state" = 'owner_approved' and "agent_memory_records"."trust_level" = 'trusted' and "agent_memory_records"."supersedes_id" is not null)),
	CONSTRAINT "agent_memory_records_model_trust_check" CHECK ("agent_memory_records"."creator" <> 'model_inference' or "agent_memory_records"."trust_level" = 'untrusted'),
	CONSTRAINT "agent_memory_records_external_trust_check" CHECK ("agent_memory_records"."source_type" <> 'external_content' or "agent_memory_records"."trust_level" = 'untrusted'),
	CONSTRAINT "agent_memory_records_confidence_check" CHECK ("agent_memory_records"."confidence" >= 0 and "agent_memory_records"."confidence" <= 100),
	CONSTRAINT "agent_memory_records_impact_check" CHECK ("agent_memory_records"."impact_level" in ('low','medium','high')),
	CONSTRAINT "agent_memory_records_verification_check" CHECK ("agent_memory_records"."verification_state" in ('unverified','verified','owner_approved','rejected')),
	CONSTRAINT "agent_memory_records_sensitivity_check" CHECK ("agent_memory_records"."sensitivity" in ('public','internal','confidential','restricted')),
	CONSTRAINT "agent_memory_records_trust_check" CHECK ("agent_memory_records"."trust_level" in ('trusted','untrusted')),
	CONSTRAINT "agent_memory_records_status_check" CHECK ("agent_memory_records"."status" in ('active','superseded','invalidated','rejected')),
	CONSTRAINT "agent_memory_records_consumers_check" CHECK (jsonb_typeof("agent_memory_records"."allowed_consumers") = 'array' and jsonb_array_length("agent_memory_records"."allowed_consumers") > 0),
	CONSTRAINT "agent_memory_records_validity_check" CHECK ("agent_memory_records"."expires_at" is null or "agent_memory_records"."expires_at" > "agent_memory_records"."valid_from"),
	CONSTRAINT "agent_memory_records_lifecycle_version_check" CHECK ("agent_memory_records"."lifecycle_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"key" text DEFAULT 'primary' NOT NULL,
	"objective" text NOT NULL,
	"metric" text,
	"baseline" jsonb,
	"target" jsonb,
	"success_condition" text,
	"horizon" text DEFAULT 'ongoing' NOT NULL,
	"horizon_start_at" timestamp with time zone,
	"horizon_end_at" timestamp with time zone,
	"priority" integer DEFAULT 50 NOT NULL,
	"budget" jsonb,
	"constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_capabilities" jsonb DEFAULT '["observe","prepare"]'::jsonb NOT NULL,
	"stop_condition" text,
	"definition_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"origin" text DEFAULT 'system_created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_missions_metric_check" CHECK ("agent_missions"."metric" is null or "agent_missions"."metric" in ('ai_answer_share_percent', 'qualified_non_brand_clicks', 'critical_crawler_findings', 'grounded_pages_published')),
	CONSTRAINT "agent_missions_priority_check" CHECK ("agent_missions"."priority" >= 0 and "agent_missions"."priority" <= 100),
	CONSTRAINT "agent_missions_definition_version_check" CHECK ("agent_missions"."definition_version" > 0),
	CONSTRAINT "agent_missions_horizon_order_check" CHECK ("agent_missions"."horizon_start_at" is null or "agent_missions"."horizon_end_at" is null or "agent_missions"."horizon_end_at" > "agent_missions"."horizon_start_at"),
	CONSTRAINT "agent_missions_constraints_array_check" CHECK (jsonb_typeof("agent_missions"."constraints") = 'array'),
	CONSTRAINT "agent_missions_capabilities_check" CHECK (jsonb_typeof("agent_missions"."allowed_capabilities") = 'array' and jsonb_array_length("agent_missions"."allowed_capabilities") > 0 and "agent_missions"."allowed_capabilities" <@ '["observe","prepare","article.create","article.update","article.meta.update","article.schema.update","site.meta.update","site.schema.update","robots.update","llms_txt.update","rollback.supported"]'::jsonb),
	CONSTRAINT "agent_missions_definition_completeness_check" CHECK (("agent_missions"."metric" is null and "agent_missions"."baseline" is null and "agent_missions"."target" is null and "agent_missions"."horizon_start_at" is null and "agent_missions"."horizon_end_at" is null and "agent_missions"."budget" is null and "agent_missions"."stop_condition" is null) or ("agent_missions"."metric" is not null and "agent_missions"."baseline" is not null and jsonb_typeof("agent_missions"."baseline") = 'object' and jsonb_typeof("agent_missions"."baseline"->'value') = 'number' and jsonb_typeof("agent_missions"."baseline"->'observedAt') = 'string' and jsonb_typeof("agent_missions"."baseline"->'sourceRefs') = 'array' and jsonb_array_length("agent_missions"."baseline"->'sourceRefs') > 0 and "agent_missions"."target" is not null and jsonb_typeof("agent_missions"."target") = 'object' and jsonb_typeof("agent_missions"."target"->'value') = 'number' and "agent_missions"."horizon_start_at" is not null and "agent_missions"."horizon_end_at" is not null and "agent_missions"."budget" is not null and jsonb_typeof("agent_missions"."budget") = 'object' and jsonb_typeof("agent_missions"."budget"->'maxCredits') = 'number' and jsonb_typeof("agent_missions"."budget"->'maxRemoteWrites') = 'number' and jsonb_typeof("agent_missions"."budget"->'maxCostCents') = 'number' and "agent_missions"."success_condition" is not null and "agent_missions"."stop_condition" is not null))
);
--> statement-breakpoint
CREATE TABLE "agent_outcome_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"attribution_key" text NOT NULL,
	"action_id" uuid NOT NULL,
	"content_id" uuid,
	"query_key" text,
	"objective_id" uuid,
	"outcome_kind" text NOT NULL,
	"outcome_value" real NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"baseline" jsonb,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"confounders" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"holdout_group" text,
	"verified" boolean DEFAULT false NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_outcome_attributions_window_check" CHECK ("agent_outcome_attributions"."window_end" > "agent_outcome_attributions"."window_start" and "agent_outcome_attributions"."observed_at" >= "agent_outcome_attributions"."window_start" and "agent_outcome_attributions"."observed_at" <= "agent_outcome_attributions"."window_end"),
	CONSTRAINT "agent_outcome_attributions_evidence_check" CHECK (jsonb_typeof("agent_outcome_attributions"."evidence_refs") = 'array'),
	CONSTRAINT "agent_outcome_attributions_verified_evidence_check" CHECK (not "agent_outcome_attributions"."verified" or jsonb_array_length("agent_outcome_attributions"."evidence_refs") > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_owner_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"policy_key" text NOT NULL,
	"effect" text NOT NULL,
	"capabilities" jsonb NOT NULL,
	"resources" jsonb NOT NULL,
	"conditions" jsonb NOT NULL,
	"original_text" text NOT NULL,
	"source" text DEFAULT 'owner' NOT NULL,
	"parser_version" text NOT NULL,
	"policy_version" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"rationale" text NOT NULL,
	"evidence_snapshot" jsonb NOT NULL,
	"version" integer NOT NULL,
	"supersedes_id" uuid,
	"replan_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_scheduled_work" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"schedule_kind" text NOT NULL,
	"schedule_key" text NOT NULL,
	"workflow_instance_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'expected' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"retry_after" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"operator_replay_requested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_step_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"mission_id" uuid,
	"plan_version_id" uuid,
	"task_id" uuid,
	"workflow_instance_id" text NOT NULL,
	"step_key" text NOT NULL,
	"work_key" text DEFAULT 'default' NOT NULL,
	"action_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"billing_work_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"outcome" text,
	"input" jsonb,
	"output" jsonb,
	"output_ref" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"original_executor_id" text,
	"takeover_executor_id" text,
	"last_error_code" text,
	"last_error_class" text,
	"last_error" text,
	"retry_after" timestamp with time zone,
	"started_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_strategy_weight_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"action_family" text NOT NULL,
	"strategy_key" text NOT NULL,
	"version" integer NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"prior_version_id" uuid,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"evidence_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	CONSTRAINT "agent_strategy_weight_versions_weight_check" CHECK ("agent_strategy_weight_versions"."weight" >= 0.5 and "agent_strategy_weight_versions"."weight" <= 2),
	CONSTRAINT "agent_strategy_weight_versions_version_check" CHECK ("agent_strategy_weight_versions"."version" > 0),
	CONSTRAINT "agent_strategy_weight_versions_sample_check" CHECK ("agent_strategy_weight_versions"."sample_size" >= 0),
	CONSTRAINT "agent_strategy_weight_versions_confidence_check" CHECK ("agent_strategy_weight_versions"."confidence" >= 0 and "agent_strategy_weight_versions"."confidence" <= 100),
	CONSTRAINT "agent_strategy_weight_versions_status_check" CHECK ("agent_strategy_weight_versions"."status" in ('candidate','active','rolled_back')),
	CONSTRAINT "agent_strategy_weight_versions_active_threshold_check" CHECK ("agent_strategy_weight_versions"."status" <> 'active' or ("agent_strategy_weight_versions"."sample_size" >= 20 and "agent_strategy_weight_versions"."confidence" >= 80) or ("agent_strategy_weight_versions"."version" = 1 and "agent_strategy_weight_versions"."weight" = 1 and "agent_strategy_weight_versions"."sample_size" = 0 and "agent_strategy_weight_versions"."confidence" = 0 and "agent_strategy_weight_versions"."prior_version_id" is null and "agent_strategy_weight_versions"."evidence_snapshot"->>'kind' = 'neutral_baseline'))
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"plan_version_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"task_type" text NOT NULL,
	"executor" text NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_impact" text,
	"confidence" integer DEFAULT 50 NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"required_authority" text DEFAULT 'observe' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempt" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"original_executor_id" text,
	"takeover_executor_id" text,
	"last_error_code" text,
	"last_error_class" text,
	"retry_after" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"input" jsonb,
	"artifact_ref" text,
	"outcome_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan_id" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'inactive' NOT NULL,
	"weekly_article_cap" integer DEFAULT 0 NOT NULL,
	"monthly_credits" integer DEFAULT 0 NOT NULL,
	"purchased_credits" integer DEFAULT 0 NOT NULL,
	"monthly_credit_grant" integer DEFAULT 0 NOT NULL,
	"credits_refreshed_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"last_low_credit_email_at" timestamp with time zone,
	"credit_emails_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"autonomy_mode" text DEFAULT 'FULL_AUTO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "brand_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"description" text,
	"slogan" text,
	"primary_logo_url" text,
	"primary_backdrop_url" text,
	"data" jsonb NOT NULL,
	"source" text DEFAULT 'context.dev' NOT NULL,
	"last_refreshed_at" timestamp with time zone NOT NULL,
	"next_refresh_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"product_description" text,
	"audience" text,
	"tone" text,
	"website" text,
	"seed_keywords" text,
	"voice_json" text,
	"memory_projection_pending" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_use_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"job" text NOT NULL,
	"persona" text NOT NULL,
	"industry" text,
	"evidence" text,
	"origin" text DEFAULT 'generated' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"autonomy_mode" text DEFAULT 'REVIEW' NOT NULL,
	"badge_public" boolean DEFAULT false NOT NULL,
	"memory_projection_pending" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"rss_url" text,
	"sitemap_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"secret_key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"topic_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"meta_description" text,
	"tags" text,
	"body_markdown" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"shape" text,
	"gate_results_json" text,
	"memory_evidence_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_evidence_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"competitor_name" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"topic" text,
	"intent" text,
	"shape" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"position" real,
	"verdict" text,
	"actions_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"summary" text,
	"findings_json" text,
	"topics_created" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"query" text NOT NULL,
	"page" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"position" real,
	"period_start" text NOT NULL,
	"period_end" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_source_weights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"sample" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"research_run_id" uuid,
	"title" text NOT NULL,
	"angle" text,
	"keywords" text,
	"score" integer,
	"rationale" text,
	"answer_fit" text,
	"evidence_json" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"intent_tier" text,
	"thesis" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"certification_id" uuid NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status_reason" text,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_activations_status_check" CHECK ("connector_activations"."status" in ('candidate','active','suspended','revoked')),
	CONSTRAINT "connector_activations_evidence_check" CHECK (jsonb_typeof("connector_activations"."evidence") = 'object'),
	CONSTRAINT "connector_activations_active_at_check" CHECK ("connector_activations"."status" <> 'active' or "connector_activations"."activated_at" is not null),
	CONSTRAINT "connector_activations_suspended_at_check" CHECK ("connector_activations"."status" <> 'suspended' or "connector_activations"."suspended_at" is not null),
	CONSTRAINT "connector_activations_revoked_at_check" CHECK ("connector_activations"."status" <> 'revoked' or "connector_activations"."revoked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "connector_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"capability" text NOT NULL,
	"adapter_version" text NOT NULL,
	"protocol_version" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"reversible" boolean DEFAULT false NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"certified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_certifications_status_check" CHECK ("connector_certifications"."status" in ('candidate','certified','suspended','revoked')),
	CONSTRAINT "connector_certifications_evidence_check" CHECK (jsonb_typeof("connector_certifications"."evidence") = 'object'),
	CONSTRAINT "connector_certifications_certified_at_check" CHECK ("connector_certifications"."status" <> 'certified' or "connector_certifications"."certified_at" is not null),
	CONSTRAINT "connector_certifications_revoked_at_check" CHECK ("connector_certifications"."status" <> 'revoked' or "connector_certifications"."revoked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "connector_circuit_breakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"capability" text NOT NULL,
	"status" text DEFAULT 'closed' NOT NULL,
	"reason" text,
	"source" text,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_circuit_breakers_status_check" CHECK ("connector_circuit_breakers"."status" in ('closed','open')),
	CONSTRAINT "connector_circuit_breakers_open_state_check" CHECK ("connector_circuit_breakers"."status" <> 'open' or ("connector_circuit_breakers"."opened_at" is not null and "connector_circuit_breakers"."reason" is not null and length("connector_circuit_breakers"."reason") > 0 and "connector_circuit_breakers"."source" is not null and length("connector_circuit_breakers"."source") > 0))
);
--> statement-breakpoint
CREATE TABLE "connector_mutation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_mutation_events_detail_check" CHECK (jsonb_typeof("connector_mutation_events"."detail") = 'object')
);
--> statement-breakpoint
CREATE TABLE "connector_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"task_id" uuid,
	"approval_id" uuid,
	"action_id" uuid,
	"autonomy_rollout_id" uuid,
	"autonomy_decision_id" uuid,
	"autonomy_rollout_revision" integer,
	"provider" text NOT NULL,
	"capability" text NOT NULL,
	"adapter_version" text NOT NULL,
	"protocol_version" text NOT NULL,
	"resource_ref" text NOT NULL,
	"remote_resource_id" text,
	"idempotency_key" text NOT NULL,
	"proposal_hash" text NOT NULL,
	"before_state" jsonb NOT NULL,
	"proposed_state" jsonb NOT NULL,
	"intended_diff" jsonb NOT NULL,
	"before_fingerprint" text NOT NULL,
	"expected_after_fingerprint" text NOT NULL,
	"policy_decision" jsonb NOT NULL,
	"certification_id" uuid NOT NULL,
	"resource_count" integer DEFAULT 1 NOT NULL,
	"is_canary" boolean DEFAULT true NOT NULL,
	"batch_key" text,
	"status" text DEFAULT 'prepared' NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"rollback_status" text DEFAULT 'not_required' NOT NULL,
	"result" jsonb,
	"rollback_handle" jsonb,
	"failure" jsonb,
	"before_revision" text,
	"applied_revision" text,
	"verified_revision" text,
	"reverted_revision" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"rollback_started_at" timestamp with time zone,
	"reverted_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_mutations_status_check" CHECK ("connector_mutations"."status" in ('no_op','prepared','writing','applied','verified','verification_failed','rollback_pending','reverted','rollback_failed','manual_recovery_required','blocked','cancelled')),
	CONSTRAINT "connector_mutations_verification_status_check" CHECK ("connector_mutations"."verification_status" in ('pending','verified','failed')),
	CONSTRAINT "connector_mutations_rollback_status_check" CHECK ("connector_mutations"."rollback_status" in ('not_required','pending','reverted','failed','manual_recovery_required')),
	CONSTRAINT "connector_mutations_resource_count_check" CHECK ("connector_mutations"."resource_count" > 0),
	CONSTRAINT "connector_mutations_canary_scope_check" CHECK (not "connector_mutations"."is_canary" or "connector_mutations"."resource_count" = 1),
	CONSTRAINT "connector_mutations_attempt_count_check" CHECK ("connector_mutations"."attempt_count" >= 0),
	CONSTRAINT "connector_mutations_state_shape_check" CHECK (jsonb_typeof("connector_mutations"."before_state") = 'object' and jsonb_typeof("connector_mutations"."proposed_state") = 'object' and jsonb_typeof("connector_mutations"."intended_diff") in ('object','array') and jsonb_typeof("connector_mutations"."policy_decision") = 'object'),
	CONSTRAINT "connector_mutations_identity_check" CHECK (length("connector_mutations"."provider") > 0 and length("connector_mutations"."capability") > 0 and length("connector_mutations"."adapter_version") > 0 and length("connector_mutations"."protocol_version") > 0 and length("connector_mutations"."resource_ref") > 0 and length("connector_mutations"."idempotency_key") > 0 and length("connector_mutations"."proposal_hash") > 0 and length("connector_mutations"."before_fingerprint") > 0 and length("connector_mutations"."expected_after_fingerprint") > 0),
	CONSTRAINT "connector_mutations_autonomy_link_check" CHECK (("connector_mutations"."autonomy_rollout_id" is null and "connector_mutations"."autonomy_decision_id" is null and "connector_mutations"."autonomy_rollout_revision" is null) or ("connector_mutations"."autonomy_rollout_id" is not null and "connector_mutations"."autonomy_decision_id" is not null and "connector_mutations"."autonomy_rollout_revision" is not null and "connector_mutations"."autonomy_rollout_revision" > 0))
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"delta" integer NOT NULL,
	"balance_after" integer,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_claim_ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"evidence_bundle_id" uuid,
	"article_version" integer NOT NULL,
	"final_content_hash" text NOT NULL,
	"evaluation_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"evaluator_version" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"material_claim_count" integer DEFAULT 0 NOT NULL,
	"unsupported_material_claim_count" integer DEFAULT 0 NOT NULL,
	"contradiction_count" integer DEFAULT 0 NOT NULL,
	"citation_precision" real,
	"citation_coverage" real,
	"completed_at" timestamp with time zone,
	"retention_until" timestamp with time zone DEFAULT now() + interval '365 days' NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_claim_ledgers_version_check" CHECK ("article_claim_ledgers"."article_version" > 0),
	CONSTRAINT "article_claim_ledgers_status_check" CHECK ("article_claim_ledgers"."status" in ('pending', 'verified', 'failed', 'stale', 'purged')),
	CONSTRAINT "article_claim_ledgers_counts_check" CHECK ("article_claim_ledgers"."material_claim_count" >= 0 and "article_claim_ledgers"."unsupported_material_claim_count" >= 0 and "article_claim_ledgers"."contradiction_count" >= 0),
	CONSTRAINT "article_claim_ledgers_precision_check" CHECK ("article_claim_ledgers"."citation_precision" is null or ("article_claim_ledgers"."citation_precision" >= 0 and "article_claim_ledgers"."citation_precision" <= 1)),
	CONSTRAINT "article_claim_ledgers_coverage_check" CHECK ("article_claim_ledgers"."citation_coverage" is null or ("article_claim_ledgers"."citation_coverage" >= 0 and "article_claim_ledgers"."citation_coverage" <= 1)),
	CONSTRAINT "article_claim_ledgers_verified_state_check" CHECK ("article_claim_ledgers"."status" <> 'verified' or ("article_claim_ledgers"."unsupported_material_claim_count" = 0 and "article_claim_ledgers"."contradiction_count" = 0 and "article_claim_ledgers"."citation_precision" = 1 and "article_claim_ledgers"."citation_coverage" = 1 and "article_claim_ledgers"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "article_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"claim_key" text NOT NULL,
	"ordinal" integer NOT NULL,
	"claim_text" text NOT NULL,
	"claim_hash" text NOT NULL,
	"claim_type" text NOT NULL,
	"material" boolean DEFAULT true NOT NULL,
	"support_strength" real DEFAULT 0 NOT NULL,
	"contradiction_status" text DEFAULT 'pending' NOT NULL,
	"verification_result" text DEFAULT 'pending' NOT NULL,
	"evaluator_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_claims_ordinal_check" CHECK ("article_claims"."ordinal" >= 0),
	CONSTRAINT "article_claims_type_check" CHECK ("article_claims"."claim_type" in ('factual', 'opinion', 'brand_fact', 'calculation', 'example', 'prediction')),
	CONSTRAINT "article_claims_strength_check" CHECK ("article_claims"."support_strength" >= 0 and "article_claims"."support_strength" <= 1),
	CONSTRAINT "article_claims_contradiction_check" CHECK ("article_claims"."contradiction_status" in ('pending', 'none', 'disclosed', 'unresolved')),
	CONSTRAINT "article_claims_verification_check" CHECK ("article_claims"."verification_result" in ('pending', 'supported', 'unsupported', 'conflicted', 'not_applicable'))
);
--> statement-breakpoint
CREATE TABLE "citation_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"ledger_id" uuid NOT NULL,
	"claim_id" uuid,
	"evidence_source_id" uuid,
	"evidence_source_ref" text,
	"citation_key" text NOT NULL,
	"cited_url" text NOT NULL,
	"resolved_url" text,
	"canonical_url" text,
	"expected_title" text,
	"expected_domain" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"link_available" boolean,
	"canonical_matches" boolean,
	"title_matches" boolean,
	"domain_matches" boolean,
	"supports_claim" boolean,
	"source_fresh" boolean,
	"invented" boolean,
	"evaluator_version" text NOT NULL,
	"fetch_version" text NOT NULL,
	"retrieved_content_hash" text,
	"failure_code" text,
	"failure_message" text,
	"checked_at" timestamp with time zone,
	"retention_until" timestamp with time zone DEFAULT now() + interval '365 days' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "citation_checks_status_check" CHECK ("citation_checks"."status" in ('pending', 'passed', 'failed', 'stale', 'unavailable')),
	CONSTRAINT "citation_checks_pass_requirements_check" CHECK ("citation_checks"."status" <> 'passed' or ("citation_checks"."claim_id" is not null and "citation_checks"."evidence_source_ref" is not null and length("citation_checks"."evidence_source_ref") > 0 and "citation_checks"."checked_at" is not null and "citation_checks"."retrieved_content_hash" is not null and length("citation_checks"."retrieved_content_hash") > 0 and "citation_checks"."link_available" is true and "citation_checks"."canonical_matches" is true and "citation_checks"."title_matches" is true and "citation_checks"."domain_matches" is true and "citation_checks"."supports_claim" is true and "citation_checks"."source_fresh" is true and "citation_checks"."invented" is false)),
	CONSTRAINT "citation_checks_completed_at_check" CHECK ("citation_checks"."status" = 'pending' or "citation_checks"."checked_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "evidence_bundles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"research_run_id" uuid,
	"version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"search_query" text NOT NULL,
	"search_intent" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"content_hash" text,
	"source_count" integer DEFAULT 0 NOT NULL,
	"fetch_version" text NOT NULL,
	"parser_version" text NOT NULL,
	"supersedes_id" uuid,
	"failure_code" text,
	"failure_message" text,
	"completed_at" timestamp with time zone,
	"retention_until" timestamp with time zone DEFAULT now() + interval '90 days' NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_bundles_version_check" CHECK ("evidence_bundles"."version" > 0),
	CONSTRAINT "evidence_bundles_source_count_check" CHECK ("evidence_bundles"."source_count" >= 0),
	CONSTRAINT "evidence_bundles_source_count_limit_check" CHECK ("evidence_bundles"."source_count" <= 50),
	CONSTRAINT "evidence_bundles_status_check" CHECK ("evidence_bundles"."status" in ('pending', 'ready', 'failed', 'expired', 'purged')),
	CONSTRAINT "evidence_bundles_ready_state_check" CHECK ("evidence_bundles"."status" <> 'ready' or ("evidence_bundles"."source_count" > 0 and "evidence_bundles"."content_hash" is not null and length("evidence_bundles"."content_hash") > 0 and "evidence_bundles"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "evidence_claim_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"evidence_source_id" uuid,
	"evidence_source_ref" text NOT NULL,
	"relationship" text DEFAULT 'supports' NOT NULL,
	"support_strength" real DEFAULT 0 NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"evaluator_version" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_claim_links_relationship_check" CHECK ("evidence_claim_links"."relationship" in ('supports', 'contradicts', 'context')),
	CONSTRAINT "evidence_claim_links_strength_check" CHECK ("evidence_claim_links"."support_strength" >= 0 and "evidence_claim_links"."support_strength" <= 1),
	CONSTRAINT "evidence_claim_links_verification_check" CHECK ("evidence_claim_links"."verification_status" in ('pending', 'verified', 'rejected', 'stale'))
);
--> statement-breakpoint
CREATE TABLE "evidence_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"bundle_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"source_url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"publisher" text,
	"domain" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"supporting_excerpt" varchar(2000) NOT NULL,
	"content_hash" text NOT NULL,
	"source_type" text NOT NULL,
	"source_quality_score" real NOT NULL,
	"freshness_score" real NOT NULL,
	"claim_relevance" real NOT NULL,
	"relationship" text DEFAULT 'neutral' NOT NULL,
	"relationship_notes" text,
	"status" text DEFAULT 'candidate' NOT NULL,
	"fetch_version" text NOT NULL,
	"parser_version" text NOT NULL,
	"retention_until" timestamp with time zone DEFAULT now() + interval '90 days' NOT NULL,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_sources_status_check" CHECK ("evidence_sources"."status" in ('candidate', 'pending', 'verified', 'unavailable', 'stale', 'rejected', 'purged')),
	CONSTRAINT "evidence_sources_relationship_check" CHECK ("evidence_sources"."relationship" in ('corroborates', 'conflicts', 'neutral')),
	CONSTRAINT "evidence_sources_quality_score_check" CHECK ("evidence_sources"."source_quality_score" >= 0 and "evidence_sources"."source_quality_score" <= 100),
	CONSTRAINT "evidence_sources_freshness_score_check" CHECK ("evidence_sources"."freshness_score" >= 0 and "evidence_sources"."freshness_score" <= 100),
	CONSTRAINT "evidence_sources_claim_relevance_check" CHECK ("evidence_sources"."claim_relevance" >= 0 and "evidence_sources"."claim_relevance" <= 100)
);
--> statement-breakpoint
CREATE TABLE "publication_gate_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"gate_run_id" uuid NOT NULL,
	"gate_key" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"passed" boolean DEFAULT false NOT NULL,
	"evaluator_version" text NOT NULL,
	"details" jsonb,
	"failure_code" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_gate_checks_status_check" CHECK ("publication_gate_checks"."status" in ('pending', 'passed', 'failed', 'error')),
	CONSTRAINT "publication_gate_checks_pass_consistency_check" CHECK (not "publication_gate_checks"."passed" or "publication_gate_checks"."status" = 'passed')
);
--> statement-breakpoint
CREATE TABLE "publication_gate_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"claim_ledger_id" uuid NOT NULL,
	"article_version" integer NOT NULL,
	"final_content_hash" text NOT NULL,
	"evaluation_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"evaluator_set_version" text NOT NULL,
	"evaluator_versions" jsonb NOT NULL,
	"required_gate_keys" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text DEFAULT 'blocked' NOT NULL,
	"automatic_publication_allowed" boolean DEFAULT false NOT NULL,
	"risk_level" text,
	"owner_policy_version" text,
	"destination" text,
	"failure_code" text,
	"failure_message" text,
	"completed_at" timestamp with time zone,
	"recheck_after" timestamp with time zone,
	"retention_until" timestamp with time zone DEFAULT now() + interval '365 days' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_gate_runs_version_check" CHECK ("publication_gate_runs"."article_version" > 0),
	CONSTRAINT "publication_gate_runs_status_check" CHECK ("publication_gate_runs"."status" in ('pending', 'passed', 'failed', 'error', 'stale')),
	CONSTRAINT "publication_gate_runs_decision_check" CHECK ("publication_gate_runs"."decision" in ('blocked', 'allow')),
	CONSTRAINT "publication_gate_runs_fail_closed_check" CHECK (not "publication_gate_runs"."automatic_publication_allowed" or ("publication_gate_runs"."status" = 'passed' and "publication_gate_runs"."decision" = 'allow')),
	CONSTRAINT "publication_gate_runs_required_keys_check" CHECK (jsonb_typeof("publication_gate_runs"."required_gate_keys") = 'array' and jsonb_array_length("publication_gate_runs"."required_gate_keys") > 0),
	CONSTRAINT "publication_gate_runs_allowed_freshness_check" CHECK (not "publication_gate_runs"."automatic_publication_allowed" or ("publication_gate_runs"."completed_at" is not null and "publication_gate_runs"."recheck_after" is not null and "publication_gate_runs"."recheck_after" > "publication_gate_runs"."completed_at" and "publication_gate_runs"."retention_until" > "publication_gate_runs"."recheck_after"))
);
--> statement-breakpoint
CREATE TABLE "agent_daily_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"run_date" text NOT NULL,
	"articles_written" integer DEFAULT 0 NOT NULL,
	"topics_researched" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text,
	"status" text DEFAULT 'running' NOT NULL,
	"message" text,
	"metadata_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"recovery_owner" text,
	"steps_json" text NOT NULL,
	"brief_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"week_start" text NOT NULL,
	"articles_generated" integer DEFAULT 0 NOT NULL,
	"articles_published" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_behavior_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_key" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"owner" text NOT NULL,
	"component_versions" jsonb NOT NULL,
	"affected_eval_suites" jsonb NOT NULL,
	"before_report" jsonb NOT NULL,
	"after_report" jsonb NOT NULL,
	"migration_plan" text NOT NULL,
	"rollback_plan" text NOT NULL,
	"canary_cohort" jsonb NOT NULL,
	"monitoring_starts_at" timestamp with time zone NOT NULL,
	"monitoring_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_behavior_releases_status_check" CHECK ("agent_behavior_releases"."status" in ('draft','candidate','canary','released','rolled_back')),
	CONSTRAINT "agent_behavior_releases_monitoring_window_check" CHECK ("agent_behavior_releases"."monitoring_ends_at" > "agent_behavior_releases"."monitoring_starts_at"),
	CONSTRAINT "agent_behavior_releases_suites_check" CHECK (jsonb_typeof("agent_behavior_releases"."affected_eval_suites") = 'array' and jsonb_array_length("agent_behavior_releases"."affected_eval_suites") > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid,
	"suite" text NOT NULL,
	"dataset_version" text NOT NULL,
	"grader_version" text NOT NULL,
	"status" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"report_ref" text NOT NULL,
	"code_commit" text NOT NULL,
	"human_review" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_eval_runs_status_check" CHECK ("agent_eval_runs"."status" in ('passed','failed','error')),
	CONSTRAINT "agent_eval_runs_window_check" CHECK ("agent_eval_runs"."completed_at" >= "agent_eval_runs"."started_at")
);
--> statement-breakpoint
CREATE TABLE "agent_operational_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"brand_id" uuid,
	"fingerprint" text NOT NULL,
	"slo_key" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"owner" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"trace_id" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"runbook_path" text NOT NULL,
	"replay_path" text,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" text,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_operational_incidents_status_check" CHECK ("agent_operational_incidents"."status" in ('open','acknowledged','resolved','accepted')),
	CONSTRAINT "agent_operational_incidents_severity_check" CHECK ("agent_operational_incidents"."severity" in ('info','warning','high','critical')),
	CONSTRAINT "agent_operational_incidents_occurrence_check" CHECK ("agent_operational_incidents"."occurrence_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_trace_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"brand_id" uuid,
	"trace_id" text NOT NULL,
	"span_key" text NOT NULL,
	"parent_span_id" uuid,
	"span_type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"request_id" text,
	"run_id" text,
	"mission_id" uuid,
	"plan_version_id" uuid,
	"task_id" uuid,
	"workflow_instance_id" text,
	"step_execution_id" uuid,
	"action_id" uuid,
	"approval_id" uuid,
	"model" text,
	"prompt_version" text,
	"tool_schema_version" text,
	"policy_version" text,
	"redacted_input" jsonb,
	"redacted_output" jsonb,
	"decision_record" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_class" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"credits_charged" integer,
	"monetary_cost_micros" integer,
	"wall_clock_ms" integer,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"retention_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_trace_spans_status_check" CHECK ("agent_trace_spans"."status" in ('running','completed','degraded','blocked','failed','signal')),
	CONSTRAINT "agent_trace_spans_retry_check" CHECK ("agent_trace_spans"."retry_count" >= 0),
	CONSTRAINT "agent_trace_spans_cost_check" CHECK (("agent_trace_spans"."prompt_tokens" is null or "agent_trace_spans"."prompt_tokens" >= 0) and ("agent_trace_spans"."completion_tokens" is null or "agent_trace_spans"."completion_tokens" >= 0) and ("agent_trace_spans"."total_tokens" is null or "agent_trace_spans"."total_tokens" >= 0) and ("agent_trace_spans"."credits_charged" is null or "agent_trace_spans"."credits_charged" >= 0) and ("agent_trace_spans"."monetary_cost_micros" is null or "agent_trace_spans"."monetary_cost_micros" >= 0) and ("agent_trace_spans"."wall_clock_ms" is null or "agent_trace_spans"."wall_clock_ms" >= 0))
);
--> statement-breakpoint
CREATE TABLE "agent_autonomy_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rollout_id" uuid,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"task_id" uuid,
	"decision_key" text NOT NULL,
	"proposal_hash" text NOT NULL,
	"capability" text NOT NULL,
	"resource_ref" text NOT NULL,
	"destination" text,
	"autonomy_level" integer NOT NULL,
	"rollout_stage" integer NOT NULL,
	"execution_mode" text NOT NULL,
	"cohort_bucket" integer,
	"cohort_eligible" boolean DEFAULT false NOT NULL,
	"approval_validated" boolean DEFAULT false NOT NULL,
	"certification_validated" boolean DEFAULT false NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"baseline_decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_autonomy_decisions_decision_check" CHECK ("agent_autonomy_decisions"."decision" in ('allow','shadow','approval_required','deny','pause')),
	CONSTRAINT "agent_autonomy_decisions_level_stage_check" CHECK ("agent_autonomy_decisions"."autonomy_level" between 0 and 4 and "agent_autonomy_decisions"."rollout_stage" between 0 and 8),
	CONSTRAINT "agent_autonomy_decisions_bucket_check" CHECK ("agent_autonomy_decisions"."cohort_bucket" is null or "agent_autonomy_decisions"."cohort_bucket" between 0 and 9999)
);
--> statement-breakpoint
CREATE TABLE "agent_autonomy_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rollout_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"environment" text NOT NULL,
	"status" text NOT NULL,
	"scenario" text NOT NULL,
	"evidence_ref" text NOT NULL,
	"trace_id" text,
	"action_id" uuid,
	"owner" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_autonomy_exercises_kind_check" CHECK ("agent_autonomy_exercises"."kind" in ('emergency_stop','incident_reconstruction','replay','rollback')),
	CONSTRAINT "agent_autonomy_exercises_environment_check" CHECK ("agent_autonomy_exercises"."environment" in ('local','staging','production_like','production')),
	CONSTRAINT "agent_autonomy_exercises_status_check" CHECK ("agent_autonomy_exercises"."status" in ('passed','failed','partial')),
	CONSTRAINT "agent_autonomy_exercises_window_check" CHECK ("agent_autonomy_exercises"."completed_at" >= "agent_autonomy_exercises"."started_at")
);
--> statement-breakpoint
CREATE TABLE "agent_autonomy_rollout_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rollout_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"from_stage" integer,
	"to_stage" integer NOT NULL,
	"from_level" integer,
	"to_level" integer NOT NULL,
	"from_cohort_percent" integer,
	"to_cohort_percent" integer NOT NULL,
	"reason" text NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"owner" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_autonomy_rollout_events_type_check" CHECK ("agent_autonomy_rollout_events"."event_type" in ('selected','activated','expanded','paused','resumed','completed','rolled_back')),
	CONSTRAINT "agent_autonomy_rollout_events_bounds_check" CHECK ("agent_autonomy_rollout_events"."to_stage" between 1 and 8 and "agent_autonomy_rollout_events"."to_level" between 0 and 4 and "agent_autonomy_rollout_events"."to_cohort_percent" between 0 and 100),
	CONSTRAINT "agent_autonomy_rollout_events_evidence_check" CHECK (jsonb_typeof("agent_autonomy_rollout_events"."evidence_refs") = 'array' and jsonb_array_length("agent_autonomy_rollout_events"."evidence_refs") > 0)
);
--> statement-breakpoint
CREATE TABLE "agent_autonomy_rollouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"provider" text,
	"certification_id" uuid,
	"release_id" uuid,
	"cohort_key" text NOT NULL,
	"cohort_percent" integer DEFAULT 0 NOT NULL,
	"autonomy_level" integer DEFAULT 0 NOT NULL,
	"rollout_stage" integer DEFAULT 1 NOT NULL,
	"execution_mode" text DEFAULT 'eval' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"strategy_ref" text,
	"risk_budget" jsonb NOT NULL,
	"stop_conditions" jsonb NOT NULL,
	"minimum_sample_size" integer DEFAULT 30 NOT NULL,
	"observation_window_starts_at" timestamp with time zone NOT NULL,
	"observation_window_ends_at" timestamp with time zone NOT NULL,
	"owner" text NOT NULL,
	"activated_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"pause_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_autonomy_rollouts_status_check" CHECK ("agent_autonomy_rollouts"."status" in ('draft','active','paused','completed','rolled_back')),
	CONSTRAINT "agent_autonomy_rollouts_mode_check" CHECK ("agent_autonomy_rollouts"."execution_mode" in ('eval','synthetic','internal','shadow','live')),
	CONSTRAINT "agent_autonomy_rollouts_level_stage_check" CHECK ("agent_autonomy_rollouts"."autonomy_level" between 0 and 4 and "agent_autonomy_rollouts"."rollout_stage" between 1 and 8),
	CONSTRAINT "agent_autonomy_rollouts_cohort_check" CHECK ("agent_autonomy_rollouts"."cohort_percent" between 0 and 100),
	CONSTRAINT "agent_autonomy_rollouts_revision_check" CHECK ("agent_autonomy_rollouts"."revision" > 0),
	CONSTRAINT "agent_autonomy_rollouts_window_check" CHECK ("agent_autonomy_rollouts"."observation_window_ends_at" > "agent_autonomy_rollouts"."observation_window_starts_at"),
	CONSTRAINT "agent_autonomy_rollouts_sample_check" CHECK ("agent_autonomy_rollouts"."minimum_sample_size" > 0),
	CONSTRAINT "agent_autonomy_rollouts_json_check" CHECK (jsonb_typeof("agent_autonomy_rollouts"."risk_budget") = 'object' and jsonb_typeof("agent_autonomy_rollouts"."stop_conditions") = 'object'),
	CONSTRAINT "agent_autonomy_rollouts_shadow_stage_check" CHECK ("agent_autonomy_rollouts"."rollout_stage" <> 4 or "agent_autonomy_rollouts"."execution_mode" = 'shadow'),
	CONSTRAINT "agent_autonomy_rollouts_level4_evidence_check" CHECK ("agent_autonomy_rollouts"."autonomy_level" <> 4 or ("agent_autonomy_rollouts"."certification_id" is not null and "agent_autonomy_rollouts"."release_id" is not null and length(coalesce("agent_autonomy_rollouts"."strategy_ref", '')) > 0))
);
--> statement-breakpoint
CREATE TABLE "agent_canary_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rollout_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"metric_class" text NOT NULL,
	"design" text NOT NULL,
	"dataset_version" text NOT NULL,
	"grader_version" text NOT NULL,
	"window_starts_at" timestamp with time zone NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	"treatment_n" integer NOT NULL,
	"control_n" integer NOT NULL,
	"treatment_mean" real NOT NULL,
	"control_mean" real NOT NULL,
	"effect" real NOT NULL,
	"confidence_level" real NOT NULL,
	"interval_low" real NOT NULL,
	"interval_high" real NOT NULL,
	"p_value" real,
	"conclusion" text NOT NULL,
	"causal_claim" boolean DEFAULT false NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_canary_measurements_class_check" CHECK ("agent_canary_measurements"."metric_class" in ('agent_correctness','business_effect')),
	CONSTRAINT "agent_canary_measurements_design_check" CHECK ("agent_canary_measurements"."design" in ('holdout','staggered_rollout','matched_cohort','time_series_control')),
	CONSTRAINT "agent_canary_measurements_window_check" CHECK ("agent_canary_measurements"."window_ends_at" > "agent_canary_measurements"."window_starts_at"),
	CONSTRAINT "agent_canary_measurements_sample_check" CHECK ("agent_canary_measurements"."treatment_n" >= 0 and "agent_canary_measurements"."control_n" >= 0),
	CONSTRAINT "agent_canary_measurements_confidence_check" CHECK ("agent_canary_measurements"."confidence_level" > 0 and "agent_canary_measurements"."confidence_level" < 1 and "agent_canary_measurements"."interval_high" >= "agent_canary_measurements"."interval_low" and ("agent_canary_measurements"."p_value" is null or ("agent_canary_measurements"."p_value" >= 0 and "agent_canary_measurements"."p_value" <= 1))),
	CONSTRAINT "agent_canary_measurements_conclusion_check" CHECK ("agent_canary_measurements"."conclusion" in ('insufficient_data','non_inferior','improved','regressed','harm_detected')),
	CONSTRAINT "agent_canary_measurements_evidence_check" CHECK (jsonb_typeof("agent_canary_measurements"."evidence_refs") = 'array' and jsonb_array_length("agent_canary_measurements"."evidence_refs") > 0)
);
--> statement-breakpoint
CREATE TABLE "article_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"external_url" text,
	"external_id" text,
	"error_message" text,
	"published_hash" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"site_url" text DEFAULT '' NOT NULL,
	"week_start" text NOT NULL,
	"subject" text NOT NULL,
	"body_json" jsonb NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_autonomy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"category" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"ref_id" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answer_excerpt" text,
	"brand_mentioned" boolean DEFAULT false NOT NULL,
	"brand_cited" boolean DEFAULT false NOT NULL,
	"mentions" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_analyzer_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"analyzer_key" text NOT NULL,
	"analyzer_version" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"duration_ms" integer,
	"error_class" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"brand_id" uuid,
	"audit_id" uuid,
	"tool_run_id" uuid,
	"pillar" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"recommendation" text NOT NULL,
	"fix_capability" text,
	"fix_payload" jsonb,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"regressed_at" timestamp with time zone,
	"proposed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"url" text NOT NULL,
	"html_hash" text,
	"status_code" integer,
	"meta" jsonb,
	"headings" jsonb,
	"word_count" integer DEFAULT 0 NOT NULL,
	"has_ssr_content" boolean DEFAULT true NOT NULL,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"site_url" text NOT NULL,
	"kind" text DEFAULT 'owned' NOT NULL,
	"business_type" text,
	"status" text DEFAULT 'running' NOT NULL,
	"completeness" text DEFAULT 'complete' NOT NULL,
	"analyzer_set_version" text DEFAULT 'legacy' NOT NULL,
	"overall_score" real,
	"ai_visibility_score" real,
	"citability_score" real,
	"brand_score" real,
	"eeat_score" real,
	"technical_score" real,
	"schema_score" real,
	"platform_score" real,
	"discovery" jsonb,
	"site_health" jsonb,
	"error" text,
	"run_version" integer DEFAULT 1 NOT NULL,
	"scorer_version" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"monitor_finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "brand_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" text NOT NULL,
	"score" real,
	"evidence" jsonb
);
--> statement-breakpoint
CREATE TABLE "citability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_page_id" uuid NOT NULL,
	"heading" text,
	"word_count" integer DEFAULT 0 NOT NULL,
	"total_score" real,
	"grade" text,
	"breakdown" jsonb
);
--> statement-breakpoint
CREATE TABLE "platform_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"score" real,
	"breakdown" jsonb
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"score" real,
	"stage" text DEFAULT 'lead' NOT NULL,
	"mrr" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_page_id" uuid NOT NULL,
	"type" text NOT NULL,
	"format" text DEFAULT 'json-ld' NOT NULL,
	"valid" boolean DEFAULT false NOT NULL,
	"rich_result_eligible" boolean DEFAULT false NOT NULL,
	"issues" jsonb
);
--> statement-breakpoint
CREATE TABLE "tool_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"brand_id" uuid,
	"slug" text NOT NULL,
	"input" jsonb,
	"result" jsonb,
	"score" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"source" text DEFAULT 'suggested' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"site_url" text,
	"property_id" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"source" text NOT NULL,
	"date" text NOT NULL,
	"clicks" integer,
	"impressions" integer,
	"avg_position" real,
	"ai_referrals" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action_ledger" ADD CONSTRAINT "agent_action_ledger_approval_id_agent_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."agent_approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_callback_receipts" ADD CONSTRAINT "agent_callback_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_callback_receipts" ADD CONSTRAINT "agent_callback_receipts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_llm_calls" ADD CONSTRAINT "agent_llm_calls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_llm_calls" ADD CONSTRAINT "agent_llm_calls_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_llm_calls" ADD CONSTRAINT "agent_llm_calls_step_execution_id_agent_step_executions_id_fk" FOREIGN KEY ("step_execution_id") REFERENCES "public"."agent_step_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_dependencies" ADD CONSTRAINT "agent_memory_dependencies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_dependencies" ADD CONSTRAINT "agent_memory_dependencies_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_dependencies" ADD CONSTRAINT "agent_memory_dependencies_record_id_agent_memory_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."agent_memory_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_dependencies" ADD CONSTRAINT "agent_memory_dependencies_depends_on_record_id_agent_memory_records_id_fk" FOREIGN KEY ("depends_on_record_id") REFERENCES "public"."agent_memory_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_propagation_markers" ADD CONSTRAINT "agent_memory_propagation_markers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_propagation_markers" ADD CONSTRAINT "agent_memory_propagation_markers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_propagation_markers" ADD CONSTRAINT "agent_memory_propagation_markers_correction_id_agent_memory_records_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."agent_memory_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD CONSTRAINT "agent_memory_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_memory_records" ADD CONSTRAINT "agent_memory_records_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD CONSTRAINT "agent_missions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_outcome_attributions" ADD CONSTRAINT "agent_outcome_attributions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_outcome_attributions" ADD CONSTRAINT "agent_outcome_attributions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_outcome_attributions" ADD CONSTRAINT "agent_outcome_attributions_action_id_agent_action_ledger_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."agent_action_ledger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_outcome_attributions" ADD CONSTRAINT "agent_outcome_attributions_objective_id_agent_missions_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."agent_missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_owner_policies" ADD CONSTRAINT "agent_owner_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_owner_policies" ADD CONSTRAINT "agent_owner_policies_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plan_versions" ADD CONSTRAINT "agent_plan_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plan_versions" ADD CONSTRAINT "agent_plan_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_plan_versions" ADD CONSTRAINT "agent_plan_versions_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_scheduled_work" ADD CONSTRAINT "agent_scheduled_work_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_scheduled_work" ADD CONSTRAINT "agent_scheduled_work_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step_executions" ADD CONSTRAINT "agent_step_executions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step_executions" ADD CONSTRAINT "agent_step_executions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step_executions" ADD CONSTRAINT "agent_step_executions_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step_executions" ADD CONSTRAINT "agent_step_executions_plan_version_id_agent_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."agent_plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_step_executions" ADD CONSTRAINT "agent_step_executions_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_strategy_weight_versions" ADD CONSTRAINT "agent_strategy_weight_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_strategy_weight_versions" ADD CONSTRAINT "agent_strategy_weight_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_plan_version_id_agent_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."agent_plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_intelligence" ADD CONSTRAINT "brand_intelligence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_intelligence" ADD CONSTRAINT "brand_intelligence_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_use_cases" ADD CONSTRAINT "brand_use_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_use_cases" ADD CONSTRAINT "brand_use_cases_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_content" ADD CONSTRAINT "competitor_content_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_content" ADD CONSTRAINT "competitor_content_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_checkpoints" ADD CONSTRAINT "performance_checkpoints_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_checkpoints" ADD CONSTRAINT "performance_checkpoints_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_checkpoints" ADD CONSTRAINT "performance_checkpoints_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_source_weights" ADD CONSTRAINT "topic_source_weights_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_research_run_id_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_activations" ADD CONSTRAINT "connector_activations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_activations" ADD CONSTRAINT "connector_activations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_activations" ADD CONSTRAINT "connector_activations_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_activations" ADD CONSTRAINT "connector_activations_certification_id_connector_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."connector_certifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_circuit_breakers" ADD CONSTRAINT "connector_circuit_breakers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_circuit_breakers" ADD CONSTRAINT "connector_circuit_breakers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutation_events" ADD CONSTRAINT "connector_mutation_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutation_events" ADD CONSTRAINT "connector_mutation_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutation_events" ADD CONSTRAINT "connector_mutation_events_mutation_id_connector_mutations_id_fk" FOREIGN KEY ("mutation_id") REFERENCES "public"."connector_mutations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_approval_id_agent_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."agent_approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_action_id_agent_action_ledger_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."agent_action_ledger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_autonomy_rollout_id_agent_autonomy_rollouts_id_fk" FOREIGN KEY ("autonomy_rollout_id") REFERENCES "public"."agent_autonomy_rollouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_autonomy_decision_id_agent_autonomy_decisions_id_fk" FOREIGN KEY ("autonomy_decision_id") REFERENCES "public"."agent_autonomy_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_mutations" ADD CONSTRAINT "connector_mutations_certification_id_connector_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."connector_certifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claim_ledgers" ADD CONSTRAINT "article_claim_ledgers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claim_ledgers" ADD CONSTRAINT "article_claim_ledgers_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claim_ledgers" ADD CONSTRAINT "article_claim_ledgers_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claim_ledgers" ADD CONSTRAINT "article_claim_ledgers_evidence_bundle_id_evidence_bundles_id_fk" FOREIGN KEY ("evidence_bundle_id") REFERENCES "public"."evidence_bundles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claims" ADD CONSTRAINT "article_claims_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claims" ADD CONSTRAINT "article_claims_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_claims" ADD CONSTRAINT "article_claims_ledger_id_article_claim_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."article_claim_ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_ledger_id_article_claim_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."article_claim_ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_claim_id_article_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."article_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citation_checks" ADD CONSTRAINT "citation_checks_evidence_source_id_evidence_sources_id_fk" FOREIGN KEY ("evidence_source_id") REFERENCES "public"."evidence_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_research_run_id_research_runs_id_fk" FOREIGN KEY ("research_run_id") REFERENCES "public"."research_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_bundles" ADD CONSTRAINT "evidence_bundles_supersedes_id_evidence_bundles_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."evidence_bundles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claim_links" ADD CONSTRAINT "evidence_claim_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claim_links" ADD CONSTRAINT "evidence_claim_links_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claim_links" ADD CONSTRAINT "evidence_claim_links_claim_id_article_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."article_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claim_links" ADD CONSTRAINT "evidence_claim_links_evidence_source_id_evidence_sources_id_fk" FOREIGN KEY ("evidence_source_id") REFERENCES "public"."evidence_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_bundle_id_evidence_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."evidence_bundles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_gate_checks" ADD CONSTRAINT "publication_gate_checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_gate_checks" ADD CONSTRAINT "publication_gate_checks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_gate_checks" ADD CONSTRAINT "publication_gate_checks_gate_run_id_publication_gate_runs_id_fk" FOREIGN KEY ("gate_run_id") REFERENCES "public"."publication_gate_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_gate_runs" ADD CONSTRAINT "publication_gate_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_gate_runs" ADD CONSTRAINT "publication_gate_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_gate_runs" ADD CONSTRAINT "publication_gate_runs_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_gate_runs" ADD CONSTRAINT "publication_gate_runs_claim_ledger_id_article_claim_ledgers_id_fk" FOREIGN KEY ("claim_ledger_id") REFERENCES "public"."article_claim_ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_daily_runs" ADD CONSTRAINT "agent_daily_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_daily_runs" ADD CONSTRAINT "agent_daily_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_runs" ADD CONSTRAINT "setup_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_runs" ADD CONSTRAINT "setup_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_eval_runs" ADD CONSTRAINT "agent_eval_runs_release_id_agent_behavior_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."agent_behavior_releases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_operational_incidents" ADD CONSTRAINT "agent_operational_incidents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_operational_incidents" ADD CONSTRAINT "agent_operational_incidents_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_mission_id_agent_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."agent_missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_plan_version_id_agent_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."agent_plan_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_step_execution_id_agent_step_executions_id_fk" FOREIGN KEY ("step_execution_id") REFERENCES "public"."agent_step_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_action_id_agent_action_ledger_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."agent_action_ledger"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_trace_spans" ADD CONSTRAINT "agent_trace_spans_approval_id_agent_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."agent_approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_decisions" ADD CONSTRAINT "agent_autonomy_decisions_rollout_id_agent_autonomy_rollouts_id_fk" FOREIGN KEY ("rollout_id") REFERENCES "public"."agent_autonomy_rollouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_decisions" ADD CONSTRAINT "agent_autonomy_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_decisions" ADD CONSTRAINT "agent_autonomy_decisions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_decisions" ADD CONSTRAINT "agent_autonomy_decisions_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_exercises" ADD CONSTRAINT "agent_autonomy_exercises_rollout_id_agent_autonomy_rollouts_id_fk" FOREIGN KEY ("rollout_id") REFERENCES "public"."agent_autonomy_rollouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_exercises" ADD CONSTRAINT "agent_autonomy_exercises_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_exercises" ADD CONSTRAINT "agent_autonomy_exercises_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_rollout_events" ADD CONSTRAINT "agent_autonomy_rollout_events_rollout_id_agent_autonomy_rollouts_id_fk" FOREIGN KEY ("rollout_id") REFERENCES "public"."agent_autonomy_rollouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_rollout_events" ADD CONSTRAINT "agent_autonomy_rollout_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_rollout_events" ADD CONSTRAINT "agent_autonomy_rollout_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_rollouts" ADD CONSTRAINT "agent_autonomy_rollouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_rollouts" ADD CONSTRAINT "agent_autonomy_rollouts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy_rollouts" ADD CONSTRAINT "agent_autonomy_rollouts_release_id_agent_behavior_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."agent_behavior_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_canary_measurements" ADD CONSTRAINT "agent_canary_measurements_rollout_id_agent_autonomy_rollouts_id_fk" FOREIGN KEY ("rollout_id") REFERENCES "public"."agent_autonomy_rollouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_canary_measurements" ADD CONSTRAINT "agent_canary_measurements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_canary_measurements" ADD CONSTRAINT "agent_canary_measurements_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_publications" ADD CONSTRAINT "article_publications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_publications" ADD CONSTRAINT "article_publications_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_publications" ADD CONSTRAINT "article_publications_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_autonomy" ADD CONSTRAINT "agent_autonomy_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_runs" ADD CONSTRAINT "answer_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_runs" ADD CONSTRAINT "answer_runs_prompt_id_tracked_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."tracked_prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_analyzer_runs" ADD CONSTRAINT "audit_analyzer_runs_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_signals" ADD CONSTRAINT "brand_signals_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citability_blocks" ADD CONSTRAINT "citability_blocks_audit_page_id_audit_pages_id_fk" FOREIGN KEY ("audit_page_id") REFERENCES "public"."audit_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_scores" ADD CONSTRAINT "platform_scores_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_blocks" ADD CONSTRAINT "schema_blocks_audit_page_id_audit_pages_id_fk" FOREIGN KEY ("audit_page_id") REFERENCES "public"."audit_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_prompts" ADD CONSTRAINT "tracked_prompts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_connections" ADD CONSTRAINT "traffic_connections_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_connections" ADD CONSTRAINT "traffic_connections_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_snapshots" ADD CONSTRAINT "traffic_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_action_ledger_brand_idempotency_idx" ON "agent_action_ledger" USING btree ("brand_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_action_ledger_brand_created_idx" ON "agent_action_ledger" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_action_ledger_task_idx" ON "agent_action_ledger" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_approvals_pending_proposal_hash_idx" ON "agent_approvals" USING btree ("brand_id","proposal_hash") WHERE "agent_approvals"."status" = 'pending' and "agent_approvals"."invalidated_at" is null and "agent_approvals"."proposal_hash" <> '';--> statement-breakpoint
CREATE INDEX "agent_approvals_brand_status_idx" ON "agent_approvals" USING btree ("brand_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_approvals_task_idx" ON "agent_approvals" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_callback_receipts_expiry_idx" ON "agent_callback_receipts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "agent_callback_receipts_workflow_idx" ON "agent_callback_receipts" USING btree ("workflow_instance_id","step_name");--> statement-breakpoint
CREATE INDEX "agent_events_brand_created_idx" ON "agent_events" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_events_task_created_idx" ON "agent_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_llm_calls_brand_created_idx" ON "agent_llm_calls" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_llm_calls_step_idx" ON "agent_llm_calls" USING btree ("step_execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_brand_kind_key_scope_idx" ON "agent_memory" USING btree ("brand_id","kind","key","scope");--> statement-breakpoint
CREATE INDEX "agent_memory_brand_status_expiry_idx" ON "agent_memory" USING btree ("brand_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_dependencies_edge_idx" ON "agent_memory_dependencies" USING btree ("record_id","depends_on_record_id","relation");--> statement-breakpoint
CREATE INDEX "agent_memory_dependencies_reverse_idx" ON "agent_memory_dependencies" USING btree ("depends_on_record_id","relation");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_propagation_correction_idx" ON "agent_memory_propagation_markers" USING btree ("correction_id");--> statement-breakpoint
CREATE INDEX "agent_memory_propagation_drain_idx" ON "agent_memory_propagation_markers" USING btree ("status","retry_after","lease_expires_at");--> statement-breakpoint
CREATE INDEX "agent_memory_records_retrieval_idx" ON "agent_memory_records" USING btree ("workspace_id","brand_id","status","valid_from","expires_at");--> statement-breakpoint
CREATE INDEX "agent_memory_records_subject_idx" ON "agent_memory_records" USING btree ("brand_id","subject_key");--> statement-breakpoint
CREATE INDEX "agent_memory_records_contradiction_idx" ON "agent_memory_records" USING btree ("brand_id","contradiction_group","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_memory_records_reflection_source_idx" ON "agent_memory_records" USING btree ("brand_id","source_ref") WHERE "agent_memory_records"."source_ref" like 'reflection:%';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_missions_brand_key_idx" ON "agent_missions" USING btree ("brand_id","key");--> statement-breakpoint
CREATE INDEX "agent_missions_brand_status_idx" ON "agent_missions" USING btree ("brand_id","status");--> statement-breakpoint
CREATE INDEX "agent_missions_brand_priority_idx" ON "agent_missions" USING btree ("brand_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_outcome_attributions_key_idx" ON "agent_outcome_attributions" USING btree ("brand_id","attribution_key");--> statement-breakpoint
CREATE INDEX "agent_outcome_attributions_action_idx" ON "agent_outcome_attributions" USING btree ("action_id","observed_at");--> statement-breakpoint
CREATE INDEX "agent_outcome_attributions_learning_idx" ON "agent_outcome_attributions" USING btree ("brand_id","outcome_kind","verified","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_owner_policies_active_key_idx" ON "agent_owner_policies" USING btree ("brand_id","policy_key") WHERE "agent_owner_policies"."status" = 'active';--> statement-breakpoint
CREATE INDEX "agent_owner_policies_brand_status_expiry_idx" ON "agent_owner_policies" USING btree ("brand_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_plan_versions_mission_version_idx" ON "agent_plan_versions" USING btree ("mission_id","version");--> statement-breakpoint
CREATE INDEX "agent_plan_versions_brand_window_idx" ON "agent_plan_versions" USING btree ("brand_id","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_scheduled_work_identity_idx" ON "agent_scheduled_work" USING btree ("schedule_kind","brand_id","schedule_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_scheduled_work_workflow_idx" ON "agent_scheduled_work" USING btree ("workflow_instance_id");--> statement-breakpoint
CREATE INDEX "agent_scheduled_work_reconcile_idx" ON "agent_scheduled_work" USING btree ("status","retry_after");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_step_executions_work_idx" ON "agent_step_executions" USING btree ("workflow_instance_id","step_key","work_key");--> statement-breakpoint
CREATE INDEX "agent_step_executions_lease_idx" ON "agent_step_executions" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "agent_step_executions_task_idx" ON "agent_step_executions" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_step_executions_billing_work_idx" ON "agent_step_executions" USING btree ("billing_work_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_step_executions_action_idx" ON "agent_step_executions" USING btree ("action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_strategy_weight_versions_version_idx" ON "agent_strategy_weight_versions" USING btree ("brand_id","action_family","strategy_key","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_strategy_weight_versions_active_idx" ON "agent_strategy_weight_versions" USING btree ("brand_id","action_family","strategy_key") WHERE "agent_strategy_weight_versions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "agent_strategy_weight_versions_brand_status_idx" ON "agent_strategy_weight_versions" USING btree ("brand_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_tasks_brand_idempotency_idx" ON "agent_tasks" USING btree ("brand_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "agent_tasks_brand_status_schedule_idx" ON "agent_tasks" USING btree ("brand_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "agent_tasks_plan_idx" ON "agent_tasks" USING btree ("plan_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_intelligence_brand_id_idx" ON "brand_intelligence" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_intelligence_workspace_id_idx" ON "brand_intelligence" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_intelligence_next_refresh_idx" ON "brand_intelligence" USING btree ("next_refresh_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_profiles_brand_id_idx" ON "brand_profiles" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_use_cases_brand_id_idx" ON "brand_use_cases" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brands_workspace_id_idx" ON "brands" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_workspace_name_unique" ON "brands" USING btree ("workspace_id",lower("name"));--> statement-breakpoint
CREATE INDEX "competitors_brand_id_idx" ON "competitors" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_secrets_key_idx" ON "integration_secrets" USING btree ("integration_id","secret_key");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_brand_provider_idx" ON "integrations" USING btree ("brand_id","provider");--> statement-breakpoint
CREATE INDEX "articles_brand_id_idx" ON "articles" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "articles_grounding_search_idx" ON "articles" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("tags", '') || ' ' || coalesce("body_markdown", '')));--> statement-breakpoint
CREATE UNIQUE INDEX "articles_topic_id_unique_idx" ON "articles" USING btree ("topic_id") WHERE "articles"."topic_id" is not null;--> statement-breakpoint
CREATE INDEX "competitor_content_brand_id_idx" ON "competitor_content" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_content_brand_url_idx" ON "competitor_content" USING btree ("brand_id","url");--> statement-breakpoint
CREATE INDEX "performance_checkpoints_brand_id_idx" ON "performance_checkpoints" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_checkpoints_article_day_idx" ON "performance_checkpoints" USING btree ("article_id","day");--> statement-breakpoint
CREATE INDEX "research_runs_brand_id_idx" ON "research_runs" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_runs_idempotency_idx" ON "research_runs" USING btree ("brand_id","idempotency_key") WHERE "research_runs"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "search_queries_brand_id_idx" ON "search_queries" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_queries_brand_query_page_period_idx" ON "search_queries" USING btree ("brand_id","query","page","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "topic_source_weights_brand_source_idx" ON "topic_source_weights" USING btree ("brand_id","source");--> statement-breakpoint
CREATE INDEX "topics_brand_id_idx" ON "topics" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_activations_identity_idx" ON "connector_activations" USING btree ("integration_id","certification_id");--> statement-breakpoint
CREATE INDEX "connector_activations_workspace_status_idx" ON "connector_activations" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "connector_activations_brand_status_idx" ON "connector_activations" USING btree ("brand_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "connector_activations_certification_status_idx" ON "connector_activations" USING btree ("certification_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_certifications_identity_idx" ON "connector_certifications" USING btree ("provider","capability","adapter_version","protocol_version");--> statement-breakpoint
CREATE INDEX "connector_certifications_status_idx" ON "connector_certifications" USING btree ("status","provider","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_circuit_breakers_identity_idx" ON "connector_circuit_breakers" USING btree ("brand_id","provider","capability");--> statement-breakpoint
CREATE INDEX "connector_circuit_breakers_workspace_status_idx" ON "connector_circuit_breakers" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "connector_mutation_events_mutation_created_idx" ON "connector_mutation_events" USING btree ("mutation_id","created_at");--> statement-breakpoint
CREATE INDEX "connector_mutation_events_brand_created_idx" ON "connector_mutation_events" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_mutations_brand_idempotency_idx" ON "connector_mutations" USING btree ("brand_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "connector_mutations_brand_status_idx" ON "connector_mutations" USING btree ("brand_id","status","created_at");--> statement-breakpoint
CREATE INDEX "connector_mutations_verification_idx" ON "connector_mutations" USING btree ("brand_id","verification_status","updated_at");--> statement-breakpoint
CREATE INDEX "connector_mutations_rollback_idx" ON "connector_mutations" USING btree ("brand_id","rollback_status","updated_at");--> statement-breakpoint
CREATE INDEX "connector_mutations_batch_idx" ON "connector_mutations" USING btree ("brand_id","batch_key","created_at");--> statement-breakpoint
CREATE INDEX "connector_mutations_task_idx" ON "connector_mutations" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "connector_mutations_approval_idx" ON "connector_mutations" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX "connector_mutations_action_idx" ON "connector_mutations" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "connector_mutations_autonomy_rollout_idx" ON "connector_mutations" USING btree ("autonomy_rollout_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_mutations_autonomy_decision_idx" ON "connector_mutations" USING btree ("autonomy_decision_id") WHERE "connector_mutations"."autonomy_decision_id" is not null;--> statement-breakpoint
CREATE INDEX "credit_ledger_workspace_created_idx" ON "credit_ledger" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_ref_unique_idx" ON "credit_ledger" USING btree ("workspace_id","reason","ref_id") WHERE "credit_ledger"."ref_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "article_claim_ledgers_brand_evaluation_key_idx" ON "article_claim_ledgers" USING btree ("brand_id","evaluation_key");--> statement-breakpoint
CREATE INDEX "article_claim_ledgers_content_evaluator_idx" ON "article_claim_ledgers" USING btree ("workspace_id","brand_id","article_id","article_version","final_content_hash","evaluator_version");--> statement-breakpoint
CREATE INDEX "article_claim_ledgers_scope_article_created_idx" ON "article_claim_ledgers" USING btree ("workspace_id","brand_id","article_id","created_at");--> statement-breakpoint
CREATE INDEX "article_claim_ledgers_retention_idx" ON "article_claim_ledgers" USING btree ("status","retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "article_claims_ledger_key_idx" ON "article_claims" USING btree ("ledger_id","claim_key");--> statement-breakpoint
CREATE UNIQUE INDEX "article_claims_ledger_ordinal_idx" ON "article_claims" USING btree ("ledger_id","ordinal");--> statement-breakpoint
CREATE INDEX "article_claims_scope_ledger_result_idx" ON "article_claims" USING btree ("workspace_id","brand_id","ledger_id","verification_result");--> statement-breakpoint
CREATE UNIQUE INDEX "citation_checks_ledger_key_idx" ON "citation_checks" USING btree ("ledger_id","citation_key");--> statement-breakpoint
CREATE INDEX "citation_checks_scope_ledger_status_idx" ON "citation_checks" USING btree ("workspace_id","brand_id","ledger_id","status");--> statement-breakpoint
CREATE INDEX "citation_checks_source_idx" ON "citation_checks" USING btree ("evidence_source_id");--> statement-breakpoint
CREATE INDEX "citation_checks_retention_idx" ON "citation_checks" USING btree ("status","retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_bundles_topic_version_idx" ON "evidence_bundles" USING btree ("workspace_id","brand_id","topic_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_bundles_brand_idempotency_idx" ON "evidence_bundles" USING btree ("brand_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "evidence_bundles_scope_topic_status_idx" ON "evidence_bundles" USING btree ("workspace_id","brand_id","topic_id","status");--> statement-breakpoint
CREATE INDEX "evidence_bundles_retention_idx" ON "evidence_bundles" USING btree ("status","retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_claim_links_claim_source_idx" ON "evidence_claim_links" USING btree ("claim_id","evidence_source_id");--> statement-breakpoint
CREATE INDEX "evidence_claim_links_scope_claim_idx" ON "evidence_claim_links" USING btree ("workspace_id","brand_id","claim_id");--> statement-breakpoint
CREATE INDEX "evidence_claim_links_source_idx" ON "evidence_claim_links" USING btree ("evidence_source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_sources_bundle_key_idx" ON "evidence_sources" USING btree ("bundle_id","source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_sources_bundle_canonical_hash_idx" ON "evidence_sources" USING btree ("bundle_id","canonical_url","content_hash");--> statement-breakpoint
CREATE INDEX "evidence_sources_scope_bundle_status_idx" ON "evidence_sources" USING btree ("workspace_id","brand_id","bundle_id","status");--> statement-breakpoint
CREATE INDEX "evidence_sources_canonical_url_idx" ON "evidence_sources" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "evidence_sources_retention_idx" ON "evidence_sources" USING btree ("status","retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_gate_checks_run_key_idx" ON "publication_gate_checks" USING btree ("gate_run_id","gate_key");--> statement-breakpoint
CREATE INDEX "publication_gate_checks_scope_run_status_idx" ON "publication_gate_checks" USING btree ("workspace_id","brand_id","gate_run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_gate_runs_brand_evaluation_key_idx" ON "publication_gate_runs" USING btree ("brand_id","evaluation_key");--> statement-breakpoint
CREATE INDEX "publication_gate_runs_scope_content_created_idx" ON "publication_gate_runs" USING btree ("workspace_id","brand_id","article_id","article_version","final_content_hash","created_at");--> statement-breakpoint
CREATE INDEX "publication_gate_runs_retention_idx" ON "publication_gate_runs" USING btree ("status","retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_daily_runs_brand_date_idx" ON "agent_daily_runs" USING btree ("brand_id","run_date");--> statement-breakpoint
CREATE INDEX "agent_jobs_brand_id_idx" ON "agent_jobs" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_jobs_brand_kind_idempotency_idx" ON "agent_jobs" USING btree ("brand_id","kind","idempotency_key") WHERE "agent_jobs"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "setup_runs_brand_id_idx" ON "setup_runs" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_brand_week_idx" ON "usage_counters" USING btree ("brand_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_behavior_releases_key_idx" ON "agent_behavior_releases" USING btree ("release_key");--> statement-breakpoint
CREATE INDEX "agent_behavior_releases_status_idx" ON "agent_behavior_releases" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_eval_runs_release_suite_idx" ON "agent_eval_runs" USING btree ("release_id","suite","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_operational_incidents_active_fingerprint_idx" ON "agent_operational_incidents" USING btree ("fingerprint") WHERE "agent_operational_incidents"."status" in ('open','acknowledged');--> statement-breakpoint
CREATE INDEX "agent_operational_incidents_status_severity_idx" ON "agent_operational_incidents" USING btree ("status","severity","last_observed_at");--> statement-breakpoint
CREATE INDEX "agent_operational_incidents_scope_idx" ON "agent_operational_incidents" USING btree ("workspace_id","brand_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_trace_spans_identity_idx" ON "agent_trace_spans" USING btree ("trace_id","span_key");--> statement-breakpoint
CREATE INDEX "agent_trace_spans_scope_trace_idx" ON "agent_trace_spans" USING btree ("workspace_id","brand_id","trace_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_trace_spans_step_idx" ON "agent_trace_spans" USING btree ("step_execution_id");--> statement-breakpoint
CREATE INDEX "agent_trace_spans_action_idx" ON "agent_trace_spans" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "agent_trace_spans_retention_idx" ON "agent_trace_spans" USING btree ("retention_until");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_autonomy_decisions_scope_key_idx" ON "agent_autonomy_decisions" USING btree ("brand_id","decision_key");--> statement-breakpoint
CREATE INDEX "agent_autonomy_decisions_rollout_created_idx" ON "agent_autonomy_decisions" USING btree ("rollout_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_autonomy_decisions_scope_capability_idx" ON "agent_autonomy_decisions" USING btree ("workspace_id","brand_id","capability","created_at");--> statement-breakpoint
CREATE INDEX "agent_autonomy_exercises_rollout_kind_idx" ON "agent_autonomy_exercises" USING btree ("rollout_id","kind","completed_at");--> statement-breakpoint
CREATE INDEX "agent_autonomy_rollout_events_rollout_created_idx" ON "agent_autonomy_rollout_events" USING btree ("rollout_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_autonomy_rollouts_active_capability_idx" ON "agent_autonomy_rollouts" USING btree ("brand_id","capability") WHERE "agent_autonomy_rollouts"."status" in ('active','paused');--> statement-breakpoint
CREATE INDEX "agent_autonomy_rollouts_scope_status_idx" ON "agent_autonomy_rollouts" USING btree ("workspace_id","brand_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "agent_autonomy_rollouts_release_idx" ON "agent_autonomy_rollouts" USING btree ("release_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_canary_measurements_window_metric_idx" ON "agent_canary_measurements" USING btree ("rollout_id","metric","window_starts_at","window_ends_at");--> statement-breakpoint
CREATE INDEX "agent_canary_measurements_rollout_conclusion_idx" ON "agent_canary_measurements" USING btree ("rollout_id","conclusion","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "article_publications_article_provider_idx" ON "article_publications" USING btree ("article_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reports_site_week_idx" ON "weekly_reports" USING btree ("workspace_id","site_url","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_autonomy_brand_category_unique" ON "agent_autonomy" USING btree ("brand_id","category");--> statement-breakpoint
CREATE INDEX "answer_runs_brand_id_idx" ON "answer_runs" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "answer_runs_prompt_id_idx" ON "answer_runs" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_analyzer_runs_identity_idx" ON "audit_analyzer_runs" USING btree ("audit_id","analyzer_key","analyzer_version");--> statement-breakpoint
CREATE INDEX "audit_analyzer_runs_audit_status_idx" ON "audit_analyzer_runs" USING btree ("audit_id","status");--> statement-breakpoint
CREATE INDEX "audit_findings_audit_id_idx" ON "audit_findings" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audit_findings_brand_id_idx" ON "audit_findings" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "audit_pages_audit_id_idx" ON "audit_pages" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "audits_workspace_id_idx" ON "audits" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "audits_brand_id_idx" ON "audits" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brand_signals_audit_id_idx" ON "brand_signals" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "citability_blocks_page_id_idx" ON "citability_blocks" USING btree ("audit_page_id");--> statement-breakpoint
CREATE INDEX "platform_scores_audit_id_idx" ON "platform_scores" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "prospects_workspace_id_idx" ON "prospects" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "schema_blocks_page_id_idx" ON "schema_blocks" USING btree ("audit_page_id");--> statement-breakpoint
CREATE INDEX "tool_runs_workspace_id_idx" ON "tool_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tracked_prompts_brand_id_idx" ON "tracked_prompts" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "traffic_connections_brand_id_idx" ON "traffic_connections" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_connections_brand_source_unique" ON "traffic_connections" USING btree ("brand_id","source");--> statement-breakpoint
CREATE INDEX "traffic_snapshots_brand_id_idx" ON "traffic_snapshots" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "traffic_snapshots_brand_source_date_unique" ON "traffic_snapshots" USING btree ("brand_id","source","date");