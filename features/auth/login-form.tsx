"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { DemoLauncher } from "@/components/marketing/demo-launcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyErpSnapshot, login } from "@/lib/erp-api";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore } from "@/store/useSessionStore";

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!email.includes("@") || password.length < 12) {
      setError("Enter your work email and a password with at least 12 characters.");
      return;
    }
    setPending(true);
    try {
      const response = await login(email.trim(), password);
      queryClient.setQueryData(["auth-me"], response);
      useSessionStore.getState().setUser(response.user);
      useErpStore.setState(emptyErpSnapshot(response.user));
      const next = searchParams.get("next");
      router.push(next?.startsWith("/app/") ? next : "/app/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Check your details and try again.");
      setPending(false);
    }
  };
  return (
    <div className="w-full">
      <div className="mb-7"><h1 className="text-3xl font-semibold tracking-tight">Sign in to your workspace</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Access your organization’s purchasing, inventory, orders, collections, and accounting records.</p></div>
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="login-email">Work email</Label><Input id="login-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="login-password">Password</Label><a href="mailto:support@nexusledger.com?subject=Password%20reset" className="text-xs text-primary hover:underline">Forgot password?</a></div><div className="relative"><Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="pr-10" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in to workspace"}<ArrowRight /></Button>
      </form>
      <div className="my-6 border-t border-slate-200" />
      <Button asChild variant="outline" size="lg" className="w-full"><Link href="/register">Create your organization<ArrowRight /></Link></Button>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-slate-200" />or evaluate first<span className="h-px flex-1 bg-slate-200" /></div>
      <DemoLauncher className="w-full">Explore the interactive demo</DemoLauncher>
      <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Passwords are used only to authenticate with the server and are never stored in browser storage.</p>
    </div>
  );
}
