import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { createHash, randomBytes } from "crypto";
import { z } from "zod/v4";
import {
  CreateCompetitionBody,
  CreateCompetitionResponse,
  GeneratePlanBody,
  GeneratePlanParams,
  GeneratePlanResponse,
  GetCompetitionParams,
  GetCompetitionResponse,
  GetOverviewResponse,
  GetPlanParams,
  GetPlanResponse,
  ListCompetitionsResponse,
  ListPlanVersionsParams,
  ListPlanVersionsResponse,
  UpdateCompetitionBody,
  UpdateCompetitionParams,
  UpdateCompetitionResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import {
  competitionInvitesTable,
  competitionMembersTable,
  competitionsTable,
  db,
  shareLinksTable,
  workflowEvidenceTable,
  workflowPlansTable,
  workflowTasksTable,
  type Competition as DbCompetition,
  type CompetitionMemberRecord,
  type WorkflowEvidenceRecord,
  type WorkflowPlanRecord,
  type WorkflowTaskRecord,
} from "@workspace/db";
import { createPlanDraft, serializeTask } from "../lib/planner";
import {
  evaluateTaskVerification,
  type EvidenceResult,
  type EvidenceSource,
  type EvidenceType,
  type TaskStatus,
} from "../lib/verification";
import {
  requireMember,
  requireOwner,
  requireLead,
  loadCompetitionMembership,
  createInviteSchema,
  createShareLinkSchema,
  updateMemberRoleSchema,
  acceptInviteSchema,
  assignTaskSchema,
  bulkAssignTasksSchema,
} from "../middlewares/competitionAuth";

const router: IRouter = Router();

// Middleware that only loads membership when competitionId param exists
const conditionalLoadMembership: RequestHandler = async (req, res, next) => {
  if (!req.params.competitionId) {
    return next();
  }
  return loadCompetitionMembership(req, res, next);
};

// Apply conditional membership loading to all competition routes
router.use(conditionalLoadMembership);

function serializeCompetition(competition: DbCompetition) {
  return {
    ...competition,
    startAt: competition.startAt?.toISOString() ?? null,
    deadline: competition.deadline.toISOString(),
    createdAt: competition.createdAt.toISOString(),
    updatedAt: competition.updatedAt.toISOString(),
  };
}

function serializeMember(member: CompetitionMemberRecord) {
  return {
    id: member.id,
    competitionId: member.competitionId,
    userId: member.userId,
    invitedEmail: member.invitedEmail,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
  };
}

function serializePlanSummary(
  plan: WorkflowPlanRecord,
  tasks: WorkflowTaskRecord[],
) {
  return {
    id: plan.id,
    competitionId: plan.competitionId,
    version: plan.version,
    generatedAt: plan.generatedAt.toISOString(),
    deadline: plan.deadline.toISOString(),
    availableMinutes: plan.availableMinutes,
    bufferMinutes: plan.bufferMinutes,
    status: plan.status,
    warnings: plan.warnings,
    trigger: plan.trigger,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.status === "done").length,
  };
}

function serializePlan(
  plan: WorkflowPlanRecord,
  tasks: WorkflowTaskRecord[],
  evidence: WorkflowEvidenceRecord[] = [],
) {
  const verificationByTaskKey = new Map(
    tasks.map((task) => [
      task.taskKey,
      evaluateTaskVerification(
        {
          id: task.id,
          taskKey: task.taskKey,
          phase: task.phase,
          status: task.status as TaskStatus,
          verificationMethod: task.verificationMethod,
        },
        evidence.map((record) => ({
          id: record.id,
          taskKey: record.taskKey,
          type: record.type as EvidenceType,
          result: record.result as EvidenceResult,
          observedAt: record.observedAt,
          verificationMethodSnapshot: record.verificationMethodSnapshot,
          source: record.source as EvidenceSource,
        })),
      ),
    ]),
  );

  return GetPlanResponse.parse({
    ...serializePlanSummary(plan, tasks),
    tasks: tasks.map((task) =>
      serializeTask(
        task,
        plan.id,
        verificationByTaskKey.get(task.taskKey)!,
      ),
    ),
  });
}

/** Load evidence for a competition (member-scoped) */
async function loadMemberEvidence(
  competitionId: string,
  userId: string,
): Promise<WorkflowEvidenceRecord[]> {
  // For now, load all evidence for the competition
  // In the future, this could be scoped to member's tasks
  return db
    .select()
    .from(workflowEvidenceTable)
    .where(eq(workflowEvidenceTable.competitionId, competitionId));
}

/** Find competition by ID (no owner check - membership middleware handles access) */
async function findCompetitionById(
  competitionId: string,
): Promise<DbCompetition | undefined> {
  const [competition] = await db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.id, competitionId))
    .limit(1);

  return competition;
}

