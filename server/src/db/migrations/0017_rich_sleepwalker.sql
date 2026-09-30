ALTER TABLE "pr_brief" ADD COLUMN "workspace_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_brief" ADD CONSTRAINT "pr_brief_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pr_brief_ws_idx" ON "pr_brief" USING btree ("workspace_id");