// apps/frontend/src/store/useEstimationStore.ts  ← COMPLETE
import { create } from 'zustand';

interface Estimation {
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

interface EstimationState {
  currentEstimates: Estimation[];
  setEstimates: (e: Estimation[]) => void;
  addEstimate: (e: Estimation) => void;
  clearEstimates: () => void;
}

export const useEstimationStore = create<EstimationState>((set) => ({
  currentEstimates: [],
  setEstimates: (currentEstimates) => set({ currentEstimates }),
  addEstimate: (estimate) =>
    set((s) => ({
      currentEstimates: [estimate, ...s.currentEstimates].slice(0, 10), // keep last 10
    })),
  clearEstimates: () => set({ currentEstimates: [] }),
}));
