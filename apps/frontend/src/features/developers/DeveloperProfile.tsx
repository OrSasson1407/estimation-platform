// apps/frontend/src/features/developers/DeveloperProfile.tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../services/apiClient';
import { fmtHours, fmtConfidence } from '../../utils/formatting';
import { calcBurnoutColor } from '../../utils/calculations';
import type { AxiosResponse } from 'axios';

export default function DeveloperProfile() {
  const { developerId = '' } = useParams();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['developer', developerId],
    queryFn: (): Promise<any> =>
      api.getDeveloperProfile(developerId).then((r: AxiosResponse) => r.data),
    enabled: !!developerId,
  });

  const { data: velocity } = useQuery({
    queryKey: ['developer', developerId, 'velocity'],
    queryFn: (): Promise<any> =>
      api.getVelocityHistory(developerId).then((r: AxiosResponse) => r.data),
    enabled: !!developerId,
  });

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );

  if (!profile) return <div className="p-6 text-slate-500">Developer not found.</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{profile.name}</h1>
            <p className="text-slate-500 text-sm">{profile.email}</p>
            <p className="text-slate-400 text-xs mt-1">{profile.role}</p>
          </div>
          <span className={`text-sm font-semibold ${calcBurnoutColor(profile.burnoutRisk)}`}>
            Burnout: {profile.burnoutRisk}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">
              {fmtConfidence(profile.estimationAcc)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Estimation Accuracy</p>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-700">{fmtHours(profile.avgTaskDuration)}</p>
            <p className="text-xs text-slate-500 mt-1">Avg per Story Point</p>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-700">{profile.cognitiveLoad}%</p>
            <p className="text-xs text-slate-500 mt-1">Cognitive Load</p>
          </div>
        </div>

        {profile.skills?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.skills.map((s: any) => (
              <span
                key={s.skill}
                className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full"
              >
                {s.skill} (L{s.level})
              </span>
            ))}
          </div>
        )}
      </div>

      {velocity?.history?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">Velocity History</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={velocity.history}>
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="completedPoints"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
