CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text,
	`key_hash` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_api_keys_key_hash` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_business` ON `api_keys` (`business_id`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`call_id` text,
	`lead_id` text,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_email` text,
	`service` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`timezone` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`location` text,
	`calendar_event_id` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_appointments_status" CHECK("appointments"."status" in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show'))
);
--> statement-breakpoint
CREATE INDEX `idx_appointments_business_starts` ON `appointments` (`business_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_appointments_business_status` ON `appointments` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_appointments_call` ON `appointments` (`call_id`);--> statement-breakpoint
CREATE INDEX `idx_appointments_lead` ON `appointments` (`lead_id`);--> statement-breakpoint
CREATE TABLE `business_faqs` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`tags` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_business_faqs_business_active` ON `business_faqs` (`business_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `business_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`open_time` text,
	`close_time` text,
	`closed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_business_hours_dow" CHECK("business_hours"."day_of_week" between 0 and 6)
);
--> statement-breakpoint
CREATE INDEX `idx_business_hours_business_day` ON `business_hours` (`business_id`,`day_of_week`);--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`timezone` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "ck_businesses_status" CHECK("businesses"."status" in ('active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_businesses_slug` ON `businesses` (`slug`);--> statement-breakpoint
CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`phone_number_id` text,
	`provider_call_id` text,
	`caller_number` text,
	`direction` text DEFAULT 'inbound' NOT NULL,
	`started_at` text,
	`ended_at` text,
	`duration_seconds` integer,
	`outcome` text,
	`recording_url` text,
	`transcript` text,
	`summary` text,
	`intent` text,
	`sentiment` text,
	`raw_payload` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`phone_number_id`) REFERENCES `phone_numbers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_calls_direction" CHECK("calls"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "ck_calls_outcome" CHECK("calls"."outcome" is null or "calls"."outcome" in ('info_provided', 'appointment_booked', 'lead_captured', 'escalated', 'transferred', 'abandoned')),
	CONSTRAINT "ck_calls_sentiment" CHECK("calls"."sentiment" is null or "calls"."sentiment" in ('positive', 'neutral', 'negative'))
);
--> statement-breakpoint
CREATE INDEX `idx_calls_business_started` ON `calls` (`business_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_calls_business_outcome` ON `calls` (`business_id`,`outcome`);--> statement-breakpoint
CREATE INDEX `idx_calls_provider_call` ON `calls` (`provider_call_id`);--> statement-breakpoint
CREATE TABLE `escalation_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`phone` text,
	`email` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_escalation_contacts_business_priority` ON `escalation_contacts` (`business_id`,`priority`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`call_id` text,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`reason` text,
	`preferred_time` text,
	`urgency` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`escalated` integer DEFAULT false NOT NULL,
	`assigned_to` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_leads_urgency" CHECK("leads"."urgency" in ('low', 'normal', 'high')),
	CONSTRAINT "ck_leads_status" CHECK("leads"."status" in ('new', 'contacted', 'scheduled', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `idx_leads_business_status` ON `leads` (`business_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_leads_business_urgency` ON `leads` (`business_id`,`urgency`);--> statement-breakpoint
CREATE INDEX `idx_leads_business_created` ON `leads` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_leads_assigned_to` ON `leads` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `idx_leads_call` ON `leads` (`call_id`);--> statement-breakpoint
CREATE TABLE `phone_numbers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`e164` text NOT NULL,
	`provider` text,
	`label` text,
	`assistant_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_phone_numbers_e164` ON `phone_numbers` (`e164`);--> statement-breakpoint
CREATE INDEX `idx_phone_numbers_business` ON `phone_numbers` (`business_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`role` text DEFAULT 'agent' NOT NULL,
	`password_hash` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_users_role" CHECK("users"."role" in ('admin', 'agent', 'viewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_business_email` ON `users` (`business_id`,`email`);