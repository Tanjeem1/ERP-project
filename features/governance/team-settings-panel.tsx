"use client";

import { useQuery } from "@tanstack/react-query";
import { MailPlus, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTeamSettings, inviteTeamMember, revokeTeamInvitation, updateTeamRole } from "@/lib/erp-api";
import { useErpStore } from "@/store/useErpStore";
import { useSessionStore } from "@/store/useSessionStore";
import type { UserRole } from "@/types/erp";

const roles: UserRole[] = ["Super Admin", "Accountant", "Warehouse Manager", "Sales Officer"];
const roleLabels: Record<string, string> = { SUPER_ADMIN: "Super Admin", ACCOUNTANT: "Accountant", WAREHOUSE_MANAGER: "Warehouse Manager", SALES_OFFICER: "Sales Officer" };

export function TeamSettingsPanel() {
  const activeRole = useErpStore((state) => state.activeRole);
  const currentUser = useSessionStore((state) => state.user);
  const organizationId = useErpStore((state) => state.organization.id);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("Accountant");
  const [pending, setPending] = useState(false);
  const query = useQuery({ queryKey: ["team-settings", organizationId], queryFn: getTeamSettings, enabled: activeRole === "Super Admin" });
  const members = query.data?.members ?? [];
  const invitations = query.data?.invitations ?? [];
  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await inviteTeamMember(email, role);
      setEmail("");
      await query.refetch();
      toast.success("Team invitation created", { description: "The invitation email includes a secure acceptance link." });
    } catch (error) {
      toast.error("Unable to invite team member", { description: error instanceof Error ? error.message : "Try again." });
    } finally { setPending(false); }
  };
  const changeRole = async (userId: string, nextRole: UserRole) => {
    setPending(true);
    try {
      await updateTeamRole(userId, nextRole);
      await query.refetch();
      toast.success("Team role updated", { description: "The member’s previous access tokens have been invalidated." });
    } catch (error) {
      toast.error("Unable to change team role", { description: error instanceof Error ? error.message : "Try again." });
    } finally { setPending(false); }
  };
  const revoke = async (invitationId: string) => {
    setPending(true);
    try {
      await revokeTeamInvitation(invitationId);
      await query.refetch();
      toast.success("Invitation revoked");
    } catch (error) {
      toast.error("Unable to revoke invitation", { description: error instanceof Error ? error.message : "Try again." });
    } finally { setPending(false); }
  };
  if (activeRole !== "Super Admin") return <Card><CardContent className="p-6 text-sm text-muted-foreground">Team administration requires the Super Admin role.</CardContent></Card>;
  if (query.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Loading team members and invitations…</CardContent></Card>;
  if (query.isError) return <Card><CardContent className="p-6 text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Unable to load team settings."}</CardContent></Card>;
  return (
    <div className="space-y-5">
      <Card><CardHeader className="border-b"><CardTitle className="text-sm">Invite a team member</CardTitle><CardDescription>Invitations expire after seven days and are accepted through the registration page.</CardDescription></CardHeader><CardContent><form onSubmit={(event) => void invite(event)} className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="team-email">Work email</Label><Input id="team-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="team-role">Role</Label><select id="team-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="h-10 w-full rounded-md border bg-card px-3 text-sm">{roles.map((item) => <option key={item}>{item}</option>)}</select></div><Button type="submit" disabled={pending}><MailPlus />Send invitation</Button></form></CardContent></Card>
      <Card><CardHeader className="border-b"><CardTitle className="text-sm">Members and access roles</CardTitle><CardDescription>Role changes revoke the member’s cached identity and previous tokens.</CardDescription></CardHeader><div className="divide-y">{members.map((member) => <div key={member.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><UserRoundCog className="size-4 shrink-0 text-primary" /><div className="flex-1"><p className="text-sm font-medium">{member.fullName || member.email}</p><p className="mt-1 text-[10px] text-muted-foreground">{member.email}</p></div><select aria-label={`Role for ${member.email}`} value={member.roleCode} disabled={pending || member.id === currentUser?.id} onChange={(event) => void changeRole(member.id, event.target.value as UserRole)} className="h-9 rounded-md border bg-card px-3 text-xs"><option value="SUPER_ADMIN">Super Admin</option><option value="ACCOUNTANT">Accountant</option><option value="WAREHOUSE_MANAGER">Warehouse Manager</option><option value="SALES_OFFICER">Sales Officer</option></select></div>)}</div></Card>
      <Card><CardHeader className="border-b"><CardTitle className="text-sm">Pending invitations</CardTitle><CardDescription>Review or revoke invitations that have not been accepted.</CardDescription></CardHeader><div className="divide-y">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center"><div className="flex-1"><p className="text-sm font-medium">{invitation.email}</p><p className="mt-1 text-[10px] text-muted-foreground">{roleLabels[invitation.role] ?? invitation.role} · {invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString("en-US")}</p></div>{invitation.status === "Pending" ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => void revoke(invitation.id)}>Revoke</Button> : null}</div>)}{invitations.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No pending invitations.</p> : null}</div></Card>
    </div>
  );
}
