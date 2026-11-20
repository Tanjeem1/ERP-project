"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { emptyErpSnapshot, getAuthMe, loadErpSnapshot } from "@/lib/erp-api";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore, type SessionUser } from "@/store/useSessionStore";

function WorkspaceLoading() {
  return <div role="status" aria-label="Loading ERP workspace" className="space-y-6"><Skeleton className="h-20" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}</div><Skeleton className="h-[480px]" /></div>;
}

function LoadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="mx-auto max-w-lg rounded-lg border bg-card p-8 text-center"><h2 className="text-xl font-semibold tracking-tight">The workspace could not be loaded</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{error instanceof Error ? error.message : "Check the API connection and try again."}</p><Button className="mt-6" onClick={retry}>Retry connection</Button></div>;
}

function ErpDataProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const ready = useErpStore((state) => state.ready);
  const query = useQuery({
    queryKey: ["erp-bootstrap", user.organization.id, user.role],
    queryFn: () => loadErpSnapshot(user),
    staleTime: 5000,
    retry: 1,
  });
  useEffect(() => {
    useErpStore.setState({ ...emptyErpSnapshot(user), ready: false, loadError: null });
    return () => { useErpStore.setState(emptyErpSnapshot(user)); };
  }, [user]);
  useEffect(() => {
    if (query.data) useErpStore.setState({ ...query.data, ready: true, loadError: null });
  }, [query.data]);
  useEffect(() => {
    if (query.error) useErpStore.setState({ ready: true, loadError: query.error instanceof Error ? query.error.message : "Unable to load workspace data." });
  }, [query.error]);
  if (query.isLoading || !ready) return <WorkspaceLoading />;
  if (query.isError) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  return children;
}

function ErpSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useSessionStore((state) => state.user);
  const loaded = useSessionStore((state) => state.loaded);
  const query = useQuery({ queryKey: ["auth-me"], queryFn: getAuthMe, retry: false, staleTime: Infinity });
  useEffect(() => {
    if (query.data) useSessionStore.getState().setUser(query.data.user);
    if (query.error) {
      useSessionStore.getState().clearUser();
      if (!(query.error instanceof ApiError && query.error.status === 401)) useSessionStore.setState({ user: null, loaded: true });
    }
  }, [query.data, query.error]);
  useEffect(() => {
    const handleUnauthorized = () => {
      useSessionStore.getState().clearUser();
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    };
    window.addEventListener("nexusledger:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("nexusledger:unauthorized", handleUnauthorized);
  }, [pathname, router]);
  if (query.isLoading || !loaded) return <WorkspaceLoading />;
  if (query.isError && !(query.error instanceof ApiError && query.error.status === 401)) return <LoadFailure error={query.error} retry={() => void query.refetch()} />;
  if (!user) return <LoginRedirect />;
  return <ErpDataProvider user={user}>{children}</ErpDataProvider>;
}

function LoginRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [pathname, router]);
  return <WorkspaceLoading />;
}

export function WorkspaceProviders({ children }: { children: ReactNode }) {
  return <ErpSessionProvider>{children}</ErpSessionProvider>;
}