// ============================================================
// OVERVIEW - Shows competitions where user is a member
// ============================================================
router.get("/overview", async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;

  // Get competitions where user is an active member
  const memberships = await db
    .select({ competition: competitionsTable })
    .from(competitionMembersTable)
    .innerJoin(
      competitionsTable,
      eq(competitionMembersTable.competitionId, competitionsTable.id),
    )
    .where(
      and(
        eq(competitionMembersTable.userId, userId),
        eq(competitionMembersTable.status, "active"),
      ),
    )
    .orderBy(competitionsTable.deadline);

  const competitions = memberships.map((m) => m.competition);
  const currentCompetition =
    competitions.find(
      (c) => c.status === "preparing" || c.status === "active",
    ) ?? null;

  let currentPlan = null;
  let currentTasks: WorkflowTaskRecord[] = [];
  let currentEvidence: WorkflowEvidenceRecord[] = [];

  if (currentCompetition) {
    const [latestPlan] = await db
      .select()
      .from(workflowPlansTable)
      .where(eq(workflowPlansTable.competitionId, currentCompetition.id))
      .orderBy(desc(workflowPlansTable.version))
      .limit(1);

    if (latestPlan) {
      currentTasks = await db
        .select()
        .from(workflowTasksTable)
        .where(eq(workflowTasksTable.planId, latestPlan.id))
        .orderBy(workflowTasksTable.plannedStartAt);
      currentEvidence = await loadMemberEvidence(currentCompetition.id, userId);
      currentPlan = serializePlan(latestPlan, currentTasks, currentEvidence);
    }
  }

  const nextAction =
    currentTasks.find(
      (task) =>
        task.status === "in_progress" ||
        task.status === "todo" ||
        task.status === "blocked",
    ) ?? null;

  const nextActionVerification = nextAction
    ? evaluateTaskVerification(
        {
          id: nextAction.id,
          taskKey: nextAction.taskKey,
          phase: nextAction.phase,
          status: nextAction.status as TaskStatus,
          verificationMethod: nextAction.verificationMethod,
        },
        currentEvidence.map((record) => ({
          id: record.id,
          taskKey: record.taskKey,
          type: record.type as EvidenceType,
          result: record.result as EvidenceResult,
          observedAt: record.observedAt,
          verificationMethodSnapshot: record.verificationMethodSnapshot,
          source: record.source as EvidenceSource,
        })),
      )
    : undefined;

  res.json(
    GetOverviewResponse.parse({
      currentCompetition: currentCompetition
        ? serializeCompetition(currentCompetition)
        : null,
      currentPlan,
      competitionCount: competitions.length,
      openTaskCount: currentTasks.filter(
        (task) => task.status !== "done" && task.status !== "deferred",
      ).length,
      completedTaskCount: currentTasks.filter(
        (task) => task.status === "done",
      ).length,
      nextAction: nextAction
        ? serializeTask(
            nextAction,
            nextAction.planId,
            nextActionVerification!,
          )
        : null,
      quality: {
        applicationBuild: "not_run",
        automatedTests: "not_run",
        browserVerification: "not_run",
        securityReview: "not_run",
        deployment: "not_run",
        demoReadiness: "not_run",
        submissionReadiness: "not_run",
      },
    }),
  );
});

// ============================================================
// LIST COMPETITIONS - Where user is a member
// ============================================================
router.get("/competitions", async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;

  const memberships = await db
    .select({ competition: competitionsTable })
    .from(competitionMembersTable)
    .innerJoin(
      competitionsTable,
      eq(competitionMembersTable.competitionId, competitionsTable.id),
    )
    .where(
      and(
        eq(competitionMembersTable.userId, userId),
        eq(competitionMembersTable.status, "active"),
      ),
    )
    .orderBy(competitionsTable.deadline);

  res.json(
    ListCompetitionsResponse.parse(memberships.map((m) => serializeCompetition(m.competition))),
  );
});

// ============================================================
// CREATE COMPETITION - Creates competition + owner membership
// ============================================================
router.post("/competitions", async (req, res): Promise<void> => {
  const parsed = CreateCompetitionBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      { errors: parsed.error.issues.map((issue) => issue.message) },
      "Invalid competition input",
    );
    const errorMessage = parsed.error.issues[0]?.message || "Invalid competition details.";
    res.status(400).json({ error: errorMessage });
    return;
  }

  const data = parsed.data;
  const trimmedName = data.name.trim();
  if (!trimmedName) {
    res.status(400).json({ error: "Competition name cannot be empty." });
    return;
  }

  const userId = res.locals.userId as string;

  const result = await db.transaction(async (tx) => {
    const [competition] = await tx
      .insert(competitionsTable)
      .values({
        ownerId: userId,
        name: trimmedName,
        organizer: data.organizer?.trim() || null,
        competitionType: data.competitionType ?? "unknown",
        startAt: data.startAt ? new Date(data.startAt) : null,
        deadline: new Date(data.deadline),
        teamSize: data.teamSize ?? 1,
        trackMode: data.trackMode ?? "choose",
        currentTrack: data.currentTrack?.trim() || null,
        problemStatement: data.problemStatement?.trim() || null,
        officialUrl: data.officialUrl?.trim() || null,
        rulesUrl: data.rulesUrl?.trim() || null,
        mandatoryDeliverables: data.mandatoryDeliverables ?? [],
        teamSkills: data.teamSkills ?? [],
        ideaComplexity: data.ideaComplexity ?? 3,
        status: data.status ?? "preparing",
      })
      .returning();

    // Create owner membership
    await tx.insert(competitionMembersTable).values({
      competitionId: competition!.id,
      userId,
      role: "owner",
      status: "active",
    });

    return competition!;
  });

  res
    .status(201)
    .json(CreateCompetitionResponse.parse(serializeCompetition(result)));
});

// ============================================================
// GET COMPETITION - Requires membership
// ============================================================
router.get(
  "/competitions/:competitionId",
  requireMember,
  async (req, res): Promise<void> => {
    const params = GetCompetitionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }

    const competition = await findCompetitionById(params.data.competitionId);

    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    res.json(GetCompetitionResponse.parse(serializeCompetition(competition)));
  },
);

