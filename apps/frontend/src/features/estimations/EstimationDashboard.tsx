// apps/frontend/src/features/estimations/EstimationDashboard.tsx  ← NEW
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../../services/apiClient';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import { fmtHours, fmtConfidence, fmtDate } from '../../utils/formatting';
import { calcConfidenceColor, calcConfidenceLabel } from '../../utils/calculations';
import { useEstimationStore } from '../../store/useEstimationStore';

export default function EstimationDashboard() {
  const { projectId = '' } = useParams();
  useRealTimeUpdates(projectId);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics', 'estimations', projectId],
    queryFn: () => api.getEstimationStats(projectId).then((r) => r.data),
    enabled: !!projectId,
  });

  const { currentEstimates } = useEstimationStore();

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Estimation Dashboard</h1>

      {/* Weekly estimation trend */}
      {Array.isArray(stats) && stats.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">Weekly Estimation Volume</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tickFormatter={(v) => fmtDate(v)} />
              <YAxis />
              <Tooltip
                formatter={(v: number, name: string) => (name === 'avg_hours' ? fmtHours(v) : v)}
              />
              <Bar dataKey="total_estimates" fill="#3b82f6" name="Estimates" />
              <Bar dataKey="avg_hours" fill="#10b981" name="Avg Hours" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Live estimation cards */}
      {currentEstimates.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-slate-700">Latest Estimates</h2>
          {currentEstimates.map((est: any, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-slate-800">Task: {est.taskId}</p>
                <p className="text-sm text-slate-500">{est.explanation}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-lg font-bold text-slate-900">{fmtHours(est.expectedHours)}</p>
                <p className={`text-sm font-medium ${calcConfidenceColor(est.confidenceScore)}`}>
                  {calcConfidenceLabel(est.confidenceScore)} confidence (
                  {fmtConfidence(est.confidenceScore)})
                </p>
                <p className="text-xs text-slate-400">
                  {fmtHours(est.optimisticHours)} – {fmtHours(est.pessimisticHours)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading &&
        (!Array.isArray(stats) || stats.length === 0) &&
        currentEstimates.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-lg">No estimation data yet for this project.</p>
            <p className="text-sm mt-1">Generate your first estimate from the Project Board.</p>
          </div>
        )}
    </div>
  );
}
