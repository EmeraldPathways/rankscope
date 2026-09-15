CREATE TABLE `workspace_snapshots` (
	`workspace_key` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