// ============================================================
// UPDATE COMPETITION - Requires owner
// ============================================================
router.patch(
  "/competitions/:competitionId",
  requireOwner,
  async (req, res): Promise<void> => {
    const params = UpdateCompetitionParams.safeParse(req.params);
    const parsed = UpdateCompetitionBody.safeParse(req.body);

    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid competition update." });
      return;
    }

    const competition = await findCompetitionById(params.data.competitionId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const data = parsed.data;
    const updates: Partial<typeof competitionsTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updates.name = data.name;
    if (data.organizer !== undefined) updates.organizer = data.organizer;
    if (data.competitionType !== undefined) {
      updates.competitionType = data.competitionType;
    }
    if (data.startAt !== undefined) {
      updates.startAt = data.startAt ? new Date(data.startAt) : null;
    }
    if (data.deadline !== undefined) updates.deadline = new Date(data.deadline);
    if (data.teamSize !== undefined) updates.teamSize = data.teamSize;
    if (data.trackMode !== undefined) updates.trackMode = data.trackMode;
    if (data.currentTrack !== undefined) {
      updates.currentTrack = data.currentTrack;
    }
    if (data.problemStatement !== undefined) {
      updates.problemStatement = data.problemStatement;
    }
    if (data.officialUrl !== undefined) updates.officialUrl = data.officialUrl;
    if (data.rulesUrl !== undefined) updates.rulesUrl = data.rulesUrl;
    if (data.mandatoryDeliverables !== undefined) {
      updates.mandatoryDeliverables = data.mandatoryDeliverables;
    }
    if (data.teamSkills !== undefined) updates.teamSkills = data.teamSkills;
    if (data.ideaComplexity !== undefined) {
      updates.ideaComplexity = data.ideaComplexity;
    }
    if (data.status !== undefined) updates.status = data.status;

    const [updated] = await db
      .update(competitionsTable)
      .set(updates)
      .where(eq(competitionsTable.id, params.data.competitionId))
      .returning();

    res.json(UpdateCompetitionResponse.parse(serializeCompetition(updated!)));
  },
);

// ============================================================
// LIST PLAN VERSIONS - Requires membership
// ============================================================
router.get(
  "/competitions/:competitionId/plans",
  requireMember,
  async (req, res): Promise<void> => {
    const params = ListPlanVersionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }

    const competition = await findCompetitionById(params.data.competitionId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const plans = await db
      .select()
      .from(workflowPlansTable)
      .where(eq(workflowPlansTable.competitionId, competition.id))
      .orderBy(desc(workflowPlansTable.version));

    const tasks =
      plans.length > 0
        ? await db
            .select()
            .from(workflowTasksTable)
            .where(
              inArray(
                workflowTasksTable.planId,
                plans.map((plan) => plan.id),
              ),
            )
        : [];

    const tasksByPlan = new Map<string, WorkflowTaskRecord[]>();

    for (const task of tasks) {
      const planTasks = tasksByPlan.get(task.planId) ?? [];
      planTasks.push(task);
      tasksByPlan.set(task.planId, planTasks);
    }

    res.json(
      ListPlanVersionsResponse.parse(
        plans.map((plan) =>
          serializePlanSummary(plan, tasksByPlan.get(plan.id) ?? []),
        ),
      ),
    );
  },
);

// ============================================================
// GENERATE PLAN - Requires lead/owner
// ============================================================
router.post(
  "/competitions/:competitionId/plans",
  requireLead,
  async (req, res): Promise<void> => {
    const params = GeneratePlanParams.safeParse(req.params);
    const parsed = GeneratePlanBody.safeParse(req.body);

    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid plan request." });
      return;
    }

    const competition = await findCompetitionById(params.data.competitionId);
    if (!competition) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const now = new Date();
    const minutesUntilDeadline = Math.floor(
      (competition.deadline.getTime() - now.getTime()) / 60_000,
    );
    if (minutesUntilDeadline < 1) {
      res.status(400).json({
        error: "The competition deadline has passed. Update it before planning.",
      });
      return;
    }

    const requestedMinutes =
      parsed.data.remainingHours === undefined
        ? minutesUntilDeadline
        : Math.floor(parsed.data.remainingHours * 60);
    const availableMinutes = Math.min(
      requestedMinutes,
      minutesUntilDeadline,
    );

    const result = await db.transaction(async (tx) => {
      const [latestPlan] = await tx
        .select()
        .from(workflowPlansTable)
        .where(eq(workflowPlansTable.competitionId, competition.id))
        .orderBy(desc(workflowPlansTable.version))
        .limit(1);

      const previousTasks = latestPlan
        ? await tx
            .select()
            .from(workflowTasksTable)
            .where(eq(workflowTasksTable.planId, latestPlan.id))
        : [];

      const draft = createPlanDraft({
        competition,
        now,
        availableMinutes,
        previousTasks,
      });

      const [plan] = await tx
        .insert(workflowPlansTable)
        .values({
          competitionId: competition.id,
          version: (latestPlan?.version ?? 0) + 1,
          generatedAt: now,
          deadline: competition.deadline,
          availableMinutes,
          bufferMinutes: draft.bufferMinutes,
          status: draft.status,
          warnings: draft.warnings,
          trigger: parsed.data.trigger,
        })
        .returning();

      const tasks = await tx
        .insert(workflowTasksTable)
        .values(
          draft.tasks.map((task) => ({
            competitionId: competition.id,
            planId: plan!.id,
            taskKey: task.taskKey,
            title: task.title,
            description: task.description,
            phase: task.phase,
            priority: task.priority,
            estimatedMinutes: task.estimatedMinutes,
            plannedStartAt: task.plannedStartAt,
            plannedEndAt: task.plannedEndAt,
            dependencies: task.dependencies,
            owner: task.owner,
            status: task.status,
            acceptanceCriteria: task.acceptanceCriteria,
            expectedArtifact: task.expectedArtifact,
            verificationMethod: task.verificationMethod,
            riskIfSkipped: task.riskIfSkipped,
            mandatory: task.mandatory,
            // assigneeMemberId and blockedReason will be null initially
          })),
        )
        .returning();

      return { plan: plan!, tasks };
    });

    const userId = res.locals.userId as string;
    const evidence = await loadMemberEvidence(
      params.data.competitionId,
      userId,
    );

    res
      .status(201)
      .json(
        GeneratePlanResponse.parse(
          serializePlan(result.plan, result.tasks, evidence),
        ),
      );
  },
);

