import { create } from 'zustand';

interface EstimationState {
  currentEstimates: any[];
  isLoading: boolean;
  setEstimates: (estimates: any[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useEstimationStore = create<EstimationState>((set) => ({
  currentEstimates: [],
  isLoading: false, // Changed from 'False' to 'false'
  setEstimates: (estimates) => set({ currentEstimates: estimates }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
