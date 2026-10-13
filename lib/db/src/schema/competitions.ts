import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const competitionsTable = pgTable(
  "competitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    organizer: text("organizer"),
    competitionType: text("competition_type").notNull().default("unknown"),
    startAt: timestamp("start_at", { withTimezone: true }),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    teamSize: integer("team_size").notNull().default(1),
    trackMode: text("track_mode").notNull().default("choose"),
    currentTrack: text("current_track"),
    problemStatement: text("problem_statement"),
    officialUrl: text("official_url"),
    rulesUrl: text("rules_url"),
    mandatoryDeliverables: text("mandatory_deliverables")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    teamSkills: text("team_skills")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    ideaComplexity: integer("idea_complexity").notNull().default(3),
    status: text("status").notNull().default("preparing"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("competitions_owner_deadline_idx").on(table.ownerId, table.deadline)],
);

export const insertCompetitionSchema = createInsertSchema(competitionsTable).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompetition = z.infer<typeof insertCompetitionSchema>;
export type Competition = typeof competitionsTable.$inferSelect;
