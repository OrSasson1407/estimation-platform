import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || '*',
  },
})
export class CollaborationGateway {
  // FIX: Added '!' to tell TS the decorator will assign this
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('project:join')
  handleJoinProject(@MessageBody() data: { projectId: string }, @ConnectedSocket() client: Socket) {
    const room = `project:${data.projectId}`;
    client.join(room);
    console.log(`Client ${client.id} joined ${room}`);

    this.server.to(room).emit('user:presence', {
      userId: client.data?.userId || 'anonymous',
      status: 'online',
    });
  }

  @SubscribeMessage('estimation:request')
  handleEstimationRequest(@MessageBody() data: { taskId: string; teamId: string }) {
    console.log(`Estimation requested for task ${data.taskId}`);
  }
}
