CREATE TABLE `protected_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`environment` text NOT NULL,
	`custom_domain` text,
	`domain_token` text,
	`domain_status` text DEFAULT 'Not configured' NOT NULL,
	`primary_region` text DEFAULT '' NOT NULL,
	`isolation_mode` text DEFAULT '' NOT NULL,
	`identity_realm` text DEFAULT '' NOT NULL,
	`secret_ref` text DEFAULT '' NOT NULL,
	`kms_ref` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `protected_tenants_slug_environment_unique` ON `protected_tenants` (`slug`,`environment`);--> statement-breakpoint
CREATE UNIQUE INDEX `protected_tenants_domain_unique` ON `protected_tenants` (`custom_domain`);--> statement-breakpoint
CREATE TABLE `tenant_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`details` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `protected_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_audit_tenant_time` ON `tenant_audit` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`proposed` text NOT NULL,
	`reason` text NOT NULL,
	`classification` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`base_version` integer NOT NULL,
	`submitted_by` text NOT NULL,
	`reviewed_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `protected_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_changes_tenant_status` ON `tenant_changes` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `tenant_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'Queued' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `protected_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_outbox_tenant_time` ON `tenant_outbox` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_validations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`domain` text NOT NULL,
	`status` text NOT NULL,
	`evidence` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`checked_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `protected_tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tenant_validations_tenant_time` ON `tenant_validations` (`tenant_id`,`checked_at`);