// ============================================================
// GET PLAN - Requires membership
// ============================================================
router.get(
  "/competitions/:competitionId/plans/:planId",
  requireMember,
  async (req, res): Promise<void> => {
    const params = GetPlanParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid plan request." });
      return;
    }

    const competition = await findCompetitionById(params.data.competitionId);
    if (!competition) {
      res.status(404).json({ error: "Plan not found." });
      return;
    }

    const [plan] = await db
      .select()
      .from(workflowPlansTable)
      .where(
        and(
          eq(workflowPlansTable.id, params.data.planId),
          eq(workflowPlansTable.competitionId, competition.id),
        ),
      )
      .limit(1);

    if (!plan) {
      res.status(404).json({ error: "Plan not found." });
      return;
    }

    const tasks = await db
      .select()
      .from(workflowTasksTable)
      .where(eq(workflowTasksTable.planId, plan.id))
      .orderBy(workflowTasksTable.plannedStartAt);

    const userId = res.locals.userId as string;
    const evidence = await loadMemberEvidence(
      params.data.competitionId,
      userId,
    );

    res.json(GetPlanResponse.parse(serializePlan(plan, tasks, evidence)));
  },
);

// ============================================================
// UPDATE TASK - Requires membership (assignee or lead/owner)
// ============================================================
router.patch(
  "/competitions/:competitionId/tasks/:taskId",
  requireMember,
  async (req, res): Promise<void> => {
    const params = UpdateTaskParams.safeParse(req.params);
    const parsed = UpdateTaskBody.safeParse(req.body);

    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid task update." });
      return;
    }

    const userId = res.locals.userId as string;
    const membership = res.locals.membership as CompetitionMemberRecord;

    const [latestPlan] = await db
      .select()
      .from(workflowPlansTable)
      .where(
        eq(
          workflowPlansTable.competitionId,
          params.data.competitionId,
        ),
      )
      .orderBy(desc(workflowPlansTable.version))
      .limit(1);

    if (!latestPlan) {
      res.status(404).json({ error: "Current plan not found." });
      return;
    }

    const [task] = await db
      .select()
      .from(workflowTasksTable)
      .where(
        and(
          eq(workflowTasksTable.id, params.data.taskId),
          eq(workflowTasksTable.competitionId, params.data.competitionId),
          eq(workflowTasksTable.planId, latestPlan.id),
        ),
      )
      .limit(1);

    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    // Check if user can update this task:
    // - Owner/lead can update any task
    // - Assignee can update their assigned task
    const isOwnerOrLead = ["owner", "lead"].includes(membership.role);
    const isAssignee = task.assigneeMemberId === membership.id;

    if (!isOwnerOrLead && !isAssignee) {
      res.status(403).json({ error: "Not authorized to update this task." });
      return;
    }

    const [updated] = await db
      .update(workflowTasksTable)
      .set({ status: parsed.data.status })
      .where(eq(workflowTasksTable.id, task.id))
      .returning();

    const evidence = await loadMemberEvidence(
      params.data.competitionId,
      userId,
    );

    const verification = evaluateTaskVerification(
      {
        id: updated!.id,
        taskKey: updated!.taskKey,
        phase: updated!.phase,
        status: updated!.status as TaskStatus,
        verificationMethod: updated!.verificationMethod,
      },
      evidence.map((record) => ({
        id: record.id,
        taskKey: record.taskKey,
        type: record.type as EvidenceType,
        result: record.result as EvidenceResult,
        observedAt: record.observedAt,
        verificationMethodSnapshot: record.verificationMethodSnapshot,
        source: record.source as EvidenceSource,
      })),
    );

    res.json(
      UpdateTaskResponse.parse(
        serializeTask(updated!, updated!.planId, verification),
      ),
    );
  },
);

// ============================================================
// TEAM MANAGEMENT ROUTES
// ============================================================

// List members
router.get(
  "/competitions/:competitionId/members",
  requireMember,
  async (req, res): Promise<void> => {
    const competitionId = res.locals.competitionId as string;

    const members = await db
      .select()
      .from(competitionMembersTable)
      .where(
        and(
          eq(competitionMembersTable.competitionId, competitionId),
          eq(competitionMembersTable.status, "active"),
        ),
      )
      .orderBy(competitionMembersTable.createdAt);

    res.json({ members: members.map(serializeMember) });
  },
);

// Invite member (owner only)
router.post(
  "/competitions/:competitionId/members/invite",
  requireOwner,
  async (req, res): Promise<void> => {
    const parsed = createInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid invite data." });
      return;
    }

    const competitionId = res.locals.competitionId as string;
    const userId = res.locals.userId as string;
    const { role, expiresInDays, maxUses } = parsed.data;

    // Generate secure token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const [invite] = await db
      .insert(competitionInvitesTable)
      .values({
        competitionId,
        tokenHash,
        role,
        expiresAt,
        maxUses,
        createdBy: userId,
      })
      .returning();

    // Return raw token ONLY ONCE
    res.status(201).json({
      invite: {
        id: invite.id,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        maxUses: invite.maxUses,
        token: rawToken, // Only returned once!
      },
    });
  },
);

// List invites (owner only)
router.get(
  "/competitions/:competitionId/invites",
  requireOwner,
  async (req, res): Promise<void> => {
    const competitionId = res.locals.competitionId as string;

    const invites = await db
      .select()
      .from(competitionInvitesTable)
      .where(eq(competitionInvitesTable.competitionId, competitionId))
      .orderBy(desc(competitionInvitesTable.createdAt));

    // Don't return token hashes
    res.json({
      invites: invites.map((invite) => ({
        id: invite.id,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        maxUses: invite.maxUses,
        uses: invite.uses,
        revokedAt: invite.revokedAt?.toISOString() ?? null,
        createdAt: invite.createdAt.toISOString(),
      })),
    });
  },
);

