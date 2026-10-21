ALTER TABLE "ci_installations" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "github_repo_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "agent_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workflow_run_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "run_attempt" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "head_sha" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "conclusion" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "schema_version" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_version" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "runner_version" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD CONSTRAINT "ci_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_ws_repo_uq" ON "ci_installations" USING btree ("workspace_id","repo");--> statement-breakpoint
CREATE INDEX "ci_installations_ws_agent_idx" ON "ci_installations" USING btree ("workspace_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_ws_run_attempt_uq" ON "ci_runs" USING btree ("workspace_id","workflow_run_id","run_attempt");--> statement-breakpoint
CREATE INDEX "ci_runs_ws_ran_at_idx" ON "ci_runs" USING btree ("workspace_id","ran_at");