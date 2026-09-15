CREATE TABLE `google_connections` (
	`workspace_key` text PRIMARY KEY NOT NULL,
	`refresh_token_ciphertext` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
