CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`filename` text NOT NULL,
	`title` text,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`error` text,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`uploaded_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_documents_status" CHECK("documents"."status" in ('pending', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_documents_business_created` ON `documents` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_documents_business_status` ON `documents` (`business_id`,`status`);--> statement-breakpoint
CREATE TABLE `kb_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` text NOT NULL,
	`char_count` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_kb_chunks_business` ON `kb_chunks` (`business_id`);--> statement-breakpoint
CREATE INDEX `idx_kb_chunks_document` ON `kb_chunks` (`document_id`);