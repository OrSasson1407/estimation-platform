// apps/frontend/src/services/socket.ts  ← NEW
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/useAuthStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3004';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const token = useAuthStore.getState().token;
    socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
    });

    socket.on('connect', () => console.log('WS connected:', socket?.id));
    socket.on('disconnect', (reason) => console.warn('WS disconnected:', reason));
    socket.on('connect_error', (err) => console.error('WS error:', err.message));
  }
  return socket;
};

export const joinProjectRoom = (projectId: string) => {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit('project:join', { projectId });
};

export const leaveProjectRoom = (projectId: string) => {
  socket?.emit('project:leave', { projectId });
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
