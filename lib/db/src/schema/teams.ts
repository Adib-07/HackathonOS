import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { competitionsTable } from "./competitions";

export const MEMBER_ROLES = [
  "owner",
  "lead",
  "backend",
  "frontend",
  "designer",
  "pitch",
  "member",
] as const;

export const MEMBER_STATUS = ["invited", "active", "removed"] as const;

export const INVITE_ROLES = [
  "lead",
  "backend",
  "frontend",
  "designer",
  "pitch",
  "member",
] as const;

export const SHARE_SCOPES = ["read_only_plan", "my_tasks"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
export type MemberStatus = (typeof MEMBER_STATUS)[number];
export type InviteRole = (typeof INVITE_ROLES)[number];
export type ShareScope = (typeof SHARE_SCOPES)[number];

export const competitionMembersTable = pgTable(
  "competition_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id"), // nullable until invite accepted
    invitedEmail: text("invited_email"), // nullable, for pending invites
    role: text("role", { enum: MEMBER_ROLES }).notNull(),
    status: text("status", { enum: MEMBER_STATUS }).notNull().default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("competition_members_competition_user_unique").on(
      table.competitionId,
      table.userId,
    ),
    index("competition_members_competition_idx").on(table.competitionId),
    index("competition_members_user_idx").on(table.userId),
    index("competition_members_email_idx").on(table.invitedEmail),
  ],
);

export const competitionInvitesTable = pgTable(
  "competition_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(), // SHA-256 hash only
    role: text("role", { enum: INVITE_ROLES }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses").notNull().default(1),
    uses: integer("uses").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("competition_invites_competition_idx").on(table.competitionId),
    index("competition_invites_token_hash_idx").on(table.tokenHash),
  ],
);

export const shareLinksTable = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(), // SHA-256 hash only
    scope: text("scope", { enum: SHARE_SCOPES }).notNull(),
    memberId: uuid("member_id").references(() => competitionMembersTable.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("share_links_competition_idx").on(table.competitionId),
    index("share_links_token_hash_idx").on(table.tokenHash),
    index("share_links_member_idx").on(table.memberId),
  ],
);

export const insertCompetitionMemberSchema = createInsertSchema(
  competitionMembersTable,
).omit({ id: true, createdAt: true });

export const insertCompetitionInviteSchema = createInsertSchema(
  competitionInvitesTable,
).omit({ id: true, createdAt: true, uses: true });

export const insertShareLinkSchema = createInsertSchema(shareLinksTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCompetitionMember = z.infer<typeof insertCompetitionMemberSchema>;
export type CompetitionMemberRecord = typeof competitionMembersTable.$inferSelect;
export type InsertCompetitionInvite = z.infer<typeof insertCompetitionInviteSchema>;
export type CompetitionInviteRecord = typeof competitionInvitesTable.$inferSelect;
export type InsertShareLink = z.infer<typeof insertShareLinkSchema>;
export type ShareLinkRecord = typeof shareLinksTable.$inferSelect;