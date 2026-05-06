// apps/frontend/src/hooks/useEstimations.ts  ← NEW
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/apiClient';
import { useEstimationStore } from '../store/useEstimationStore';

export const useGenerateEstimation = () => {
  const queryClient = useQueryClient();
  const { setEstimates } = useEstimationStore();

  return useMutation({
    mutationFn: ({
      taskId,
      teamId,
      sprintId,
    }: {
      taskId: string;
      teamId: string;
      sprintId?: string;
    }) => api.generateEstimation(taskId, teamId, sprintId).then((r) => r.data),
    onSuccess: (data) => {
      setEstimates([data]);
      queryClient.invalidateQueries({ queryKey: ['estimations'] });
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
  });

export const useOverrideEstimation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hours, reason }: { id: string; hours: number; reason: string }) =>
      api.overrideEstimation(id, hours, reason).then((r) => r.data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['estimations', id] });
    },
  });
};
