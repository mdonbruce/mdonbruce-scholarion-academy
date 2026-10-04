CREATE TABLE `communication_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`display_number` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'free' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`quarantine_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communication_identities_tenant_canonical_unique` ON `communication_identities` (`tenant_id`,`canonical_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `communication_identities_tenant_display_unique` ON `communication_identities` (`tenant_id`,`display_number`);--> statement-breakpoint
CREATE INDEX `idx_communication_identities_tenant_status` ON `communication_identities` (`tenant_id`,`type`,`status`);--> statement-breakpoint
CREATE TABLE `external_entry_points` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`provider_resource_id` text NOT NULL,
	`entry_point_type` text NOT NULL,
	`address` text NOT NULL,
	`country_code` text NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`verification_status` text DEFAULT 'Awaiting Verification' NOT NULL,
	`provisioning_status` text DEFAULT 'Not Configured' NOT NULL,
	`inbound_enabled` integer DEFAULT false NOT NULL,
	`outbound_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_entry_points_tenant_provider_resource_unique` ON `external_entry_points` (`tenant_id`,`provider_id`,`provider_resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_entry_points_tenant_address_unique` ON `external_entry_points` (`tenant_id`,`address`);--> statement-breakpoint
CREATE INDEX `idx_external_entry_points_tenant_status` ON `external_entry_points` (`tenant_id`,`verification_status`,`provisioning_status`);--> statement-breakpoint
CREATE TABLE `identity_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`communication_identity_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_until` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`communication_identity_id`) REFERENCES `communication_identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_assignments_active_identity_unique` ON `identity_assignments` (`tenant_id`,`communication_identity_id`) WHERE "identity_assignments"."status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_identity_assignments_tenant_target` ON `identity_assignments` (`tenant_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `identity_entry_point_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`communication_identity_id` text NOT NULL,
	`external_entry_point_id` text NOT NULL,
	`direction` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`effective_from` integer NOT NULL,
	`effective_until` integer,
	`status` text DEFAULT 'Testing' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`communication_identity_id`) REFERENCES `communication_identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`external_entry_point_id`) REFERENCES `external_entry_points`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_entry_point_mappings_tenant_pair_direction_unique` ON `identity_entry_point_mappings` (`tenant_id`,`communication_identity_id`,`external_entry_point_id`,`direction`);--> statement-breakpoint
CREATE INDEX `idx_identity_entry_point_mappings_route` ON `identity_entry_point_mappings` (`tenant_id`,`communication_identity_id`,`direction`,`status`);--> statement-breakpoint
CREATE TABLE `number_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`identity_id` text,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`previous_values` text DEFAULT '{}' NOT NULL,
	`new_values` text DEFAULT '{}' NOT NULL,
	`correlation_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_number_audit_events_tenant_time` ON `number_audit_events` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_number_audit_events_correlation` ON `number_audit_events` (`tenant_id`,`correlation_id`);--> statement-breakpoint
CREATE TABLE `xconnect_idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation` text NOT NULL,
	`resource_id` text,
	`response_body` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xconnect_idempotency_tenant_key_unique` ON `xconnect_idempotency` (`tenant_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_xconnect_idempotency_tenant_time` ON `xconnect_idempotency` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `xconnect_number_ranges` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`number_type` text NOT NULL,
	`range_start` integer NOT NULL,
	`range_end` integer NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xconnect_ranges_tenant_type_bounds_unique` ON `xconnect_number_ranges` (`tenant_id`,`number_type`,`range_start`,`range_end`);--> statement-breakpoint
CREATE INDEX `idx_xconnect_ranges_tenant_type` ON `xconnect_number_ranges` (`tenant_id`,`number_type`,`status`);--> statement-breakpoint
CREATE TABLE `xconnect_routing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`communication_identity_id` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`conditions` text DEFAULT '{}' NOT NULL,
	`destination_type` text NOT NULL,
	`destination_id` text NOT NULL,
	`fallback_destination_type` text,
	`fallback_destination_id` text,
	`schedule_id` text,
	`status` text DEFAULT 'Testing' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `xconnect_tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`communication_identity_id`) REFERENCES `communication_identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xconnect_routing_rules_tenant_identity_priority_unique` ON `xconnect_routing_rules` (`tenant_id`,`communication_identity_id`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_xconnect_routing_rules_resolve` ON `xconnect_routing_rules` (`tenant_id`,`communication_identity_id`,`status`,`priority`);--> statement-breakpoint
CREATE TABLE `xconnect_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xconnect_tenants_slug_unique` ON `xconnect_tenants` (`slug`);