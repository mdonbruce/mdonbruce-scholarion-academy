CREATE TABLE `haven_numbers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`virtual_number` text NOT NULL,
	`extension` text NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`tenant` text DEFAULT 'Oak Haven' NOT NULL,
	`route_type` text NOT NULL,
	`route_target` text NOT NULL,
	`edge_alias` text DEFAULT 'internal' NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `haven_numbers_virtual_number_unique` ON `haven_numbers` (`virtual_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `haven_numbers_extension_unique` ON `haven_numbers` (`extension`);