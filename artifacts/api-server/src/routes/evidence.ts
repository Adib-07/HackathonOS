import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateEvidenceBody,
  CreateEvidenceParams,
  ListEvidenceParams,
  ListEvidenceResponse,
  CreateEvidenceResponse,
  DeleteEvidenceParams,
  DeleteEvidenceResponse,
} from "@workspace/api-zod";
import {
  competitionsTable,
  db,
  workflowEvidenceTable,
  workflowTasksTable,
} from "@workspace/db";
import { EVIDENCE_TYPES } from "../lib/verification";

const router: IRouter = Router();

/**
 * Evidence is always recorded as manual provenance. Nothing in this codebase
 * runs a user's commands on their behalf, so a client can never claim that a
 * check was executed by a machine. The `source` column exists so a real
 * collector can be introduced later without changing the API contract.
 */
const EVIDENCE_SOURCE = "manual";

/** Reject values that look like credentials before they reach the database. */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk_(live|test)_[A-Za-z0-9]{10,}/i,
  /\bpk_(live|test)_[A-Za-z0-9]{10,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
];

function containsSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Look up a task that belongs to the authenticated owner.
 *
 * Returns undefined for tasks owned by somebody else, so the API answers 404
 * rather than revealing that another owner's task exists.
 */
async function findOwnedTask(competitionId: string, taskId: string, ownerId: string) {
  const [row] = await db
    .select({ task: workflowTasksTable })
    .from(workflowTasksTable)
    .innerJoin(
      competitionsTable,
      eq(workflowTasksTable.competitionId, competitionsTable.id),
    )
    .where(
      and(
        eq(workflowTasksTable.id, taskId),
        eq(workflowTasksTable.competitionId, competitionId),
        eq(competitionsTable.ownerId, ownerId),
      ),
    )
    .limit(1);

  return row?.task;
}

router.get(
  "/competitions/:competitionId/evidence",
  async (req, res): Promise<void> => {
    const params = ListEvidenceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition id." });
      return;
    }

    const ownerId = res.locals.userId as string;

    // Confirm the competition belongs to the caller before reading anything.
    const [ownedCompetition] = await db
      .select({ id: competitionsTable.id })
      .from(competitionsTable)
      .where(
        and(
          eq(competitionsTable.id, params.data.competitionId),
          eq(competitionsTable.ownerId, ownerId),
        ),
      )
      .limit(1);

    if (!ownedCompetition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const records = await db
      .select()
      .from(workflowEvidenceTable)
      .where(
        eq(workflowEvidenceTable.competitionId, params.data.competitionId),
      )
      .orderBy(desc(workflowEvidenceTable.observedAt));

    res.json(ListEvidenceResponse.parse(records));
  },
);

router.post(
  "/competitions/:competitionId/tasks/:taskId/evidence",
  async (req, res): Promise<void> => {
    const params = CreateEvidenceParams.safeParse(req.params);
    const parsed = CreateEvidenceBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid evidence." });
      return;
    }

    const data = parsed.data;

    if (!EVIDENCE_TYPES.includes(data.type)) {
      res.status(400).json({ error: "Unsupported evidence type." });
      return;
    }

    // Never persist something that looks like a credential.
    if (
      containsSecret(data.summary) ||
      containsSecret(data.commandName) ||
      containsSecret(data.sourceUrl) ||
      containsSecret(data.reviewerNote)
    ) {
      res.status(400).json({
        error:
          "Evidence must not contain credentials, tokens, or private keys.",
      });
      return;
    }

    const ownerId = res.locals.userId as string;
    const task = await findOwnedTask(
      params.data.competitionId,
      params.data.taskId,
      ownerId,
    );

    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    const observedAt = data.observedAt ? new Date(data.observedAt) : new Date();
    if (Number.isNaN(observedAt.getTime())) {
      res.status(400).json({ error: "Invalid observation time." });
      return;
    }

    // Evidence cannot be observed in the future.
    if (observedAt.getTime() > Date.now() + 60_000) {
      res.status(400).json({ error: "Observation time cannot be in the future." });
      return;
    }

    const [created] = await db
      .insert(workflowEvidenceTable)
      .values({
        competitionId: task.competitionId,
        taskId: task.id,
        taskKey: task.taskKey,
        type: data.type,
        summary: data.summary.trim(),
        sourceUrl: data.sourceUrl?.trim() || null,
        commandName: data.commandName?.trim() || null,
        result: data.result,
        observedAt,
        reviewerNote: data.reviewerNote?.trim() || null,
        source: EVIDENCE_SOURCE,
        phaseSnapshot: task.phase,
        verificationMethodSnapshot: task.verificationMethod,
      })
      .returning();

    res.status(201).json(CreateEvidenceResponse.parse(created));
  },
);

router.delete(
  "/competitions/:competitionId/evidence/:evidenceId",
  async (req, res): Promise<void> => {
    const params = DeleteEvidenceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid evidence id." });
      return;
    }

    const ownerId = res.locals.userId as string;

    // Ownership is checked before the delete, joined through the competition
    // so another owner's evidence is never touched and is reported as 404
    // rather than 403.
    const [ownedEvidence] = await db
      .select({ evidence: workflowEvidenceTable })
      .from(workflowEvidenceTable)
      .innerJoin(
        competitionsTable,
        eq(workflowEvidenceTable.competitionId, competitionsTable.id),
      )
      .where(
        and(
          eq(workflowEvidenceTable.id, params.data.evidenceId),
          eq(
            workflowEvidenceTable.competitionId,
            params.data.competitionId,
          ),
          eq(competitionsTable.ownerId, ownerId),
        ),
      )
      .limit(1);

    if (!ownedEvidence) {
      res.status(404).json({ error: "Evidence not found." });
      return;
    }

    await db
      .delete(workflowEvidenceTable)
      .where(eq(workflowEvidenceTable.id, ownedEvidence.evidence.id));

    res.json(
      DeleteEvidenceResponse.parse({
        id: ownedEvidence.evidence.id,
        deleted: true,
      }),
    );
  },
);

export default router;
