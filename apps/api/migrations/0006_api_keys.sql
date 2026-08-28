CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_hash` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_employer` ON `api_keys` (`employer_id`);