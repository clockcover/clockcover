CREATE TABLE `send_cooldowns` (
	`key` text PRIMARY KEY NOT NULL,
	`until` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `used_link_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `employees_by_manager` ON `employees` (`employer_id`,`manager_id`);--> statement-breakpoint
CREATE INDEX `escalations_by_employer` ON `escalations` (`employer_id`);--> statement-breakpoint
CREATE INDEX `events_by_employer_time` ON `events` (`employer_id`,`occurred_at`);