import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Mail, Shield, UserMinus, LogOut, Crown, Copy, Check } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface TeamPageProps {
  competitionId: string;
  currentUserId: string;
  isOwner: boolean;
}

interface TeamMember {
  id: string;
  competitionId: string;
  userId: string;
  invitedEmail: string | null;
  role: "owner" | "lead" | "backend" | "frontend" | "designer" | "pitch" | "member";
  status: "invited" | "active" | "removed";
  createdAt: string;
}

interface InviteResponse {
  invite: {
    id: string;
    role: string;
    expiresAt: string;
    maxUses: number;
    token: string;
  };
}

interface MemberRoleUpdate {
  role: "owner" | "lead" | "backend" | "frontend" | "designer" | "pitch" | "member";
}

const ROLE_LABELS: Record<TeamMember["role"], string> = {
  owner: "Owner",
  lead: "Lead",
  backend: "Backend",
  frontend: "Frontend",
  designer: "Designer",
  pitch: "Pitch",
  member: "Member",
};

const ROLE_COLORS: Record<TeamMember["role"], string> = {
  owner: "bg-amber-100 text-amber-800 border-amber-300",
  lead: "bg-blue-100 text-blue-800 border-blue-300",
  backend: "bg-green-100 text-green-800 border-green-300",
  frontend: "bg-cyan-100 text-cyan-800 border-cyan-300",
  designer: "bg-purple-100 text-purple-800 border-purple-300",
  pitch: "bg-orange-100 text-orange-800 border-orange-300",
  member: "bg-gray-100 text-gray-800 border-gray-300",
};

