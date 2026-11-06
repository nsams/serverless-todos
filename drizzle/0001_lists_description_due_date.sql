CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lists_user_id_idx` ON `lists` (`user_id`);--> statement-breakpoint
-- Hand-written data migration: existing todos are moved into a list "Todos" per user
INSERT INTO `lists` (`id`, `user_id`, `name`, `created_at`)
SELECT lower(hex(randomblob(16))), `user_id`, 'Todos', min(`created_at`) FROM `todos` GROUP BY `user_id`;
--> statement-breakpoint
-- SQLite can't add a NOT NULL foreign key column without a default, so the table is rebuilt (nothing references todos)
CREATE TABLE `__new_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`due_date` text,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_todos` (`id`, `user_id`, `list_id`, `title`, `done`, `created_at`)
SELECT `todos`.`id`, `todos`.`user_id`, `lists`.`id`, `todos`.`title`, `todos`.`done`, `todos`.`created_at`
FROM `todos` JOIN `lists` ON `lists`.`user_id` = `todos`.`user_id`;
--> statement-breakpoint
DROP TABLE `todos`;--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;--> statement-breakpoint
CREATE INDEX `todos_list_id_idx` ON `todos` (`list_id`);
