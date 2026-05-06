// apps/frontend/src/services/apiClient.ts  ← NEW
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ── Typed API helpers ─────────────────────────────────────────────────────────
export const api = {
  // Estimations
  generateEstimation: (taskId: string, teamId: string, sprintId?: string) =>
    apiClient.post('/estimations/generate', { taskId, teamId, sprintId }),
  getEstimation: (id: string) => apiClient.get(`/estimations/${id}`),
  getExplanation: (id: string) => apiClient.get(`/estimations/${id}/explanation`),
  overrideEstimation: (id: string, hours: number, reason: string) =>
    apiClient.patch(`/estimations/${id}/override`, { hours, reason }),
  bulkEstimate: (taskIds: string[], teamId: string) =>
    apiClient.post('/estimations/bulk', { taskIds, teamId }),

  // Projects
  getProject: (id: string) => apiClient.get(`/projects/${id}`),
  getProjectTasks: (id: string) => apiClient.get(`/projects/${id}/tasks`),
  createTask: (projectId: string, data: any) =>
    apiClient.post(`/projects/${projectId}/tasks`, data),
  getProjectSprints: (id: string) => apiClient.get(`/projects/${id}/sprints`),
  completeSprint: (projectId: string, sprintId: string) =>
    apiClient.post(`/projects/${projectId}/sprints/${sprintId}/complete`),

  // Developers
  getDeveloperProfile: (id: string) => apiClient.get(`/developers/${id}/profile`),
  getVelocityHistory: (id: string, from?: string, to?: string) =>
    apiClient.get(`/developers/${id}/velocity-history`, { params: { from, to } }),
  getTeamCompositionScore: (teamId: string) =>
    apiClient.get(`/developers/team/${teamId}/composition-score`),

  // Risks
  getProjectRisks: (projectId: string) => apiClient.get(`/risks/project/${projectId}`),
  resolveAlert: (alertId: string) => apiClient.patch(`/risks/alerts/${alertId}/resolve`),

  // Simulations
  runWhatIf: (projectId: string, changes: any[], context?: any) =>
    apiClient.post('/simulations/what-if', { projectId, changes, context }),
  runStressTest: (projectId: string, scenarioIds: string[], context?: any) =>
    apiClient.post('/simulations/stress-test', { projectId, scenarioIds, context }),

  // Analytics
  getEstimationStats: (projectId: string, days = 30) =>
    apiClient.get(`/analytics/projects/${projectId}/estimations`, { params: { days } }),
  getVelocityTrend: (projectId: string) =>
    apiClient.get(`/analytics/projects/${projectId}/velocity`),
  getRiskSummary: (projectId: string) => apiClient.get(`/analytics/projects/${projectId}/risks`),
};
