CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`record_date` text NOT NULL,
	`clock_in` text,
	`clock_out` text,
	`import_id` text NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_employee_date` ON `attendance_records` (`employer_id`,`employee_id`,`record_date`);--> statement-breakpoint
CREATE TABLE `digests` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`manager_id` text NOT NULL,
	`digest_date` text NOT NULL,
	`sent_at` text NOT NULL,
	`gap_count` integer NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_id`) REFERENCES `managers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `digests_idempotency` ON `digests` (`employer_id`,`manager_id`,`digest_date`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`external_id` text NOT NULL,
	`full_name` text NOT NULL,
	`manager_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_id`) REFERENCES `managers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_external` ON `employees` (`employer_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `employers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`payroll_email` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `escalations` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`gap_id` text NOT NULL,
	`escalated_at` text NOT NULL,
	`escalated_to` text NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gap_id`) REFERENCES `gaps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `escalations_once_per_gap` ON `escalations` (`gap_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`occurred_at` text NOT NULL,
	`type` text NOT NULL,
	`gap_id` text,
	`manager_id` text,
	`payload` text NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_by_gap` ON `events` (`gap_id`);--> statement-breakpoint
CREATE TABLE `gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`gap_date` text NOT NULL,
	`gap_type` text NOT NULL,
	`manager_id` text NOT NULL,
	`detected_at` text NOT NULL,
	`manager_notified_at` text,
	`resolved_at` text,
	`resolution` text,
	`resolution_note` text,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_id`) REFERENCES `managers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gaps_idempotency` ON `gaps` (`employer_id`,`employee_id`,`gap_date`,`gap_type`);--> statement-breakpoint
CREATE INDEX `gaps_open_by_manager` ON `gaps` (`employer_id`,`manager_id`,`resolved_at`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`source` text NOT NULL,
	`imported_at` text NOT NULL,
	`row_count` integer NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `managers` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`external_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`whatsapp_number` text,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managers_external` ON `managers` (`employer_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `scheduled_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`shift_date` text NOT NULL,
	`planned_start` text NOT NULL,
	`planned_end` text NOT NULL,
	`import_id` text NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shifts_employee_date` ON `scheduled_shifts` (`employer_id`,`employee_id`,`shift_date`);--> statement-breakpoint
CREATE TABLE `unscheduled_attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`employer_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`record_date` text NOT NULL,
	`attendance_record_id` text NOT NULL,
	`detected_at` text NOT NULL,
	FOREIGN KEY (`employer_id`) REFERENCES `employers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unscheduled_idempotency` ON `unscheduled_attendance` (`employer_id`,`employee_id`,`record_date`);