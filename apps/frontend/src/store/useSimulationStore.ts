// apps/frontend/src/store/useSimulationStore.ts  ← NEW
import { create } from 'zustand';

interface SimulationResult {
  simulationId: string;
  projectId: string;
  type: 'what-if' | 'stress-test' | 'portfolio';
  baselineDays?: number;
  projectedDays?: number;
  timelineDelta?: string;
  costDelta?: string;
  riskDelta?: string;
  survivalProbability?: number;
  selectedProjectIds?: string[];
  totalValue?: number;
  totalCost?: number;
  generatedAt: string;
}

interface SimulationState {
  results: SimulationResult[];
  currentSimulation: SimulationResult | null;
  setResults: (r: SimulationResult[]) => void;
  setCurrentSimulation: (s: SimulationResult | null) => void;
  addResult: (r: SimulationResult) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  results: [],
  currentSimulation: null,
  setResults: (results) => set({ results }),
  setCurrentSimulation: (currentSimulation) => set({ currentSimulation }),
  addResult: (result) =>
    set((s) => ({
      results: [result, ...s.results].slice(0, 20),
      currentSimulation: result,
    })),
}));
