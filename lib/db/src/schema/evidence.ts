import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { competitionsTable } from "./competitions";
import { workflowTasksTable } from "./workflow-plans";

/**
 * Verification evidence.
 *
 * Evidence records what was actually observed, and is the only thing that can
 * support a `VERIFIED` task state. A task that the owner merely marked `done`
 * is `DONE`, not `VERIFIED`; verification additionally requires evidence that
 * satisfies the task's own verification requirement.
 *
 * Design notes:
 *   - `source` is always `manual` for client-submitted evidence. There is no
 *     machine runner in this codebase, so the server refuses to let a client
 *     claim that a command ran on its own. The column exists so a real
 *     automated collector can be added later without changing the contract.
 *   - `phaseSnapshot` and `verificationMethodSnapshot` capture the task's
 *     requirement at the moment the evidence was recorded. If the requirement
 *     later changes, the older evidence is reported as stale and can no longer
 *     verify the task.
 *   - `taskId` is nullable and set to NULL when the task row is removed (for
 *     example when a plan is recalculated). `taskKey` is the stable identity
 *     that verification groups by, so evidence survives plan recalculation.
 */
export const workflowEvidenceTable = pgTable(
  "workflow_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    /** The task row this evidence was recorded against, if it still exists. */
    taskId: uuid("task_id").references(() => workflowTasksTable.id, {
      onDelete: "set null",
    }),
    /** Stable task identity within the competition, e.g. "build-product". */
    taskKey: text("task_key").notNull(),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    sourceUrl: text("source_url"),
    commandName: text("command_name"),
    /** "passed" or "failed". */
    result: text("result").notNull(),
    /** When the check was actually observed. */
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    reviewerNote: text("reviewer_note"),
    /** Always "manual" today. See the design note above. */
    source: text("source").notNull().default("manual"),
    phaseSnapshot: text("phase_snapshot").notNull(),
    verificationMethodSnapshot: text("verification_method_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("workflow_evidence_competition_task_idx").on(
      table.competitionId,
      table.taskKey,
    ),
    index("workflow_evidence_competition_idx").on(table.competitionId),
  ],
);

export const insertWorkflowEvidenceSchema = createInsertSchema(
  workflowEvidenceTable,
).omit({
  id: true,
  source: true,
  phaseSnapshot: true,
  verificationMethodSnapshot: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWorkflowEvidence = z.infer<
  typeof insertWorkflowEvidenceSchema
>;
export type WorkflowEvidenceRecord = typeof workflowEvidenceTable.$inferSelect;