// Revoke invite (owner only)
router.delete(
  "/competitions/:competitionId/invites/:inviteId",
  requireOwner,
  async (req, res): Promise<void> => {
    const params = z.object({ inviteId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid invite ID." });
      return;
    }

    const competitionId = res.locals.competitionId as string;

    await db
      .update(competitionInvitesTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(competitionInvitesTable.id, params.data.inviteId),
          eq(competitionInvitesTable.competitionId, competitionId),
          isNull(competitionInvitesTable.revokedAt),
        ),
      );

    res.status(204).send();
  },
);

// Accept invite (public endpoint - no auth required)
router.post(
  "/invites/accept",
  async (req, res): Promise<void> => {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid token." });
      return;
    }

    const { token } = parsed.data;
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [invite] = await db
      .select()
      .from(competitionInvitesTable)
      .where(eq(competitionInvitesTable.tokenHash, tokenHash))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: "Invite not found." });
      return;
    }

    if (invite.revokedAt) {
      res.status(410).json({ error: "This invite has been revoked." });
      return;
    }

    if (invite.expiresAt < new Date()) {
      res.status(410).json({ error: "This invite has expired." });
      return;
    }

    if (invite.uses >= invite.maxUses) {
      res.status(410).json({ error: "This invite has reached its maximum uses." });
      return;
    }

    // Require authentication to accept
    const userId = res.locals.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required to accept invite." });
      return;
    }

    // Check if user is already a member
    const [existing] = await db
      .select()
      .from(competitionMembersTable)
      .where(
        and(
          eq(competitionMembersTable.competitionId, invite.competitionId),
          eq(competitionMembersTable.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.status === "active") {
        res.status(409).json({ error: "You are already a member of this competition." });
        return;
      }
      // Reactivate if previously removed
      await db
        .update(competitionMembersTable)
        .set({ status: "active", role: invite.role })
        .where(eq(competitionMembersTable.id, existing.id));
    } else {
      // Create new membership
      await db.insert(competitionMembersTable).values({
        competitionId: invite.competitionId,
        userId,
        role: invite.role,
        status: "active",
      });
    }

    // Increment invite uses
    await db
      .update(competitionInvitesTable)
      .set({ uses: invite.uses + 1 })
      .where(eq(competitionInvitesTable.id, invite.id));

    res.json({ success: true, competitionId: invite.competitionId });
  },
);

// Update member role (owner only)
router.patch(
  "/competitions/:competitionId/members/:memberId",
  requireOwner,
  async (req, res): Promise<void> => {
    const params = z.object({
      competitionId: z.string().uuid(),
      memberId: z.string().uuid(),
    }).safeParse(req.params);

    const parsed = updateMemberRoleSchema.safeParse(req.body);

    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid member update." });
      return;
    }

    const competitionId = res.locals.competitionId as string;
    const { role } = parsed.data;

    // Prevent demoting the last owner
    if (role !== "owner") {
      const [ownerCount] = await db
        .select({ count: sql`count(*)` })
        .from(competitionMembersTable)
        .where(
          and(
            eq(competitionMembersTable.competitionId, competitionId),
            eq(competitionMembersTable.role, "owner"),
            eq(competitionMembersTable.status, "active"),
          ),
        );

      if (Number(ownerCount.count) <= 1) {
        const [target] = await db
          .select()
          .from(competitionMembersTable)
          .where(eq(competitionMembersTable.id, params.data.memberId))
          .limit(1);

        if (target?.role === "owner") {
          res.status(400).json({ error: "Cannot demote the last owner." });
          return;
        }
      }
    }

    const [updated] = await db
      .update(competitionMembersTable)
      .set({ role })
      .where(
        and(
          eq(competitionMembersTable.id, params.data.memberId),
          eq(competitionMembersTable.competitionId, competitionId),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Member not found." });
      return;
    }

    res.json({ member: serializeMember(updated) });
  },
);

// Remove member (owner only, or self-remove for non-owners)
router.delete(
  "/competitions/:competitionId/members/:memberId",
  requireMember,
  async (req, res): Promise<void> => {
    const params = z.object({
      competitionId: z.string().uuid(),
      memberId: z.string().uuid(),
    }).safeParse(req.params);

    if (!params.success) {
      res.status(400).json({ error: "Invalid member ID." });
      return;
    }

    const competitionId = res.locals.competitionId as string;
    const membership = res.locals.membership as CompetitionMemberRecord;
    const isOwner = membership.role === "owner";

    // Users can only remove themselves unless they're owner
    if (!isOwner && params.data.memberId !== membership.id) {
      res.status(403).json({ error: "Only owners can remove other members." });
      return;
    }

    const [target] = await db
      .select()
      .from(competitionMembersTable)
      .where(
        and(
          eq(competitionMembersTable.id, params.data.memberId),
          eq(competitionMembersTable.competitionId, competitionId),
        ),
      )
      .limit(1);

    if (!target) {
      res.status(404).json({ error: "Member not found." });
      return;
    }

    // Prevent removing the last owner
    if (target.role === "owner") {
      const [ownerCount] = await db
        .select({ count: sql`count(*)` })
        .from(competitionMembersTable)
        .where(
          and(
            eq(competitionMembersTable.competitionId, competitionId),
            eq(competitionMembersTable.role, "owner"),
            eq(competitionMembersTable.status, "active"),
          ),
        );

      if (Number(ownerCount.count) <= 1) {
        res.status(400).json({
          error: "Cannot remove the last owner. Transfer ownership first.",
        });
        return;
      }
    }

    await db
      .update(competitionMembersTable)
      .set({ status: "removed" })
      .where(eq(competitionMembersTable.id, target.id));

    res.status(204).send();
  },
);

