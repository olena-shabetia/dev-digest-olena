ALTER TABLE "skill_versions" ADD COLUMN "change_note" text;--> statement-breakpoint
CREATE INDEX "reviews_ws_agent_idx" ON "reviews" USING btree ("workspace_id","agent_id");--> statement-breakpoint
CREATE INDEX "skills_ws_idx" ON "skills" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_ws_agent_idx" ON "agent_runs" USING btree ("workspace_id","agent_id","ran_at");