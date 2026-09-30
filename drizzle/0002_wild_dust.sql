CREATE TABLE `study_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`actual_minutes` integer NOT NULL,
	`studied_content` text NOT NULL,
	`blocker_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "study_log_valid_minutes" CHECK("study_logs"."actual_minutes" BETWEEN 1 AND 100000),
	CONSTRAINT "study_log_valid_period" CHECK("study_logs"."ended_at" >= "study_logs"."started_at"),
	CONSTRAINT "study_log_positive_version" CHECK("study_logs"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `study_logs_task_idx` ON `study_logs` (`task_id`);