// apps/frontend/src/App.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './lib/query-client';
import { AppRouter } from './routes/AppRouter';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      {/* DevTools only bundled in development — tree-shaken in production build */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />}
    </QueryClientProvider>
  );
}