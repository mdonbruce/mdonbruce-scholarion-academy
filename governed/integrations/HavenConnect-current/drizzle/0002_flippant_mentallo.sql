CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`contact_type` text DEFAULT 'Customer' NOT NULL,
	`department` text DEFAULT 'Guest Services' NOT NULL,
	`preferred_channel` text DEFAULT 'WhatsApp' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
