// apps/frontend/src/store/useRiskStore.ts  ← NEW
import { create } from 'zustand';

interface RiskAlert {
  id: string;
  projectId: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  resolved: boolean;
  createdAt: string;
}

interface RiskState {
  activeAlerts: RiskAlert[];
  setAlerts: (a: RiskAlert[]) => void;
  addAlert: (a: RiskAlert) => void;
  markResolved: (alertId: string) => void;
}

export const useRiskStore = create<RiskState>((set) => ({
  activeAlerts: [],
  setAlerts: (activeAlerts) => set({ activeAlerts }),
  addAlert: (alert) =>
    set((s) => ({
      activeAlerts: [alert, ...s.activeAlerts].filter((a) => !a.resolved),
    })),
  markResolved: (alertId) =>
    set((s) => ({
      activeAlerts: s.activeAlerts.filter((a) => a.id !== alertId),
    })),
}));
