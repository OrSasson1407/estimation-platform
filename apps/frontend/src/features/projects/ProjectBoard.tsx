// apps/frontend/src/features/projects/ProjectBoard.tsx  ← NEW: complete implementation with task status update
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { api, apiClient } from '../../services/apiClient';
import { useRealTimeUpdates } from '../../hooks/useRealTimeUpdates';
import { fmtHours, fmtPriority, fmtStatus } from '../../utils/formatting';
import { useGenerateEstimation } from '../../hooks/useEstimations';

const STATUS_COLS = ['BACKLOG', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

const priorityBadge: Record<string, string> = {
  LOW: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export default function ProjectBoard() {
  const { projectId = '' } = useParams();
  useRealTimeUpdates(projectId);
  const queryClient = useQueryClient();
  const generateEstimation = useGenerateEstimation();

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: (): Promise<any> => api.getProject(projectId).then((r: AxiosResponse) => r.data),
    enabled: !!projectId,
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: (): Promise<any> => api.getProjectTasks(projectId).then((r: AxiosResponse) => r.data),
    enabled: !!projectId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      apiClient.patch(`/projects/tasks/${taskId}/status`, { status, changedBy: 'user-123' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', projectId] }),
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );

  const tasksByStatus = STATUS_COLS.reduce(
    (acc, s) => {
      acc[s] = (tasks as any[]).filter((t) => t.status === s);
      return acc;
    },
    {} as Record<string, any[]>,
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project?.name ?? 'Project Board'}</h1>
          {project?.description && (
            <p className="text-slate-500 text-sm mt-1">{project.description}</p>
          )}
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            project?.status === 'ACTIVE'
              ? 'bg-green-100 text-green-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {project?.status}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4 overflow-x-auto">
        {STATUS_COLS.map((col) => (
          <div key={col} className="bg-slate-50 rounded-xl p-3 min-h-64">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-slate-600 uppercase tracking-wide">
                {fmtStatus(col)}
              </h3>
              <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">
                {tasksByStatus[col]?.length ?? 0}
              </span>
            </div>
            <div className="space-y-2">
              {tasksByStatus[col]?.map((task: any) => (
                <div
                  key={task.id}
                  className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm space-y-2 cursor-move hover:shadow-md transition-shadow"
                  draggable
                  onDragEnd={() => {
                    const nextStatuses = STATUS_COLS.slice(STATUS_COLS.indexOf(col) + 1);
                    if (nextStatuses.length > 0) {
                      updateStatus.mutate({ taskId: task.id, status: nextStatuses[0] });
                    }
                  }}
                >
                  <p className="text-sm font-medium text-slate-800 leading-snug">{task.title}</p>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityBadge[task.priority] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {task.priority}
                    </span>
                    {task.storyPoints && (
                      <span className="text-xs text-slate-400">{task.storyPoints} pts</span>
                    )}
                  </div>
                  {task.estimations?.[0] && (
                    <p className="text-xs text-blue-600 font-medium">
                      Est: {fmtHours(task.estimations[0].expectedHours)}
                    </p>
                  )}
                  {!task.estimations?.length && (
                    <button
                      onClick={() =>
                        generateEstimation.mutate({ taskId: task.id, teamId: projectId })
                      }
                      disabled={generateEstimation.isPending}
                      className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                    >
                      {generateEstimation.isPending ? 'Estimating…' : '+ Estimate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
