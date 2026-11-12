CREATE TABLE `todo_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`todo_id` text NOT NULL,
	`action` text NOT NULL,
	`source` text,
	`changes` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todo_history_todo_id_idx` ON `todo_history` (`todo_id`);--> statement-breakpoint
-- Hand-written data migration: existing todos get a "created" entry (at their creation time; initial values and source unknown)
INSERT INTO `todo_history` (`user_id`, `todo_id`, `action`, `source`, `changes`, `created_at`)
SELECT `user_id`, `id`, 'created', NULL, '{}', `created_at` FROM `todos` ORDER BY `created_at`;
