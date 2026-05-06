// apps/frontend/src/hooks/useRealTimeUpdates.ts  ← NEW
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { joinProjectRoom, leaveProjectRoom, getSocket } from '../services/socket';
import { useProjectStore } from '../store/useProjectStore';

export const useRealTimeUpdates = (projectId: string) => {
  const queryClient = useQueryClient();
  const { updateTaskStatus } = useProjectStore();

  useEffect(() => {
    if (!projectId) return;

    joinProjectRoom(projectId);
    const socket = getSocket();

    // Estimation updated → refresh estimation query
    socket.on('estimation:updated', (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['estimations', data.taskId] });
    });

    // Risk alert → refresh risk query
    socket.on('risk:alert', () => {
      queryClient.invalidateQueries({ queryKey: ['risks', projectId] });
    });

    // Sprint rebalanced → refresh sprint/task queries
    socket.on('sprint:rebalanced', () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    });

    // Simulation result
    socket.on('simulation:result', (data: any) => {
      queryClient.setQueryData(['simulation', data.simulationId], data);
    });

    // Anomaly detected → refresh risks
    socket.on('anomaly:detected', () => {
      queryClient.invalidateQueries({ queryKey: ['risks', projectId] });
    });

    return () => {
      socket.off('estimation:updated');
      socket.off('risk:alert');
      socket.off('sprint:rebalanced');
      socket.off('simulation:result');
      socket.off('anomaly:detected');
      leaveProjectRoom(projectId);
    };
  }, [projectId, queryClient, updateTaskStatus]);
};
