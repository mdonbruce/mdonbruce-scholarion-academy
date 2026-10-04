CREATE TABLE `number_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`number` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'allocated' NOT NULL,
	`real_entry_point_id` text,
	`assigned_to` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `number_allocations_tenant_number_unique` ON `number_allocations` (`tenant_id`,`number`);--> statement-breakpoint
CREATE INDEX `idx_number_allocations_tenant_status` ON `number_allocations` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_number_allocations_entry_point` ON `number_allocations` (`real_entry_point_id`);