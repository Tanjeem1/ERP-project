"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { emptyErpSnapshot, startDemo } from "@/lib/erp-api";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore } from "@/store/useSessionStore";

export function DemoLauncher({ className, children = "Launch Interactive ERP Demo" }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const launch = async () => {
    setPending(true);
    try {
      const response = await startDemo();
      queryClient.setQueryData(["auth-me"], response);
      useSessionStore.getState().setUser(response.user);
      useErpStore.setState({ ...emptyErpSnapshot(response.user), ready: false, loadError: null });
      router.push("/app/dashboard");
    } catch (error) {
      toast.error("Unable to open the interactive demo", { description: error instanceof Error ? error.message : "Check the API connection and try again." });
      setPending(false);
    }
  };
  return <Button variant="mint" className={className} disabled={pending} onClick={() => void launch()}>{pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}{pending ? "Preparing your demo…" : children}</Button>;
}
