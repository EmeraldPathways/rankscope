import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaceSnapshots = sqliteTable("workspace_snapshots", {
  workspaceKey: text("workspace_key").primaryKey(),
  domain: text("domain").notNull(),
  payload: text("payload").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
