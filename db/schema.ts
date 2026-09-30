import { sqliteTable, text, integer, primaryKey, check, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(), createdAt: text("created_at").notNull(),
  ownerId: text("owner_id"),
}, (t) => [index("plans_owner_idx").on(t.ownerId)]);

export const authUser = sqliteTable("auth_user", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  email: text("email").notNull().unique(), emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const authSession = sqliteTable("auth_session", {
  id: text("id").primaryKey(), token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
}, (t) => [index("auth_session_user_idx").on(t.userId)]);
export const authAccount = sqliteTable("auth_account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => authUser.id, { onDelete: "cascade" }),
  password: text("password"), accessToken: text("access_token"), refreshToken: text("refresh_token"),
  idToken: text("id_token"), scope: text("scope"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("auth_account_user_idx").on(t.userId)]);
export const authVerification = sqliteTable("auth_verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("auth_verification_identifier_idx").on(t.identifier)]);
export const planVersions = sqliteTable("plan_versions", {
  planId: text("plan_id").notNull().references(() => plans.id),
  version: integer("version").notNull(), title: text("title").notNull(),
  startDate: text("start_date").notNull(), endDate: text("end_date").notNull(),
  priority: text("priority", { enum: ["high", "normal", "low"] }).notNull(),
  successCriteria: text("success_criteria").notNull(),
  expectedMinutes: integer("expected_minutes").notNull(), savedAt: text("saved_at").notNull(),
}, (t) => [
  primaryKey({ columns: [t.planId, t.version] }),
  check("positive_version", sql`${t.version} > 0`),
  check("valid_minutes", sql`${t.expectedMinutes} BETWEEN 1 AND 100000`),
  check("valid_priority", sql`${t.priority} IN ('high', 'normal', 'low')`),
  check("valid_period", sql`${t.endDate} >= ${t.startDate}`),
]);

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => plans.id),
  title: text("title").notNull(),
  dueDate: text("due_date"),
  priority: text("priority", { enum: ["high", "normal", "low"] }).notNull(),
  tags: text("tags").notNull().default("[]"),
  expectedMinutes: integer("expected_minutes").notNull(),
  completedAt: text("completed_at"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
}, (t) => [
  index("tasks_plan_idx").on(t.planId),
  check("task_positive_version", sql`${t.version} > 0`),
  check("task_valid_minutes", sql`${t.expectedMinutes} BETWEEN 1 AND 100000`),
  check("task_valid_priority", sql`${t.priority} IN ('high', 'normal', 'low')`),
]);

export const studyLogs = sqliteTable("study_logs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at").notNull(),
  actualMinutes: integer("actual_minutes").notNull(),
  studiedContent: text("studied_content").notNull(),
  blockerReason: text("blocker_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  version: integer("version").notNull().default(1),
}, (t) => [
  index("study_logs_task_idx").on(t.taskId),
  check("study_log_valid_minutes", sql`${t.actualMinutes} BETWEEN 1 AND 100000`),
  check("study_log_valid_period", sql`${t.endedAt} >= ${t.startedAt}`),
  check("study_log_positive_version", sql`${t.version} > 0`),
]);

export const planReviews = sqliteTable("plan_reviews", {
  planId: text("plan_id").primaryKey().references(() => plans.id),
  nextPlanId: text("next_plan_id").notNull().references(() => plans.id),
  improvement: text("improvement").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
}, (t) => [
  index("plan_reviews_next_plan_idx").on(t.nextPlanId),
  check("plan_review_positive_version", sql`${t.version} > 0`),
  check("plan_review_distinct_plans", sql`${t.planId} <> ${t.nextPlanId}`),
]);
