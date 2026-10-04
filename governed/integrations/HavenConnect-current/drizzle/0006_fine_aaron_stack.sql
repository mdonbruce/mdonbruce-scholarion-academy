CREATE TABLE `rtc_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`from_extension` text NOT NULL,
	`to_extension` text NOT NULL,
	`offer` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Ringing' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rtc_calls_destination_status` ON `rtc_calls` (`to_extension`,`status`);