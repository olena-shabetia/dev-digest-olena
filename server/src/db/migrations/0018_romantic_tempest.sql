CREATE TABLE "eval_set_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"agent_version" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"strategy" text NOT NULL,
	"system_prompt" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cases_total" integer NOT NULL,
	"cases_done" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer,
	"cases_errored" integer,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"duration_ms" integer,
	"cost_usd" double precision,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_set_runs" ADD CONSTRAINT "eval_set_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_set_runs_agent_started_idx" ON "eval_set_runs" USING btree ("workspace_id","agent_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_set_runs_one_running_uq" ON "eval_set_runs" USING btree ("agent_id") WHERE "eval_set_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "eval_cases_owner_idx" ON "eval_cases" USING btree ("workspace_id","owner_kind","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_owner_finding_uq" ON "eval_cases" USING btree ("owner_id","source_finding_id");