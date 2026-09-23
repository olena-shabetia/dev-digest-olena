CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_ws_pr_created_idx" ON "reviews" USING btree ("workspace_id","pr_id","created_at");--> statement-breakpoint
CREATE INDEX "agents_ws_idx" ON "agents" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_ws_pr_status_idx" ON "agent_runs" USING btree ("workspace_id","pr_id","status");