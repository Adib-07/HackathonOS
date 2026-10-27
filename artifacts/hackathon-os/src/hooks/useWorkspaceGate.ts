import { useMemo } from 'react';
import { useListCompetitions } from '@workspace/api-client-react';
import { useGetOverview } from '@workspace/api-client-react';
import { WORKSPACE_GATES, type WorkspaceGateId } from '@/lib/workflow';

export interface WorkspaceGateState {
  hasCompetitions: boolean;
  competitionCount: number;
  selectedCompetitionId: string | null;
  competitions: Array<{ id: string; name: string }>;
  isLocked: (gateId: WorkspaceGateId) => boolean;
  getUnlockReason: (gateId: WorkspaceGateId) => string | null;
  getUnlockAction: (gateId: WorkspaceGateId) => string | null;
}

/**
 * Single source of truth for workspace gate state.
 * Uses the overview query for current competition and list competitions for count.
 */
export function useWorkspaceGate(): WorkspaceGateState {
  const competitionsQuery = useListCompetitions();
  const overviewQuery = useGetOverview();

  const competitions = useMemo(
    () => (competitionsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [competitionsQuery.data],
  );

  const competitionCount = competitions.length;
  const hasCompetitions = competitionCount > 0;
  const selectedCompetitionId = overviewQuery.data?.currentCompetition?.id ?? null;

  const isLocked = useMemo(
    () => (gateId: WorkspaceGateId) => {
      const gate = WORKSPACE_GATES[gateId];
      if (!gate.unlockReason) return false; // Always accessible
      return !hasCompetitions;
    },
    [hasCompetitions],
  );

  const getUnlockReason = useMemo(
    () => (gateId: WorkspaceGateId) => {
      const gate = WORKSPACE_GATES[gateId];
      return gate.unlockReason;
    },
    [],
  );

  const getUnlockAction = useMemo(
    () => (gateId: WorkspaceGateId) => {
      const gate = WORKSPACE_GATES[gateId];
      return gate.unlockAction;
    },
    [],
  );

  return {
    hasCompetitions,
    competitionCount,
    selectedCompetitionId,
    competitions,
    isLocked,
    getUnlockReason,
    getUnlockAction,
  };
}

/**
 * Hook for a specific gate - returns locked state and unlock info for that gate
 */
export function useGate(gateId: WorkspaceGateId) {
  const { isLocked, getUnlockReason, getUnlockAction, hasCompetitions, selectedCompetitionId } = useWorkspaceGate();

  return {
    isLocked: isLocked(gateId),
    unlockReason: getUnlockReason(gateId),
    unlockAction: getUnlockAction(gateId),
    hasCompetitions,
    selectedCompetitionId,
    gate: WORKSPACE_GATES[gateId],
  };
}