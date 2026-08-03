import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Retry once on transient failures (network, 5xx). Never retry a 4xx —
      // 404/403/401 are permanent for the given request, so retrying just
      // multiplies the visible failure noise and delays showing an error UI.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

export { queryClient };
