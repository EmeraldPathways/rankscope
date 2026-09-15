import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaceSnapshots = sqliteTable("workspace_snapshots", {
  workspaceKey: text("workspace_key").primaryKey(),
  domain: text("domain").notNull(),
  payload: text("payload").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const assistantThreads = sqliteTable("assistant_threads", {
  workspaceKey: text("workspace_key").primaryKey(),
  messages: text("messages").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const googleConnections = sqliteTable("google_connections", {
  workspaceKey: text("workspace_key").primaryKey(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  scopes: text("scopes").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
