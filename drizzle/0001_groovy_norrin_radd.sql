CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`title` text NOT NULL,
	`due_date` text,
	`priority` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`expected_minutes` integer NOT NULL,
	`completed_at` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "task_positive_version" CHECK("tasks"."version" > 0),
	CONSTRAINT "task_valid_minutes" CHECK("tasks"."expected_minutes" BETWEEN 1 AND 100000),
	CONSTRAINT "task_valid_priority" CHECK("tasks"."priority" IN ('high', 'normal', 'low'))
);
--> statement-breakpoint
CREATE INDEX `tasks_plan_idx` ON `tasks` (`plan_id`);