import { db, pool } from "../dist/app.mjs";
import {
  competitionsTable,
  workflowEvidenceTable,
} from "../dist/app.mjs";
import {
  competitionMembersTable,
  competitionInvitesTable,
  workflowPlansTable,
  workflowTasksTable,
} from "../../../lib/db/dist/schema/index.js";
import { eq, and, inArray } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";

let testCounter = 0;

/**
 * Generates a unique test user ID.
 */
export function uniqueTestUser(prefix = "test") {
  testCounter++;
  return `${prefix}-${testCounter}-${randomBytes(4).toString("hex")}`;
}

/**
 * Creates a test user membership for a competition.
 * Returns the membership record.
 * @param {string} competitionId
 * @param {string} userId
 * @param {string} [role="member"]
 */
export async function createTestMembership(competitionId, userId, role = "member") {
  const [membership] = await db
    .insert(competitionMembersTable)
    .values({
      competitionId,
      userId,
      role: role,
      status: "active",
    })
    .returning();
  return membership;
}

/**
 * Creates an invite for a user and returns the raw token (only returned once).
 * @param {string} competitionId
 * @param {string} createdBy
 * @param {string} [role="member"]
 * @param {number} [expiresInDays=7]
 * @param {number} [maxUses=1]
 */
export async function createTestInvite(competitionId, createdBy, role = "member", expiresInDays = 7, maxUses = 1) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const [invite] = await db
    .insert(competitionInvitesTable)
    .values({
      competitionId,
      tokenHash,
      role: role,
      expiresAt,
      maxUses,
      createdBy,
    })
    .returning();

  return { invite, rawToken };
}

/**
 * Accepts an invite as a user.
 * @param {string} token
 * @param {string} userId
 */
export async function acceptInvite(token, userId) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [invite] = await db
    .select()
    .from(competitionInvitesTable)
    .where(eq(competitionInvitesTable.tokenHash, tokenHash))
    .limit(1);

  if (!invite) throw new Error("Invite not found");
  if (invite.revokedAt) throw new Error("Invite revoked");
  if (invite.expiresAt < new Date()) throw new Error("Invite expired");
  if (invite.uses >= invite.maxUses) throw new Error("Invite max uses reached");

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
    if (existing.status === "active") throw new Error("Already a member");
    await db
      .update(competitionMembersTable)
      .set({ status: "active", role: invite.role })
      .where(eq(competitionMembersTable.id, existing.id));
  } else {
    await db.insert(competitionMembersTable).values({
      competitionId: invite.competitionId,
      userId,
      role: invite.role,
      status: "active",
    });
  }

  await db
    .update(competitionInvitesTable)
    .set({ uses: invite.uses + 1 })
    .where(eq(competitionInvitesTable.id, invite.id));

  return invite.competitionId;
}

/**
 * Cleans up all test data for a user.
 * @param {string} userId
 */
export async function cleanupTestUser(userId) {
  const ownedComps = await db
    .select({ id: competitionsTable.id })
    .from(competitionsTable)
    .where(eq(competitionsTable.ownerId, userId));

  const compIds = ownedComps.map(c => c.id);

  if (compIds.length > 0) {
    await db.delete(workflowEvidenceTable).where(inArray(workflowEvidenceTable.competitionId, compIds));
    await db.delete(workflowTasksTable).where(inArray(workflowTasksTable.competitionId, compIds));
    await db.delete(workflowPlansTable).where(inArray(workflowPlansTable.competitionId, compIds));
    await db.delete(competitionMembersTable).where(inArray(competitionMembersTable.competitionId, compIds));
    await db.delete(competitionInvitesTable).where(inArray(competitionInvitesTable.competitionId, compIds));
    await db.delete(competitionsTable).where(eq(competitionsTable.ownerId, userId));
  }
}

/**
 * Creates a competition and returns it with the owner membership.
 * @param {string} ownerId
 * @param {object} [overrides={}]
 */
export async function createTestCompetition(ownerId, overrides = {}) {
  const deadline = new Date(Date.now() + 14 * 86400000);
  const [competition] = await db
    .insert(competitionsTable)
    .values({
      ownerId,
      name: "Test Competition",
      organizer: "Test Organizer",
      competitionType: "online",
      deadline,
      teamSize: 4,
      trackMode: "choose",
      status: "preparing",
      ...overrides,
    })
    .returning();

  await db.insert(competitionMembersTable).values({
    competitionId: competition.id,
    userId: ownerId,
    role: "owner",
    status: "active",
  });

  return competition;
}
