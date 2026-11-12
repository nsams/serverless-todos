CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`source` text,
	`changes` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `history_entity_idx` ON `history` (`entity_type`,`entity_id`);--> statement-breakpoint
-- Hand-written data migration: existing todos get a "created" entry (at their creation time; initial values and source unknown)
INSERT INTO `history` (`user_id`, `entity_type`, `entity_id`, `action`, `source`, `changes`, `created_at`)
SELECT `user_id`, 'todo', `id`, 'created', NULL, '{}', `created_at` FROM `todos` ORDER BY `created_at`;