// Leave competition (self-remove)
router.post(
  "/competitions/:competitionId/members/leave",
  requireMember,
  async (req, res): Promise<void> => {
    const competitionId = res.locals.competitionId as string;
    const membership = res.locals.membership as CompetitionMemberRecord;

    // Check if last owner
    if (membership.role === "owner") {
      const [ownerCount] = await db
        .select({ count: sql`count(*)` })
        .from(competitionMembersTable)
        .where(
          and(
            eq(competitionMembersTable.competitionId, competitionId),
            eq(competitionMembersTable.role, "owner"),
            eq(competitionMembersTable.status, "active"),
          ),
        );

      if (Number(ownerCount.count) <= 1) {
        res.status(400).json({
          error: "Cannot leave as the last owner. Transfer ownership first.",
        });
        return;
      }
    }

    await db
      .update(competitionMembersTable)
      .set({ status: "removed" })
      .where(eq(competitionMembersTable.id, membership.id));

    res.json({ success: true });
  },
);

// ============================================================
// TASK ASSIGNMENT ROUTES
// ============================================================

// Assign task to member (lead/owner)
router.patch(
  "/competitions/:competitionId/tasks/:taskId/assign",
  requireLead,
  async (req, res): Promise<void> => {
    const params = z.object({
      competitionId: z.string().uuid(),
      taskId: z.string().uuid(),
    }).safeParse(req.params);

    const parsed = assignTaskSchema.safeParse(req.body);

    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid assignment data." });
      return;
    }

    const competitionId = res.locals.competitionId as string;
    const { assigneeMemberId, blockedReason } = parsed.data;

    // Verify task exists and belongs to current plan
    const [latestPlan] = await db
      .select()
      .from(workflowPlansTable)
      .where(eq(workflowPlansTable.competitionId, competitionId))
      .orderBy(desc(workflowPlansTable.version))
      .limit(1);

    if (!latestPlan) {
      res.status(404).json({ error: "Current plan not found." });
      return;
    }

    const [task] = await db
      .select()
      .from(workflowTasksTable)
      .where(
        and(
          eq(workflowTasksTable.id, params.data.taskId),
          eq(workflowTasksTable.competitionId, competitionId),
          eq(workflowTasksTable.planId, latestPlan.id),
        ),
      )
      .limit(1);

    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    // Verify assignee is a member (if provided)
    if (assigneeMemberId) {
      const [assignee] = await db
        .select()
        .from(competitionMembersTable)
        .where(
          and(
            eq(competitionMembersTable.id, assigneeMemberId),
            eq(competitionMembersTable.competitionId, competitionId),
            eq(competitionMembersTable.status, "active"),
          ),
        )
        .limit(1);

      if (!assignee) {
        res.status(400).json({ error: "Assignee is not an active member." });
        return;
      }
    }

    const [updated] = await db
      .update(workflowTasksTable)
      .set({
        assigneeMemberId,
        blockedReason: blockedReason ?? null,
        // If assigning to someone, clear blocked status unless reason provided
        ...(assigneeMemberId && !blockedReason ? { status: "todo" } : {}),
      })
      .where(eq(workflowTasksTable.id, task.id))
      .returning();

    res.json({
      task: {
        ...updated,
        assigneeMemberId: updated.assigneeMemberId,
        blockedReason: updated.blockedReason,
      },
    });
  },
);

// Bulk assign tasks (lead/owner)
router.patch(
  "/competitions/:competitionId/tasks/bulk-assign",
  requireLead,
  async (req, res): Promise<void> => {
    const competitionId = res.locals.competitionId as string;

    const parsed = bulkAssignTasksSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid bulk assignment data." });
      return;
    }

    const { assignments } = parsed.data;

    // Get current plan
    const [latestPlan] = await db
      .select()
      .from(workflowPlansTable)
      .where(eq(workflowPlansTable.competitionId, competitionId))
      .orderBy(desc(workflowPlansTable.version))
      .limit(1);

    if (!latestPlan) {
      res.status(404).json({ error: "Current plan not found." });
      return;
    }

    // Validate all assignees are active members
    const assigneeIds = [
      ...new Set(
        assignments
          .map((a) => a.assigneeMemberId)
          .filter((id): id is string => id !== null),
      ),
    ];
    if (assigneeIds.length > 0) {
      const assignees = await db
        .select()
        .from(competitionMembersTable)
        .where(
          and(
            eq(competitionMembersTable.competitionId, competitionId),
            eq(competitionMembersTable.status, "active"),
            inArray(competitionMembersTable.id, assigneeIds),
          ),
        );

      if (assignees.length !== assigneeIds.length) {
        res.status(400).json({ error: "One or more assignees are not active members." });
        return;
      }
    }

    // Bulk update
    const results = await Promise.all(
      assignments.map(({ taskId, assigneeMemberId }) =>
        db
          .update(workflowTasksTable)
          .set({ assigneeMemberId })
          .where(
            and(
              eq(workflowTasksTable.id, taskId),
              eq(workflowTasksTable.competitionId, competitionId),
              eq(workflowTasksTable.planId, latestPlan.id),
            ),
          )
          .returning(),
      ),
    );

    res.json({ updated: results.flat() });
  },
);

