CREATE TABLE `meeting_agent_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`agent` text NOT NULL,
	`action_type` text NOT NULL,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`destination` text DEFAULT 'HavenConnect' NOT NULL,
	`status` text DEFAULT 'Proposed' NOT NULL,
	`external_id` text,
	`decided_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_meeting_agent_proposals_meeting_status` ON `meeting_agent_proposals` (`meeting_id`,`status`);--> statement-breakpoint
CREATE TABLE `meeting_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meeting_id` text DEFAULT 'workspace' NOT NULL,
	`actor` text NOT NULL,
	`event_type` text NOT NULL,
	`detail` text NOT NULL,
	`consequential` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meeting_records` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`organizer` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`lifecycle` text DEFAULT 'Pre-Meeting' NOT NULL,
	`room_id` text,
	`agenda` text DEFAULT '[]' NOT NULL,
	`attendees` text DEFAULT '[]' NOT NULL,
	`consent_status` text DEFAULT 'Not requested' NOT NULL,
	`recording_status` text DEFAULT 'Off' NOT NULL,
	`transcript_status` text DEFAULT 'Off' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meeting_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`room_email` text NOT NULL,
	`building` text NOT NULL,
	`floor` text NOT NULL,
	`location` text NOT NULL,
	`room_type` text NOT NULL,
	`capacity` integer NOT NULL,
	`accessible` integer DEFAULT true NOT NULL,
	`equipment` text DEFAULT '[]' NOT NULL,
	`supported_providers` text DEFAULT '[]' NOT NULL,
	`operating_status` text DEFAULT 'Unknown' NOT NULL,
	`maintenance_status` text DEFAULT 'Assessment required' NOT NULL,
	`booking_window_days` integer DEFAULT 90 NOT NULL,
	`max_duration_minutes` integer DEFAULT 240 NOT NULL,
	`external_meeting_policy` text DEFAULT 'Approval required' NOT NULL,
	`last_check_in` text,
	`software_version` text,
	`last_restart` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meeting_rooms_room_email_unique` ON `meeting_rooms` (`room_email`);--> statement-breakpoint
CREATE TABLE `room_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`meeting_id` text,
	`title` text NOT NULL,
	`organizer` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`status` text DEFAULT 'Confirmed' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_room_bookings_room_time` ON `room_bookings` (`room_id`,`start_at`,`end_at`);--> statement-breakpoint
CREATE TABLE `room_reservation_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`slot` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_reservation_slots_room_slot_unique` ON `room_reservation_slots` (`room_id`,`slot`);