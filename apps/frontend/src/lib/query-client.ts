// apps/frontend/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 30s — avoids redundant refetches on tab focus
      staleTime: 30_000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1_000,
      // Retry once with exponential backoff, skip on 4xx client errors
      retry: (failureCount, error: any) => {
        if (error?.response?.status >= 400 && error?.response?.status < 500) return false;
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      // Refetch on window focus for risk alerts & live data
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});