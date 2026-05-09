// apps/frontend/src/hooks/api/index.ts
/**
 * Central TanStack Query hooks for every API endpoint.
 * Pattern: useQuery for reads, useMutation for writes.
 * All mutations invalidate the relevant query keys on success.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/apiClient';

// ── ESTIMATIONS ───────────────────────────────────────────────────────────────

export const useGenerateEstimation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, teamId, sprintId }: { taskId: string; teamId: string; sprintId?: string }) =>
      api.generateEstimation(taskId, teamId, sprintId).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['estimations', data.id], data);
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useEstimation = (id: string) =>
  useQuery({
    queryKey: ['estimations', id],
    queryFn: () => api.getEstimation(id).then((r) => r.data),
    enabled: !!id,
  });

export const useEstimationExplanation = (id: string) =>
  useQuery({
    queryKey: ['estimations', id, 'explanation'],
    queryFn: () => api.getExplanation(id).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000, // explanations don't change
  });

export const useOverrideEstimation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hours, reason }: { id: string; hours: number; reason: string }) =>
      api.overrideEstimation(id, hours, reason).then((r) => r.data),
    onSuccess: (data, { id }) => {
      qc.setQueryData(['estimations', id], data);
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useBulkEstimate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskIds, teamId }: { taskIds: string[]; teamId: string }) =>
      api.bulkEstimate(taskIds, teamId).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

// ── PROJECTS ──────────────────────────────────────────────────────────────────

export const useProject = (id: string) =>
  useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.getProject(id).then((r) => r.data),
    enabled: !!id,
  });

export const useProjectTasks = (projectId: string, status?: string) =>
  useQuery({
    queryKey: ['tasks', projectId, status],
    queryFn: () =>
      api.getProjectTasks(projectId).then((r) =>
        status ? r.data.filter((t: any) => t.status === status) : r.data,
      ),
    enabled: !!projectId,
    refetchInterval: 60_000, // poll every minute for task status changes
  });

export const useProjectSprints = (projectId: string) =>
  useQuery({
    queryKey: ['sprints', projectId],
    queryFn: () => api.getProjectSprints(projectId).then((r) => r.data),
    enabled: !!projectId,
  });

export const useCompleteSprint = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sprintId: string) =>
      api.completeSprint(projectId, sprintId).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', projectId] });
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
    },
  });
};

// ── DEVELOPERS ────────────────────────────────────────────────────────────────

export const useDeveloperProfile = (id: string) =>
  useQuery({
    queryKey: ['developers', id],
    queryFn: () => api.getDeveloperProfile(id).then((r) => r.data),
    enabled: !!id,
    staleTime: 60_000,
  });

export const useVelocityHistory = (id: string, from?: string, to?: string) =>
  useQuery({
    queryKey: ['developers', id, 'velocity', from, to],
    queryFn: () => api.getVelocityHistory(id, from, to).then((r) => r.data),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });

export const useTeamCompositionScore = (teamId: string) =>
  useQuery({
    queryKey: ['teams', teamId, 'composition'],
    queryFn: () => api.getTeamCompositionScore(teamId).then((r) => r.data),
    enabled: !!teamId,
    staleTime: 2 * 60_000,
  });

// ── RISKS ─────────────────────────────────────────────────────────────────────

export const useProjectRisks = (projectId: string) =>
  useQuery({
    queryKey: ['risks', projectId],
    queryFn: () => api.getProjectRisks(projectId).then((r) => r.data),
    enabled: !!projectId,
    // Risks are time-sensitive — keep fresh
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

export const useResolveAlert = (projectId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) =>
      api.resolveAlert(alertId).then((r) => r.data),
    // Optimistic update: remove alert immediately from cache
    onMutate: async (alertId) => {
      await qc.cancelQueries({ queryKey: ['risks', projectId] });
      const prev = qc.getQueryData(['risks', projectId]);
      qc.setQueryData(['risks', projectId], (old: any) =>
        old
          ? { ...old, alerts: old.alerts.filter((a: any) => a.id !== alertId) }
          : old,
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['risks', projectId], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['risks', projectId] });
    },
  });
};

// ── SIMULATIONS ───────────────────────────────────────────────────────────────

export const useRunWhatIf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, changes }: { projectId: string; changes: any[] }) =>
      api.runWhatIf(projectId, changes).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['simulation', data.simulation_id], data);
    },
  });
};

export const useRunStressTest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, scenarioIds }: { projectId: string; scenarioIds: string[] }) =>
      api.runStressTest(projectId, scenarioIds).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['stress-test', data.projectId], data);
    },
  });
};

export const useSimulationResult = (simulationId: string) =>
  useQuery({
    queryKey: ['simulation', simulationId],
    queryFn: () =>
      import('../../services/apiClient').then(({ apiClient }) =>
        apiClient.get(`/simulations/${simulationId}/results`).then((r) => r.data),
      ),
    enabled: !!simulationId,
    staleTime: Infinity, // simulation results are immutable
  });

// ── ANALYTICS ─────────────────────────────────────────────────────────────────

export const useEstimationStats = (projectId: string, days = 30) =>
  useQuery({
    queryKey: ['analytics', projectId, 'estimations', days],
    queryFn: () => api.getEstimationStats(projectId, days).then((r) => r.data),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });

export const useVelocityTrend = (projectId: string) =>
  useQuery({
    queryKey: ['analytics', projectId, 'velocity'],
    queryFn: () => api.getVelocityTrend(projectId).then((r) => r.data),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });

export const useRiskSummary = (projectId: string) =>
  useQuery({
    queryKey: ['analytics', projectId, 'risks'],
    queryFn: () => api.getRiskSummary(projectId).then((r) => r.data),
    enabled: !!projectId,
    staleTime: 2 * 60_000,
  });