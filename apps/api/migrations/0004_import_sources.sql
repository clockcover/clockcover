ALTER TABLE `employers` ADD `import_url` text;--> statement-breakpoint
ALTER TABLE `employers` ADD `roster_url` text;--> statement-breakpoint
ALTER TABLE `imports` ADD `trigger` text DEFAULT 'upload' NOT NULL;