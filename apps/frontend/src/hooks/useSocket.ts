// apps/frontend/src/hooks/useSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/useAuthStore';
import { useRiskStore } from '../store/useRiskStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3004';

// Exponential backoff: 1s → 2s → 4s → 8s → 16s (cap)
const backoffDelay = (attempt: number) => Math.min(1_000 * 2 ** attempt, 16_000);

interface PresenceUser {
  userId: string;
  name: string;
  avatarUrl?: string;
  joinedAt: string;
}

interface UseSocketReturn {
  isConnected: boolean;
  presenceUsers: PresenceUser[];
  emit: (event: string, data?: any) => void;
}

// Module-level singleton — one socket across all hook instances
let _socket: Socket | null = null;
let _reconnectAttempts = 0;
let _presenceUsers: PresenceUser[] = [];
const _presenceListeners = new Set<(users: PresenceUser[]) => void>();
const _connectionListeners = new Set<(connected: boolean) => void>();

function getOrCreateSocket(token: string): Socket {
  if (_socket?.connected) return _socket;

  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
  }

  _socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    // Reconnection handled manually for backoff control
    reconnection: false,
  });

  return _socket;
}

export function useSocket(projectId: string): UseSocketReturn {
  const token = useAuthStore((s) => s.token);
  const user  = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { addAlert } = useRiskStore();

  const isConnectedRef = useRef(false);
  const presenceRef    = useRef<PresenceUser[]>([]);

  // Stable emit helper
  const emit = useCallback((event: string, data?: any) => {
    _socket?.emit(event, data);
  }, []);

  useEffect(() => {
    if (!token || !projectId) return;

    const socket = getOrCreateSocket(token);

    // ── Connection lifecycle ───────────────────────────────────────────────
    const onConnect = () => {
      _reconnectAttempts = 0;
      isConnectedRef.current = true;
      _connectionListeners.forEach((l) => l(true));

      // Join project room with presence info
      socket.emit('project:join', {
        projectId,
        user: { userId: user?.userId, name: user?.email },
      });
    };

    const onDisconnect = (reason: string) => {
      isConnectedRef.current = false;
      _connectionListeners.forEach((l) => l(false));

      // Manual reconnection with backoff (excludes server-initiated disconnects)
      if (reason !== 'io server disconnect') {
        const delay = backoffDelay(_reconnectAttempts++);
        setTimeout(() => {
          if (!_socket?.connected) _socket?.connect();
        }, delay);
      }
    };

    const onConnectError = () => {
      const delay = backoffDelay(_reconnectAttempts++);
      setTimeout(() => {
        if (!_socket?.connected) _socket?.connect();
      }, delay);
    };

    // ── Real-time events ───────────────────────────────────────────────────
    const onEstimationUpdated = (data: { taskId: string; estimationId: string }) => {
      queryClient.invalidateQueries({ queryKey: ['estimations', data.taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    };

    const onRiskAlert = (data: any) => {
      addAlert(data);
      queryClient.invalidateQueries({ queryKey: ['risks', projectId] });
    };

    const onSprintRebalanced = () => {
      queryClient.invalidateQueries({ queryKey: ['sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
    };

    const onAnomalyDetected = (data: any) => {
      addAlert({ ...data, category: 'ANOMALY' });
      queryClient.invalidateQueries({ queryKey: ['risks', projectId] });
    };

    const onSimulationResult = (data: any) => {
      queryClient.setQueryData(['simulation', data.simulationId], data);
    };

    // ── Presence ───────────────────────────────────────────────────────────
    const onUserPresence = (users: PresenceUser[]) => {
      _presenceUsers = users;
      presenceRef.current = users;
      _presenceListeners.forEach((l) => l(users));
    };

    // Register all listeners
    socket.on('connect',              onConnect);
    socket.on('disconnect',           onDisconnect);
    socket.on('connect_error',        onConnectError);
    socket.on('estimation:updated',   onEstimationUpdated);
    socket.on('risk:alert',           onRiskAlert);
    socket.on('sprint:rebalanced',    onSprintRebalanced);
    socket.on('anomaly:detected',     onAnomalyDetected);
    socket.on('simulation:result',    onSimulationResult);
    socket.on('user:presence',        onUserPresence);

    if (!socket.connected) socket.connect();

    return () => {
      socket.emit('project:leave', { projectId });
      socket.off('connect',            onConnect);
      socket.off('disconnect',         onDisconnect);
      socket.off('connect_error',      onConnectError);
      socket.off('estimation:updated', onEstimationUpdated);
      socket.off('risk:alert',         onRiskAlert);
      socket.off('sprint:rebalanced',  onSprintRebalanced);
      socket.off('anomaly:detected',   onAnomalyDetected);
      socket.off('simulation:result',  onSimulationResult);
      socket.off('user:presence',      onUserPresence);
    };
  }, [token, projectId, user, queryClient, addAlert]);

  return {
    isConnected: isConnectedRef.current,
    presenceUsers: presenceRef.current,
    emit,
  };
}