// Get tasks with assignee info (member)
router.get(
  "/competitions/:competitionId/tasks",
  requireMember,
  async (req, res): Promise<void> => {
    const competitionId = res.locals.competitionId as string;
    const userId = res.locals.userId as string;
    const membership = res.locals.membership as CompetitionMemberRecord;

    const filter = req.query.filter as string | undefined; // "my" | "unassigned" | memberId

    const [latestPlan] = await db
      .select()
      .from(workflowPlansTable)
      .where(eq(workflowPlansTable.competitionId, competitionId))
      .orderBy(desc(workflowPlansTable.version))
      .limit(1);

    if (!latestPlan) {
      res.json({ tasks: [], plan: null });
      return;
    }

    let tasksQuery = db
      .select()
      .from(workflowTasksTable)
      .where(
        and(
          eq(workflowTasksTable.competitionId, competitionId),
          eq(workflowTasksTable.planId, latestPlan.id),
        ),
      );

    // Apply filter
    const conditions = [
      eq(workflowTasksTable.competitionId, competitionId),
      eq(workflowTasksTable.planId, latestPlan.id),
    ];

    if (filter === "my") {
      conditions.push(eq(workflowTasksTable.assigneeMemberId, membership.id));
    } else if (filter === "unassigned") {
      conditions.push(isNull(workflowTasksTable.assigneeMemberId));
    } else if (filter && filter !== "all") {
      // Filter by specific member
      conditions.push(eq(workflowTasksTable.assigneeMemberId, filter));
    }

    const tasks = await db
      .select()
      .from(workflowTasksTable)
      .where(and(...conditions))
      .orderBy(workflowTasksTable.plannedStartAt);

    const evidence = await loadMemberEvidence(competitionId, userId);

    const serializedTasks = tasks.map((task) => {
      const verification = evaluateTaskVerification(
        {
          id: task.id,
          taskKey: task.taskKey,
          phase: task.phase,
          status: task.status as TaskStatus,
          verificationMethod: task.verificationMethod,
        },
        evidence.map((record) => ({
          id: record.id,
          taskKey: record.taskKey,
          type: record.type as EvidenceType,
          result: record.result as EvidenceResult,
          observedAt: record.observedAt,
          verificationMethodSnapshot: record.verificationMethodSnapshot,
          source: record.source as EvidenceSource,
        })),
      );

      return serializeTask(task, latestPlan.id, verification);
    });

    res.json({ tasks: serializedTasks, plan: serializePlanSummary(latestPlan, tasks) });
  },
);

// ============================================================
// SHARE LINKS ROUTES
// ============================================================

// Create share link (owner only)
router.post(
  "/competitions/:competitionId/shares",
  requireOwner,
  async (req, res): Promise<void> => {
    const parsed = createShareLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid share link data." });
      return;
    }

    const competitionId = res.locals.competitionId as string;
    const userId = res.locals.userId as string;
    const { scope, expiresInDays, memberId } = parsed.data;

    // For my_tasks scope, memberId is required
    if (scope === "my_tasks" && !memberId) {
      res.status(400).json({ error: "memberId is required for my_tasks scope." });
      return;
    }

    // Verify member exists if provided
    if (memberId) {
      const [member] = await db
        .select()
        .from(competitionMembersTable)
        .where(
          and(
            eq(competitionMembersTable.id, memberId),
            eq(competitionMembersTable.competitionId, competitionId),
            eq(competitionMembersTable.status, "active"),
          ),
        )
        .limit(1);

      if (!member) {
        res.status(400).json({ error: "Member not found." });
        return;
      }
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const [shareLink] = await db
      .insert(shareLinksTable)
      .values({
        competitionId,
        tokenHash,
        scope,
        memberId: memberId ?? null,
        expiresAt,
        createdBy: userId,
      })
      .returning();

    // Return raw token ONLY ONCE
    const baseUrl = process.env.APP_URL || `https://${req.get("host")}`;
    res.status(201).json({
      shareLink: {
        id: shareLink.id,
        scope: shareLink.scope,
        expiresAt: shareLink.expiresAt.toISOString(),
        url: `${baseUrl}/share/${rawToken}`,
        token: rawToken, // Only returned once!
      },
    });
  },
);

// List share links (owner only)
router.get(
  "/competitions/:competitionId/shares",
  requireOwner,
  async (req, res): Promise<void> => {
    const competitionId = res.locals.competitionId as string;

    const shares = await db
      .select()
      .from(shareLinksTable)
      .where(eq(shareLinksTable.competitionId, competitionId))
      .orderBy(desc(shareLinksTable.createdAt));

    const baseUrl = process.env.APP_URL || `https://${req.get("host")}`;

    res.json({
      shares: shares.map((share) => ({
        id: share.id,
        scope: share.scope,
        memberId: share.memberId,
        expiresAt: share.expiresAt.toISOString(),
        revokedAt: share.revokedAt?.toISOString() ?? null,
        createdAt: share.createdAt.toISOString(),
        url: `${baseUrl}/share/${share.tokenHash}`, // URL with hash for reference (not usable)
      })),
    });
  },
);

// Revoke share link (owner only)
router.delete(
  "/competitions/:competitionId/shares/:shareId",
  requireOwner,
  async (req, res): Promise<void> => {
    const params = z.object({ shareId: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid share link ID." });
      return;
    }

    const competitionId = res.locals.competitionId as string;

    await db
      .update(shareLinksTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(shareLinksTable.id, params.data.shareId),
          eq(shareLinksTable.competitionId, competitionId),
          isNull(shareLinksTable.revokedAt),
        ),
      );

    res.status(204).send();
  },
);

// ============================================================
// PUBLIC SHARE ENDPOINTS (no auth required)
// ============================================================

