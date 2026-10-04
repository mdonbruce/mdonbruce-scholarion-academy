CREATE TABLE `cx_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text DEFAULT 'oak-haven' NOT NULL,
	`session_id` text NOT NULL,
	`context_id` text,
	`channel` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cx_events_session_time` ON `cx_events` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_cx_events_type_time` ON `cx_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `cx_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`tenant_id` text DEFAULT 'oak-haven' NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cx_records_kind_tenant` ON `cx_records` (`kind`,`tenant_id`,`updated_at`);