CREATE TABLE `agent_actions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`provider` text NOT NULL,
	`action_type` text NOT NULL,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`requested_by` text DEFAULT 'Oak Haven Staff' NOT NULL,
	`status` text DEFAULT 'Pending approval' NOT NULL,
	`created_at` integer NOT NULL
);
