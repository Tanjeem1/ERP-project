"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  }));
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="nexusledger-theme">
      <QueryClientProvider client={queryClient}>{children}<Toaster /></QueryClientProvider>
    </ThemeProvider>
  );
}
