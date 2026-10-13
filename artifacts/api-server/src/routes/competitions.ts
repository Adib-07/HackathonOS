import {
  and,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
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
  competitionsTable,
  db,
  workflowPlansTable,
  workflowTasksTable,
  type Competition as DbCompetition,
  type WorkflowPlanRecord,
  type WorkflowTaskRecord,
} from "@workspace/db";
import { createPlanDraft, serializeTask } from "../lib/planner";

const router: IRouter = Router();

function serializeCompetition(competition: DbCompetition) {
  return {
    ...competition,
    startAt: competition.startAt?.toISOString() ?? null,
    deadline: competition.deadline.toISOString(),
    createdAt: competition.createdAt.toISOString(),
    updatedAt: competition.updatedAt.toISOString(),
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
) {
  return GetPlanResponse.parse({
    ...serializePlanSummary(plan, tasks),
    tasks: tasks.map((task) => serializeTask(task, plan.id)),
  });
}

async function findOwnedCompetition(
  competitionId: string,
  ownerId: string,
): Promise<DbCompetition | undefined> {
  const [competition] = await db
    .select()
    .from(competitionsTable)
    .where(
      and(
        eq(competitionsTable.id, competitionId),
        eq(competitionsTable.ownerId, ownerId),
      ),
    )
    .limit(1);

  return competition;
}

router.get("/overview", async (_req, res): Promise<void> => {
  const ownerId = res.locals.userId as string;
  const competitions = await db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.ownerId, ownerId))
    .orderBy(competitionsTable.deadline);
  const currentCompetition =
    competitions.find(
      (competition) =>
        competition.status === "preparing" || competition.status === "active",
    ) ?? null;

  let currentPlan = null;
  let currentTasks: WorkflowTaskRecord[] = [];

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
      currentPlan = serializePlan(latestPlan, currentTasks);
    }
  }

  const nextAction =
    currentTasks.find(
      (task) =>
        task.status === "in_progress" ||
        task.status === "todo" ||
        task.status === "blocked",
    ) ?? null;

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
        ? serializeTask(nextAction, nextAction.planId)
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

router.get("/competitions", async (_req, res): Promise<void> => {
  const competitions = await db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.ownerId, res.locals.userId as string))
    .orderBy(competitionsTable.deadline);

  res.json(
    ListCompetitionsResponse.parse(competitions.map(serializeCompetition)),
  );
});

router.post("/competitions", async (req, res): Promise<void> => {
  const parsed = CreateCompetitionBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      { errors: parsed.error.issues.map((issue) => issue.message) },
      "Invalid competition input",
    );
    res.status(400).json({ error: "Invalid competition details." });
    return;
  }

  const data = parsed.data;
  const [competition] = await db
    .insert(competitionsTable)
    .values({
      ownerId: res.locals.userId as string,
      name: data.name,
      organizer: data.organizer ?? null,
      competitionType: data.competitionType ?? "unknown",
      startAt: data.startAt ? new Date(data.startAt) : null,
      deadline: new Date(data.deadline),
      teamSize: data.teamSize ?? 1,
      trackMode: data.trackMode ?? "choose",
      currentTrack: data.currentTrack ?? null,
      problemStatement: data.problemStatement ?? null,
      officialUrl: data.officialUrl ?? null,
      rulesUrl: data.rulesUrl ?? null,
      mandatoryDeliverables: data.mandatoryDeliverables ?? [],
      teamSkills: data.teamSkills ?? [],
      ideaComplexity: data.ideaComplexity ?? 3,
      status: data.status ?? "preparing",
    })
    .returning();

  res
    .status(201)
    .json(CreateCompetitionResponse.parse(serializeCompetition(competition!)));
});

router.get("/competitions/:competitionId", async (req, res): Promise<void> => {
  const params = GetCompetitionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid competition ID." });
    return;
  }

  const competition = await findOwnedCompetition(
    params.data.competitionId,
    res.locals.userId as string,
  );

  if (!competition) {
    res.status(404).json({ error: "Competition not found." });
    return;
  }

  res.json(GetCompetitionResponse.parse(serializeCompetition(competition)));
});

router.patch(
  "/competitions/:competitionId",
  async (req, res): Promise<void> => {
    const params = UpdateCompetitionParams.safeParse(req.params);
    const parsed = UpdateCompetitionBody.safeParse(req.body);

    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid competition update." });
      return;
    }

    const current = await findOwnedCompetition(
      params.data.competitionId,
      res.locals.userId as string,
    );
    if (!current) {
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
      .where(
        and(
          eq(competitionsTable.id, params.data.competitionId),
          eq(competitionsTable.ownerId, res.locals.userId as string),
        ),
      )
      .returning();

    res.json(UpdateCompetitionResponse.parse(serializeCompetition(updated!)));
  },
);

router.get(
  "/competitions/:competitionId/plans",
  async (req, res): Promise<void> => {
    const params = ListPlanVersionsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid competition ID." });
      return;
    }

    const competition = await findOwnedCompetition(
      params.data.competitionId,
      res.locals.userId as string,
    );
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

router.post(
  "/competitions/:competitionId/plans",
  async (req, res): Promise<void> => {
    const params = GeneratePlanParams.safeParse(req.params);
    const parsed = GeneratePlanBody.safeParse(req.body);

    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid plan request." });
      return;
    }

    const competition = await findOwnedCompetition(
      params.data.competitionId,
      res.locals.userId as string,
    );
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
          })),
        )
        .returning();

      return { plan: plan!, tasks };
    });

    res
      .status(201)
      .json(GeneratePlanResponse.parse(serializePlan(result.plan, result.tasks)));
  },
);

router.get(
  "/competitions/:competitionId/plans/:planId",
  async (req, res): Promise<void> => {
    const params = GetPlanParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid plan request." });
      return;
    }

    const competition = await findOwnedCompetition(
      params.data.competitionId,
      res.locals.userId as string,
    );
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

    res.json(GetPlanResponse.parse(serializePlan(plan, tasks)));
  },
);

router.patch(
  "/competitions/:competitionId/tasks/:taskId",
  async (req, res): Promise<void> => {
    const params = UpdateTaskParams.safeParse(req.params);
    const parsed = UpdateTaskBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid task update." });
      return;
    }

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

    const [ownedTask] = await db
      .select({ task: workflowTasksTable })
      .from(workflowTasksTable)
      .innerJoin(
        competitionsTable,
        eq(workflowTasksTable.competitionId, competitionsTable.id),
      )
      .where(
        and(
          eq(workflowTasksTable.id, params.data.taskId),
          eq(
            workflowTasksTable.competitionId,
            params.data.competitionId,
          ),
          eq(workflowTasksTable.planId, latestPlan.id),
          eq(competitionsTable.ownerId, res.locals.userId as string),
        ),
      )
      .limit(1);

    if (!ownedTask) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    const [updated] = await db
      .update(workflowTasksTable)
      .set({ status: parsed.data.status })
      .where(eq(workflowTasksTable.id, ownedTask.task.id))
      .returning();

    res.json(
      UpdateTaskResponse.parse(
        serializeTask(updated!, updated!.planId),
      ),
    );
  },
);

export default router;
