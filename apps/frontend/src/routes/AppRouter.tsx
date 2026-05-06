// apps/frontend/src/routes/AppRouter.tsx  ← NEW
import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const EstimationDashboard = lazy(() => import('../features/estimations/EstimationDashboard'));
const ProjectBoard = lazy(() => import('../features/projects/ProjectBoard'));
const DeveloperProfile = lazy(() => import('../features/developers/DeveloperProfile'));
const RiskRadar = lazy(() => import('../features/risks/RiskRadar'));
const TeamBuilder = lazy(() => import('../features/projects/TeamBuilder'));
const LoginPage = lazy(() => import('../features/auth/LoginPage'));

const Spinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
  </div>
);

export const AppRouter = () => (
  <BrowserRouter>
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects/:projectId" element={<ProjectBoard />} />
          <Route path="/projects/:projectId/estimations" element={<EstimationDashboard />} />
          <Route path="/projects/:projectId/risks" element={<RiskRadar />} />
          <Route path="/projects/:projectId/team" element={<TeamBuilder />} />
          <Route path="/developers/:developerId" element={<DeveloperProfile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);
