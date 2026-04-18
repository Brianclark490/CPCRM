import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export interface RenderWithQueryOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export interface RenderWithQueryResult extends RenderResult {
  queryClient: QueryClient;
}

export function renderWithQuery(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...options }: RenderWithQueryOptions = {},
): RenderWithQueryResult {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  };
}
