import { Injectable } from '@nestjs/common';

@Injectable()
export class RiskService {
  async handleTaskEvent(eventPayload: any) {
    console.log('Analyzing event for risk anomalies:', eventPayload);
    return this.evaluateRisk(eventPayload.projectId);
  }

  async evaluateRisk(projectId: string) {
    return {
      projectId,
      riskLevel: 'HIGH',
      anomaliesDetected: [
        { type: 'TIME_DRIFT', description: 'Task 123 is 40% over estimated time.' },
        { type: 'BURNOUT_WARNING', description: 'Assigned developer load is at 95%.' },
      ],
      timestamp: new Date().toISOString(),
    };
  }

  async getProjectRisks(projectId: string) {
    return this.evaluateRisk(projectId);
  }
}
