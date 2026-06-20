CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sessions_token_hash` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text,
	`email` text NOT NULL,
	`name` text,
	`role` text DEFAULT 'owner' NOT NULL,
	`password_hash` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_users_role" CHECK("__new_users"."role" in ('owner', 'admin', 'agent', 'viewer'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "business_id", "email", "name", "role", "password_hash", "created_at") SELECT "id", "business_id", "email", "name", "role", "password_hash", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `industry` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `address` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `agent_name` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `greeting` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `default_appointment_minutes` integer DEFAULT 30 NOT NULL;