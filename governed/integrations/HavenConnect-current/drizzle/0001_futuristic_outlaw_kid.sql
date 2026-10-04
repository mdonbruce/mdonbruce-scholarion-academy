CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text DEFAULT 'Announcement' NOT NULL,
	`status` text DEFAULT 'Published' NOT NULL,
	`publish_date` text NOT NULL,
	`author` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `queue_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`caller` text NOT NULL,
	`phone` text NOT NULL,
	`queue_name` text NOT NULL,
	`call_type` text DEFAULT 'VoIP' NOT NULL,
	`direction` text DEFAULT 'Incoming' NOT NULL,
	`status` text DEFAULT 'Waiting' NOT NULL,
	`agent` text DEFAULT 'Unassigned' NOT NULL,
	`created_at` integer NOT NULL
);
