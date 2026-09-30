CREATE TABLE `plan_reviews` (
	`plan_id` text PRIMARY KEY NOT NULL,
	`next_plan_id` text NOT NULL,
	`improvement` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`next_plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "plan_review_positive_version" CHECK("plan_reviews"."version" > 0),
	CONSTRAINT "plan_review_distinct_plans" CHECK("plan_reviews"."plan_id" <> "plan_reviews"."next_plan_id")
);
--> statement-breakpoint
CREATE INDEX `plan_reviews_next_plan_idx` ON `plan_reviews` (`next_plan_id`);