CREATE TABLE `chat_messages` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`position` integer NOT NULL,
	`message` text NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `chat_messages_user_id_position_idx` ON `chat_messages` (`user_id`,`position`);