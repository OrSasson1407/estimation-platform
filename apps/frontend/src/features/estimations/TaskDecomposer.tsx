// apps/frontend/src/features/estimations/TaskDecomposer.tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { api } from '../../services/apiClient';
import { fmtHours, fmtConfidence } from '../../utils/formatting';
import { calcConfidenceColor } from '../../utils/calculations';

interface EstimationResult {
  taskId: string;
  optimisticHours: number;
  expectedHours: number;
  pessimisticHours: number;
  confidenceScore: number;
  modelVersion: string;
  factorWeights: Record<string, number>;
  explanation: string;
  similarTaskIds: string[];
}

interface Props {
  teamId: string;
}

export default function TaskDecomposer({ teamId }: Props) {
  const [taskId, setTaskId] = useState('');

  const estimate = useMutation<EstimationResult, Error>({
    mutationFn: (): Promise<EstimationResult> =>
      api.generateEstimation(taskId, teamId).then((r: AxiosResponse) => r.data),
  });

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
      <h2 className="font-semibold text-slate-700">Task Estimator</h2>

      <div className="flex gap-2">
        <input
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          placeholder="Enter Task ID…"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => estimate.mutate()}
          disabled={!taskId || estimate.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {estimate.isPending ? 'Estimating…' : 'Estimate'}
        </button>
      </div>

      {estimate.data && (
        <div className="border border-slate-100 rounded-lg p-4 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 text-lg">
              {fmtHours(estimate.data.expectedHours)}
            </span>
            <span
              className={`text-sm font-medium ${calcConfidenceColor(estimate.data.confidenceScore)}`}
            >
              {fmtConfidence(estimate.data.confidenceScore)} confidence
            </span>
          </div>
          <div className="flex gap-4 text-xs text-slate-500">
            <span>Optimistic: {fmtHours(estimate.data.optimisticHours)}</span>
            <span>Pessimistic: {fmtHours(estimate.data.pessimisticHours)}</span>
          </div>
          <p className="text-sm text-slate-600 italic">{estimate.data.explanation}</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(estimate.data.factorWeights ?? {}).map(([k, v]) => (
              <span key={k} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">
                {k}: {(v * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {estimate.isError && (
        <p className="text-sm text-red-500">Failed to generate estimate. Check the task ID.</p>
      )}
    </div>
  );
}
