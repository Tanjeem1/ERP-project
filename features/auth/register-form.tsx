"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptTeamInvitation } from "@/lib/erp-api";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore } from "@/store/useSessionStore";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/types/erp";

const standardTimezones = ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Dhaka", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "UTC"];

export function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const registerOrganization = useErpStore((state) => state.registerOrganization);
  const invitationToken = searchParams.get("invitation") ?? "";
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>("USD");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [contactEmail, setContactEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = searchParams.get("plan") ?? "demo";
  const timezones = [...new Set([timezone, ...standardTimezones])];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!invitationToken && (!legalName.trim() || !displayName.trim() || !taxId.trim() || !contactEmail.includes("@"))) {
      setError("Complete your company name, Tax/VAT ID, and a valid work email.");
      return;
    }
    if (!fullName.trim()) {
      setError("Enter your full name.");
      return;
    }
    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }
    if (!accepted) {
      setError("Accept the terms and data-processing notice to continue.");
      return;
    }
    setPending(true);
    try {
      const user = invitationToken
        ? (await acceptTeamInvitation({ token: invitationToken, password, fullName })).user
        : await (async () => {
          await registerOrganization({ legalName, displayName, taxId, baseCurrency, timezone, invoiceFooterNote: "Please include the invoice number with your remittance.", currencyConversionRate: 1, contactEmail, password, fullName });
          const registeredUser = useSessionStore.getState().user;
          if (!registeredUser) throw new Error("Your organization was created, but the session could not be loaded. Sign in to continue.");
          return registeredUser;
        })();
      if (invitationToken) useSessionStore.getState().setUser(user);
      queryClient.setQueryData(["auth-me"], { user, organization: user.organization });
      router.push("/app/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : invitationToken ? "Unable to accept this invitation." : "Unable to create this organization.");
      setPending(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-7">
        <h1 className="text-3xl font-semibold tracking-tight">{invitationToken ? "Accept your team invitation" : "Set up your organization"}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{invitationToken ? "Create your password to join the organization that invited you. Your administrator has already assigned your role." : "Configure your company, base currency, and local collection timezone. Your records will be stored securely in PostgreSQL."}</p>
        {!invitationToken ? <p className="mt-3 text-xs capitalize text-muted-foreground">Selected plan: {plan}</p> : null}
      </div>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
        {!invitationToken ? <>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="register-legal-name">Company / Organization Name</Label><Input id="register-legal-name" autoComplete="organization" required value={legalName} onChange={(event) => setLegalName(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="register-display-name">Trading name</Label><Input id="register-display-name" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="register-tax">Tax / VAT ID</Label><Input id="register-tax" required value={taxId} onChange={(event) => setTaxId(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="register-currency">Base currency</Label><select id="register-currency" value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value as CurrencyCode)} className="h-10 w-full rounded-md border border-slate-200 bg-card px-3 text-sm">{SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="register-timezone">Local timezone</Label><select id="register-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-card px-3 text-sm">{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="register-email">Work email</Label><Input id="register-email" type="email" autoComplete="email" required value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></div>
        </> : null}
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="register-full-name">Your full name</Label><Input id="register-full-name" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="register-password">Password</Label><Input id="register-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} /><p className="text-xs text-muted-foreground">Use at least 12 characters. Your password is hashed by the server.</p></div>
        <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground sm:col-span-2"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 size-3.5 accent-primary" /><span>I agree to the <Link href="/terms" className="text-primary hover:underline">terms</Link> and <Link href="/privacy" className="text-primary hover:underline">data-processing notice</Link>.</span></label>
        {error ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        <Button type="submit" size="lg" className="sm:col-span-2" disabled={pending}>{pending ? invitationToken ? "Joining organization…" : "Creating organization…" : invitationToken ? "Accept invitation and open workspace" : "Create organization and open workspace"}<ArrowRight /></Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></p>
    </div>
  );
}