export function TeamPage({ competitionId, currentUserId, isOwner }: TeamPageProps) {
  const queryClient = useQueryClient();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteRole, setInviteRoleState] = useState<TeamMember["role"]>("member");
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState(7);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [roleChangeDialog, setRoleChangeDialog] = useState<{ memberId: string; currentRole: TeamMember["role"] } | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null);

  const setInviteRole = (value: TeamMember["role"]) => setInviteRoleState(value);

  // Fetch members
  const { data: members, isLoading, error } = useQuery({
    queryKey: ["team-members", competitionId],
    queryFn: async () => {
      const res = await api.get(`/api/competitions/${competitionId}/members`);
      return res.json() as Promise<{ members: TeamMember[] }>;
    },
  });

  // Fetch invites for pending invites display
  const { data: invitesData } = useQuery({
    queryKey: ["competition-invites", competitionId],
    queryFn: async () => {
      const res = await api.get(`/api/competitions/${competitionId}/invites`);
      return res.json() as Promise<{ invites: { id: string; role: string; expiresAt: string; maxUses: number; uses: number; revokedAt: string | null; createdAt: string }[] }>;
    },
  });

  // Create invite mutation
  const createInviteMutation = useMutation({
    mutationFn: async (data: { role: TeamMember["role"]; expiresInDays: number; maxUses: number }) => {
      const res = await api.post(`/api/competitions/${competitionId}/members/invite`, data);
      if (!res.ok) throw new Error("Failed to create invite");
      return res.json() as Promise<InviteResponse>;
    },
    onSuccess: (data) => {
      setCopiedToken(data.invite.token);
      setInviteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["team-members", competitionId] });
      queryClient.invalidateQueries({ queryKey: ["competition-invites", competitionId] });
      setTimeout(() => setCopiedToken(null), 3000);
    },
  });

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: TeamMember["role"] }) => {
      const res = await api.patch(`/api/competitions/${competitionId}/members/${memberId}`, { role });
      if (!res.ok) throw new Error("Failed to update role");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", competitionId] });
      setRoleChangeDialog(null);
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await api.delete(`/api/competitions/${competitionId}/members/${memberId}`);
      if (!res.ok) throw new Error("Failed to remove member");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", competitionId] });
    },
  });

  // Leave competition mutation
  const leaveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/competitions/${competitionId}/members/leave`, {});
      if (!res.ok) throw new Error("Failed to leave competition");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", competitionId] });
      setLeaveDialogOpen(false);
    },
  });

  // Transfer ownership mutation
  const transferOwnershipMutation = useMutation({
    mutationFn: async (targetMemberId: string) => {
      const res = await api.patch(`/api/competitions/${competitionId}/members/${targetMemberId}`, { role: "owner" });
      if (!res.ok) throw new Error("Failed to transfer ownership");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members", competitionId] });
      setTransferDialogOpen(false);
      setTransferTargetId(null);
    },
  });

  const handleCopyInviteLink = useCallback((token: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/invite/${token}`;
    copyToClipboard(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  }, []);

  const handleRoleChange = useCallback((memberId: string, currentRole: TeamMember["role"]) => {
    setRoleChangeDialog({ memberId, currentRole });
  }, []);

  const handleRemoveMember = useCallback((memberId: string) => {
    if (confirm("Are you sure you want to remove this member? This action cannot be undone.")) {
      removeMemberMutation.mutate(memberId);
    }
  }, []);

  const handleLeave = useCallback(() => {
    if (confirm("Are you sure you want to leave this competition? You will lose access to all data.")) {
      leaveMutation.mutate();
    }
  }, []);

  const handleTransfer = useCallback((targetMemberId: string) => {
    if (confirm("Transfer ownership to this member? You will become a Lead member.")) {
      transferOwnershipMutation.mutate(targetMemberId);
    }
  }, []);

  const activeMembers = members?.members.filter(m => m.status === "active") ?? [];
  const pendingInvites = invitesData?.invites.filter(i => !i.revokedAt) ?? [];

  const currentUserMember = activeMembers.find(m => m.userId === currentUserId);
  const isCurrentUserOwner = currentUserMember?.role === "owner";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Failed to load team members. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Team Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">Manage team members, roles, and invitations</p>
        </div>
        {isOwner && (
          <Button onClick={() => setInviteDialogOpen(true)}>
            <User className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Active Members */}
      <Card>
        <CardHeader>
          <CardTitle>Active Members ({activeMembers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active members yet. Invite your first team member!
            </div>
          ) : (
            <div className="space-y-4">
              {activeMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-sm font-medium">
                        {member.invitedEmail ? member.invitedEmail[0].toUpperCase() : member.userId[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.invitedEmail ?? member.userId}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.userId !== currentUserId ? "Member" : "You"} • Joined {new Date(member.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={cn("text-xs", ROLE_COLORS[member.role])}>
                      {ROLE_LABELS[member.role]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {(isOwner || isCurrentUserOwner) && member.userId !== currentUserId && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8" aria-label="Member actions">
                            <span className="sr-only">Member actions</span>
                          </Button>
                          </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.id, member.role)}
                            disabled={member.role === "owner"}
                          >
                            <Crown className="mr-2 h-4 w-4" />
                            Change Role
                          </DropdownMenuItem>
                          <Separator />
                          {isOwner && (
                            <DropdownMenuItem
                              onClick={() => {
                                setTransferTargetId(member.id);
                                setTransferDialogOpen(true);
                              }}
                              className="text-amber-600"
                            >
                              <Crown className="mr-2 h-4 w-4" />
                              Transfer Ownership
                            </DropdownMenuItem>
                          )}
                          <Separator />
                          <DropdownMenuItem
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-destructive"
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Remove Member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {member.userId === currentUserId && !isCurrentUserOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setLeaveDialogOpen(true)}
                        className="text-destructive"
                        aria-label="Leave competition"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    )}
                    {member.userId === currentUserId && isCurrentUserOwner && activeMembers.filter(m => m.role === "owner").length === 1 && (
                      <span className="text-xs text-muted-foreground">You are the sole owner</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="border-amber-200">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600" />
              Pending Invitations ({pendingInvites.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg bg-amber-50">
                  <div className="flex items-center gap-3">
                    <Badge className={cn(ROLE_COLORS[invite.role as TeamMember["role"]])}>
                      {ROLE_LABELS[invite.role as TeamMember["role"]]}
                    </Badge>
                    <div>
                      <p className="font-medium">{invite.role}</p>
                      <p className="text-sm text-muted-foreground">
                        Expires {new Date(invite.expiresAt).toLocaleDateString()} • {invite.maxUses} use(s)
                      </p>
                    </div>
                  </div>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Revoke this invitation?")) {
                          // Would need a revoke invite mutation
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite Dialog */}
      <Dialog
        open={inviteDialogOpen}
        onClose={() => setInviteDialogOpen(false)}
        title="Invite Team Member"
        description="Create an invitation link to add a member to this competition."
        footer={
          <>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createInviteMutation.mutate({ role: inviteRole, expiresInDays: inviteExpiresInDays, maxUses: inviteMaxUses })} disabled={createInviteMutation.isPending}>
              {createInviteMutation.isPending ? "Creating..." : "Create Invite"}
            </Button>
          </>
        }
      >
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="backend">Backend</SelectItem>
                <SelectItem value="frontend">Frontend</SelectItem>
                <SelectItem value="designer">Designer</SelectItem>
                <SelectItem value="pitch">Pitch</SelectItem>
                <SelectItem value="member">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invite-expires">Expires In (Days)</Label>
              <Input
                id="invite-expires"
                type="number"
                min="1"
                max="30"
                value={inviteExpiresInDays}
                onChange={(e) => setInviteExpiresInDays(parseInt(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-max-uses">Max Uses</Label>
              <Input
                id="invite-max-uses"
                type="number"
                min="1"
                max="10"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
        </div>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog
        open={!!roleChangeDialog}
        onClose={() => setRoleChangeDialog(null)}
        title="Change Member Role"
        description="Select a new role for this team member."
        footer={
          <>
            <Button variant="outline" onClick={() => setRoleChangeDialog(null)}>Cancel</Button>
            <Button
              onClick={() => roleChangeDialog && updateRoleMutation.mutate({ memberId: roleChangeDialog.memberId, role: inviteRole })}
              disabled={updateRoleMutation.isPending}
            >
              {updateRoleMutation.isPending ? "Updating..." : "Update Role"}
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-4">
          <Label htmlFor="new-role">New Role</Label>
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger id="new-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="backend">Backend</SelectItem>
              <SelectItem value="frontend">Frontend</SelectItem>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="pitch">Pitch</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {roleChangeDialog?.currentRole === "owner" && "Cannot change role of an owner."}
          </p>
        </div>
      </Dialog>

      {/* Leave Dialog */}
      <Dialog
        open={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        title="Leave Competition"
        description="Are you sure you want to leave this competition? You will lose access to all data and cannot rejoin without a new invitation."
        footer={
          <>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleLeave} disabled={leaveMutation.isPending}>
              {leaveMutation.isPending ? "Leaving..." : "Leave Competition"}
            </Button>
          </>
        }
      >
        <p className="py-4">This action cannot be undone. You will need a new invitation to rejoin.</p>
      </Dialog>

      {/* Transfer Ownership Dialog */}
      <Dialog
        open={transferDialogOpen}
        onClose={() => { setTransferDialogOpen(false); setTransferTargetId(null); }}
        title="Transfer Ownership"
        description="Transfer ownership to the selected member. You will become a Lead member."
        footer={
          <>
            <Button variant="outline" onClick={() => { setTransferDialogOpen(false); setTransferTargetId(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => transferTargetId && handleTransfer(transferTargetId)} disabled={transferOwnershipMutation.isPending}>
              {transferOwnershipMutation.isPending ? "Transferring..." : "Transfer Ownership"}
            </Button>
          </>
        }
      >
        <p className="py-4">This action cannot be undone. The selected member will become the sole owner.</p>
      </Dialog>

      {/* Copied Toast */}
      {copiedToken && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg">
            <Check className="h-4 w-4" />
            <span>Invite link copied to clipboard!</span>
          </div>
        </div>
      )}
    </div>
  );
}
