// apps/frontend/src/features/projects/TeamBuilder.tsx
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import { api } from '../../services/apiClient';
import { fmtConfidence } from '../../utils/formatting';

export default function TeamBuilder() {
  const { projectId = '' } = useParams();

  const { data: composition } = useQuery<any>({
    queryKey: ['team-composition', projectId],
    queryFn: (): Promise<any> =>
      api.getTeamCompositionScore(projectId).then((r: AxiosResponse) => r.data),
    enabled: !!projectId,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Team Builder</h1>

      {composition && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-700 mb-4">Current Team Analysis</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Synergy Score" value={fmtConfidence(composition.synergyScore)} />
            <Stat label="Skill Coverage" value={fmtConfidence(composition.skillCoverage)} />
            <Stat
              label="Single Points of Failure"
              value={String(composition.singlePointsOfFailure)}
            />
            <Stat label="Predicted Velocity" value={`${composition.predictedVelocity} pts`} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm text-center text-slate-400 py-12">
        <p>Select developers from the project roster to simulate team compositions.</p>
        <p className="text-sm mt-1">
          Team simulation will show predicted velocity, risk factors, and bottleneck warnings.
        </p>
      </div>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="text-center p-3 bg-slate-50 rounded-lg">
    <p className="text-xl font-bold text-slate-800">{value}</p>
    <p className="text-xs text-slate-500 mt-1">{label}</p>
  </div>
);
