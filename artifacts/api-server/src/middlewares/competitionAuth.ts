import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import {
  competitionMembersTable,
  competitionsTable,
  type CompetitionMemberRecord,
} from "@workspace/db";
import { z } from "zod/v4";

declare global {
  namespace Express {
    interface Locals {
      userId: string;
      competitionId?: string;
      membership?: CompetitionMemberRecord;
      membershipRole?: string;
    }
    // Express adds these properties at runtime but they're not in the types
    interface Request {
      url: string;
      originalUrl: string;
      path: string;
    }
  }
}

/**
 * Extract competitionId from request URL.
 * Handles paths like /competitions/:competitionId/... (without /api prefix)
 * or /api/competitions/:competitionId/...
 */
function extractCompetitionId(req: Express.Request): string | null {
  // Use req.url which is the raw URL including query string
  // Path format: /competitions/:competitionId/... or /api/competitions/:competitionId/...
  const path = req.url.split("?")[0];
  const match = path.match(/\/competitions\/([a-f0-9-]{36})/i);
  if (match) return match[1];
  
  // Fallback: try with /api prefix
  const match2 = path.match(/\/api\/competitions\/([a-f0-9-]{36})/i);
  return match2 ? match2[1] : null;
}

/**
 * Middleware to load competition membership for the current user.
 * Attaches membership info to res.locals.membership and res.locals.membershipRole.
 * Does NOT enforce access - use requireMember/requireRole for that.
 */
export const loadCompetitionMembership: RequestHandler = async (req, res, next) => {
  const competitionId = extractCompetitionId(req);
  const userId = res.locals.userId;

  if (!competitionId || !userId) {
    return next();
  }

  try {
    const [membership] = await db
      .select()
      .from(competitionMembersTable)
      .where(
        and(
          eq(competitionMembersTable.competitionId, competitionId),
          eq(competitionMembersTable.userId, userId),
          eq(competitionMembersTable.status, "active"),
        ),
      )
      .limit(1);

    res.locals.membership = membership;
    res.locals.membershipRole = membership?.role ?? null;
    res.locals.competitionId = competitionId;
    next();
  } catch (error) {
    req.log.error({ error, competitionId, userId }, "Failed to load membership");
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Apply membership loading to all competition routes that have :competitionId param.
 * This middleware extracts competitionId from the URL path.
 */
export const conditionalLoadMembership: RequestHandler = async (req, res, next) => {
  return loadCompetitionMembership(req, res, next);
};

/**
 * Require active membership in the competition.
 * Non-members get 404 (not 403) to avoid information leakage.
 */
export const requireMember: RequestHandler = (req, res, next) => {
  if (!res.locals.membership) {
    res.status(404).json({ error: "Competition not found." });
    return;
  }
  next();
}

/**
 * Require specific role(s) in the competition.
 * Owner-only actions: use requireRole("owner")
 * Lead+ actions: use requireRole("owner", "lead")
 */
export const requireRole = (...allowedRoles: string[]): RequestHandler => {
  return (req, res, next) => {
    if (!res.locals.membership) {
      res.status(404).json({ error: "Competition not found." });
      return;
    }

    const role = res.locals.membershipRole;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({
        error: `Requires one of: ${allowedRoles.join(", ")}. You have: ${role || "none"}`,
      });
      return;
    }
    next();
  };
}

/**
 * Require owner role (highest privilege).
 * Used for: delete competition, change roles, create/revoke share links and invites.
 */
export const requireOwner = requireRole("owner");

/**
 * Require at least lead role.
 * Used for: plan generation, task assignment, member management.
 */
export const requireLead = requireRole("owner", "lead");

/**
 * Validate that user is not trying to access another user's data via IDOR.
 * Use when accepting invites, accessing share links, etc.
 */
export const preventIdor = (paramName: string): RequestHandler => {
  return (req, res, next) => {
    const paramValue = req.params[paramName] || req.body[paramName];
    if (paramValue && paramValue !== res.locals.userId) {
      req.log.warn(
        { userId: res.locals.userId, attemptedId: paramValue },
        "IDOR attempt blocked",
      );
      res.status(403).json({ error: "Cannot perform action on behalf of another user" });
      return;
    }
    next();
  };
}

/**
 * Zod schemas for team-related input validation
 */
export const createInviteSchema = z.object({
  role: z.enum(["lead", "backend", "frontend", "designer", "pitch", "member"]),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(10).default(1),
});

export const createShareLinkSchema = z.object({
  scope: z.enum(["read_only_plan", "my_tasks"]),
  expiresInDays: z.number().int().min(1).max(365).default(30),
  memberId: z.string().uuid().optional(), // required for my_tasks scope
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["owner", "lead", "backend", "frontend", "designer", "pitch", "member"]),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const assignTaskSchema = z.object({
  assigneeMemberId: z.string().uuid().nullable(),
  blockedReason: z.string().max(500).nullable().optional(),
});

export const bulkAssignTasksSchema = z.object({
  assignments: z.array(
    z.object({
      taskId: z.string().uuid(),
      assigneeMemberId: z.string().uuid().nullable(),
    }),
  ),
});
