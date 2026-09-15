CREATE TABLE `assistant_threads` (
	`workspace_key` text PRIMARY KEY NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
