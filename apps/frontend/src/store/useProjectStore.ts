// apps/frontend/src/store/useProjectStore.ts  ← NEW
import { create } from 'zustand';

interface Task {
  id: string;
  externalId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  storyPoints?: number;
  complexityScore: number;
}

interface Sprint {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
}

interface ProjectState {
  currentProject: Project | null;
  tasks: Task[];
  sprints: Sprint[];
  isLoading: boolean;
  setProject: (p: Project) => void;
  setTasks: (t: Task[]) => void;
  setSprints: (s: Sprint[]) => void;
  updateTaskStatus: (taskId: string, status: string) => void;
  setLoading: (v: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  tasks: [],
  sprints: [],
  isLoading: false,
  setProject: (currentProject) => set({ currentProject }),
  setTasks: (tasks) => set({ tasks }),
  setSprints: (sprints) => set({ sprints }),
  updateTaskStatus: (taskId, status) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
