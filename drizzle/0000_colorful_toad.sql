CREATE TABLE `plan_versions` (
	`plan_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`priority` text NOT NULL,
	`success_criteria` text NOT NULL,
	`expected_minutes` integer NOT NULL,
	`saved_at` text NOT NULL,
	PRIMARY KEY(`plan_id`, `version`),
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "positive_version" CHECK("plan_versions"."version" > 0),
	CONSTRAINT "valid_minutes" CHECK("plan_versions"."expected_minutes" BETWEEN 1 AND 100000),
	CONSTRAINT "valid_priority" CHECK("plan_versions"."priority" IN ('high', 'normal', 'low')),
	CONSTRAINT "valid_period" CHECK("plan_versions"."end_date" >= "plan_versions"."start_date")
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
