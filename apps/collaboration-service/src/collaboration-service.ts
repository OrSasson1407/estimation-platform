import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';
import { CollaborationGateway } from './collaboration.gateway';

@Injectable()
export class CollaborationService implements OnModuleInit, OnModuleDestroy {
  private subscriber;

  constructor(private readonly gateway: CollaborationGateway) {
    this.subscriber = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  }

  async onModuleInit() {
    await this.subscriber.connect();

    await this.subscriber.pSubscribe('estimation.*', (message: string, channel: string) => {
      const payload = JSON.parse(message);
      if (payload.projectId) {
        this.gateway.server.to(`project:${payload.projectId}`).emit(channel, payload);
      }
    });
  }

  async onModuleDestroy() {
    await this.subscriber.quit();
  }
}

