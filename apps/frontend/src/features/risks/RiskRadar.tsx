// apps/frontend/src/features/risks/RiskRadar.tsx  ← NEW
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/apiClient';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import { fmtRelative } from '../../utils/formatting';
import type { AxiosResponse } from 'axios';

const severityStyles: Record<string, string> = {
  LOW: 'border-green-200 bg-green-50',
  MEDIUM: 'border-yellow-200 bg-yellow-50',
  HIGH: 'border-orange-200 bg-orange-50',
  CRITICAL: 'border-red-200 bg-red-50',
};
const severityBadge: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export default function RiskRadar() {
  const { projectId = '' } = useParams();
  useRealTimeUpdates(projectId);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['risks', projectId],
    queryFn: (): Promise<any> => api.getProjectRisks(projectId).then((r: AxiosResponse) => r.data),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: (alertId: string) => api.resolveAlert(alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['risks', projectId] }),
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );

  const alerts: any[] = data?.alerts ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Risk Radar</h1>
        <span className="text-sm text-slate-500">
          {data?.totalActiveAlerts ?? 0} active alert{data?.totalActiveAlerts !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Severity summary */}
      {data?.severityCounts && (
        <div className="grid grid-cols-4 gap-3">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((s) => (
            <div key={s} className={`rounded-xl border p-3 text-center ${severityStyles[s]}`}>
              <p className="text-2xl font-bold">{data.severityCounts[s] ?? 0}</p>
              <p className="text-xs font-medium mt-1">{s}</p>
            </div>
          ))}
        </div>
      )}

      {/* Alert list */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-lg">✅ No active risks</p>
            <p className="text-sm mt-1">All clear for this project.</p>
          </div>
        ) : (
          alerts.map((alert: any) => (
            <div
              key={alert.id}
              className={`rounded-xl border p-4 ${severityStyles[alert.severity]}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityBadge[alert.severity]}`}
                    >
                      {alert.severity}
                    </span>
                    <span className="text-xs text-slate-500">
                      {alert.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800">{alert.title}</p>
                  <p className="text-sm text-slate-600">{alert.description}</p>
                  <p className="text-xs text-slate-400">{fmtRelative(alert.createdAt)}</p>
                </div>
                <button
                  onClick={() => resolve.mutate(alert.id)}
                  disabled={resolve.isPending}
                  className="text-xs text-slate-500 hover:text-slate-700 border border-slate-300 rounded px-2 py-1 transition-colors shrink-0"
                >
                  Resolve
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