// Get shared plan (read_only_plan scope)
router.get(
  "/share/:token",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [share] = await db
      .select()
      .from(shareLinksTable)
      .where(eq(shareLinksTable.tokenHash, tokenHash))
      .limit(1);

    if (!share) {
      res.set("X-Robots-Tag", "noindex");
      res.status(404).json({ error: "Share link not found." });
      return;
    }

    if (share.revokedAt) {
      res.set("X-Robots-Tag", "noindex");
      res.status(410).json({ error: "This share link has been revoked." });
      return;
    }

    if (share.expiresAt < new Date()) {
      res.set("X-Robots-Tag", "noindex");
      res.status(410).json({ error: "This share link has expired." });
      return;
    }

    if (share.scope !== "read_only_plan") {
      res.set("X-Robots-Tag", "noindex");
      res.status(403).json({ error: "Invalid share link scope." });
      return;
    }

    // Get competition and latest plan
    const competition = await findCompetitionById(share.competitionId);
    if (!competition) {
      res.set("X-Robots-Tag", "noindex");
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const [plan] = await db
      .select()
      .from(workflowPlansTable)
      .where(eq(workflowPlansTable.competitionId, competition.id))
      .orderBy(desc(workflowPlansTable.version))
      .limit(1);

    if (!plan) {
      res.set("X-Robots-Tag", "noindex");
      res.status(404).json({ error: "No plan available." });
      return;
    }

    const tasks = await db
      .select()
      .from(workflowTasksTable)
      .where(eq(workflowTasksTable.planId, plan.id))
      .orderBy(workflowTasksTable.plannedStartAt);

    // Load members for assignee names
    const members = await db
      .select()
      .from(competitionMembersTable)
      .where(
        and(
          eq(competitionMembersTable.competitionId, competition.id),
          eq(competitionMembersTable.status, "active"),
        ),
      );

    const memberMap = new Map(members.map((m) => [m.id, m]));

    // Return minimal data shape - no emails, internal IDs, other competitions, private notes
    res.set("X-Robots-Tag", "noindex");
    res.set("Cache-Control", "public, max-age=300"); // 5 min cache

    res.json({
      competition: {
        name: competition.name,
        organizer: competition.organizer,
        deadline: competition.deadline.toISOString(),
        competitionType: competition.competitionType,
      },
      plan: {
        version: plan.version,
        generatedAt: plan.generatedAt.toISOString(),
        deadline: plan.deadline.toISOString(),
        availableMinutes: plan.availableMinutes,
        bufferMinutes: plan.bufferMinutes,
        status: plan.status,
        warnings: plan.warnings,
      },
      tasks: tasks.map((task) => {
        let assignee = null;
        if (task.assigneeMemberId) {
          const member = memberMap.get(task.assigneeMemberId);
          assignee = member ? { name: member.role } : { name: "Unknown" };
        }
        return {
          taskKey: task.taskKey,
          title: task.title,
          description: task.description,
          phase: task.phase,
          priority: task.priority,
          estimatedMinutes: task.estimatedMinutes,
          plannedStartAt: task.plannedStartAt.toISOString(),
          plannedEndAt: task.plannedEndAt.toISOString(),
          status: task.status,
          assignee,
          blockedReason: task.blockedReason,
        };
      }),
    });
  },
);

// Get shared my_tasks (my_tasks scope)
router.get(
  "/share/:token/tasks",
  async (req, res): Promise<void> => {
    const { token } = req.params;
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const [share] = await db
      .select()
      .from(shareLinksTable)
      .where(eq(shareLinksTable.tokenHash, tokenHash))
      .limit(1);

    if (!share) {
      res.set("X-Robots-Tag", "noindex");
      res.status(404).json({ error: "Share link not found." });
      return;
    }

    if (share.revokedAt) {
      res.set("X-Robots-Tag", "noindex");
      res.status(410).json({ error: "This share link has been revoked." });
      return;
    }

    if (share.expiresAt < new Date()) {
      res.set("X-Robots-Tag", "noindex");
      res.status(410).json({ error: "This share link has expired." });
      return;
    }

    if (share.scope !== "my_tasks" || !share.memberId) {
      res.set("X-Robots-Tag", "noindex");
      res.status(403).json({ error: "Invalid share link scope." });
      return;
    }

    // Get member
    const [member] = await db
      .select()
      .from(competitionMembersTable)
      .where(eq(competitionMembersTable.id, share.memberId))
      .limit(1);

    if (!member || member.status !== "active") {
      res.set("X-Robots-Tag", "noindex");
      res.status(410).json({ error: "Member no longer active." });
      return;
    }

    // Get competition and latest plan
    const competition = await findCompetitionById(share.competitionId);
    if (!competition) {
      res.set("X-Robots-Tag", "noindex");
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const [plan] = await db
      .select()
      .from(workflowPlansTable)
      .where(eq(workflowPlansTable.competitionId, competition.id))
      .orderBy(desc(workflowPlansTable.version))
      .limit(1);

    if (!plan) {
      res.set("X-Robots-Tag", "noindex");
      res.status(404).json({ error: "No plan available." });
      return;
    }

    const tasks = await db
      .select()
      .from(workflowTasksTable)
      .where(
        and(
          eq(workflowTasksTable.planId, plan.id),
          eq(workflowTasksTable.assigneeMemberId, member.id),
        ),
      )
      .orderBy(workflowTasksTable.plannedStartAt);

    res.set("X-Robots-Tag", "noindex");
    res.set("Cache-Control", "public, max-age=300");

    res.json({
      competition: {
        name: competition.name,
        deadline: competition.deadline.toISOString(),
      },
      member: { role: member.role },
      tasks: tasks.map((task) => ({
        taskKey: task.taskKey,
        title: task.title,
        description: task.description,
        phase: task.phase,
        priority: task.priority,
        estimatedMinutes: task.estimatedMinutes,
        plannedStartAt: task.plannedStartAt.toISOString(),
        plannedEndAt: task.plannedEndAt.toISOString(),
        status: task.status,
        blockedReason: task.blockedReason,
        acceptanceCriteria: task.acceptanceCriteria,
        verificationMethod: task.verificationMethod,
      })),
    });
  },
);

export default router;