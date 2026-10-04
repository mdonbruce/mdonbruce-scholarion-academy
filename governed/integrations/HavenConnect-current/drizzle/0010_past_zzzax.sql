CREATE TABLE `ivr_flow_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`greeting` text NOT NULL,
	`menu` text DEFAULT '[]' NOT NULL,
	`business_hours` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`approved_by` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ivr_flow_versions_name_version_unique` ON `ivr_flow_versions` (`name`,`version`);--> statement-breakpoint
CREATE TABLE `voice_events` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`direction` text NOT NULL,
	`channel` text NOT NULL,
	`queue` text DEFAULT '' NOT NULL,
	`staff_email` text DEFAULT '' NOT NULL,
	`remote_party` text DEFAULT '' NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`duration_seconds` integer,
	`wait_seconds` integer,
	`consent_evidence` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_voice_events_call_time` ON `voice_events` (`call_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_voice_events_queue_time` ON `voice_events` (`queue`,`created_at`);--> statement-breakpoint
CREATE TABLE `voice_queues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`strategy` text NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`overflow_queue` text,
	`after_hours_target` text DEFAULT 'Voicemail' NOT NULL,
	`service_level_seconds` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'Disabled' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_queues_name_unique` ON `voice_queues` (`name`);--> statement-breakpoint
CREATE TABLE `voice_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`object_key` text,
	`status` text DEFAULT 'Awaiting Provider' NOT NULL,
	`consent_status` text NOT NULL,
	`retention_policy` text NOT NULL,
	`legal_hold` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_staff_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_name` text NOT NULL,
	`job_title` text NOT NULL,
	`department` text NOT NULL,
	`work_email` text NOT NULL,
	`extension` text NOT NULL,
	`presence` text DEFAULT 'Offline' NOT NULL,
	`queue_membership` text DEFAULT '[]' NOT NULL,
	`call_permissions` text DEFAULT '[]' NOT NULL,
	`availability` text DEFAULT 'Unavailable' NOT NULL,
	`assigned_property` text DEFAULT 'Oak Haven Lodging & Suites' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_staff_profiles_work_email_unique` ON `voice_staff_profiles` (`work_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `voice_staff_profiles_extension_unique` ON `voice_staff_profiles` (`extension`);--> statement-breakpoint
CREATE INDEX `idx_voice_staff_department_presence` ON `voice_staff_profiles` (`department`,`presence`);