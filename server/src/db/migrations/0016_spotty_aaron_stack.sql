ALTER TABLE "onboarding" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "status" text NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "index_sha" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "llm_calls" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_in" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "tokens_out" integer;--> statement-breakpoint
ALTER TABLE "onboarding" ADD COLUMN "cost_usd" double precision;--> statement-breakpoint
ALTER TABLE "onboarding" ADD CONSTRAINT "onboarding_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_workspace_idx" ON "onboarding" USING btree ("workspace_id");