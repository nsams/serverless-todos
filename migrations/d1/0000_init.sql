create table `todos` (`id` text not null primary key, `user_id` text not null, `title` text not null, `done` integer not null default false, `created_at` datetime not null);
