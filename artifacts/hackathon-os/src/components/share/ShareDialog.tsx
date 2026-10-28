import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Copy, Check, FileText, Printer, Download, X, ExternalLink, User, Eye, Hash } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  competitionId: string;
}

interface ShareLink {
  id: string;
  scope: "read_only_plan" | "my_tasks";
  memberId: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  url: string;
}

interface CreateShareLinkResponse {
  shareLink: {
    id: string;
    scope: string;
    expiresAt: string;
    url: string;
    token: string;
  };
}

const SCOPE_LABELS = {
  read_only_plan: "Read-Only Plan",
  my_tasks: "My Tasks",
};

const SCOPE_DESCRIPTIONS = {
  read_only_plan: "Anyone with the link can view the competition plan (read-only). No login required.",
  my_tasks: "A specific team member can view only their assigned tasks. Requires login.",
};

export function ShareDialog({ open, onClose, competitionId }: ShareDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTabState] = useState<"create" | "manage">("create");
  const [scope, setScopeState] = useState<"read_only_plan" | "my_tasks">("read_only_plan");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [memberId, setMemberIdState] = useState<string>("");

  const setActiveTab = (value: "create" | "manage") => setActiveTabState(value);
  const setScope = (value: "read_only_plan" | "my_tasks") => setScopeState(value);
  const setMemberId = (value: string) => setMemberIdState(value);

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Fetch existing share links
  const { data: sharesData, isLoading } = useQuery({
    queryKey: ["share-links", competitionId],
    queryFn: async () => {
      const res = await api.get(`/api/competitions/${competitionId}/shares`);
      return res.json() as Promise<{ shares: ShareLink[] }>;
    },
  });

  // Fetch members for my_tasks scope
  const { data: membersData } = useQuery({
    queryKey: ["team-members", competitionId],
    queryFn: async () => {
      const res = await api.get(`/api/competitions/${competitionId}/members`);
      return res.json() as Promise<{ members: { id: string; userId: string; invitedEmail: string | null; role: string; status: string }[] }>;
    },
  });

  // Create share link mutation
  const createShareLinkMutation = useMutation({
    mutationFn: async (data: { scope: "read_only_plan" | "my_tasks"; expiresInDays: number; memberId?: string }) => {
      const res = await api.post(`/api/competitions/${competitionId}/shares`, data);
      if (!res.ok) throw new Error("Failed to create share link");
      return res.json() as Promise<CreateShareLinkResponse>;
    },
    onSuccess: (data) => {
      setCopiedToken(data.shareLink.token);
      setCopiedUrl(data.shareLink.url);
      queryClient.invalidateQueries({ queryKey: ["share-links", competitionId] });
      setTimeout(() => { setCopiedToken(null); setCopiedUrl(null); }, 3000);
    },
  });

  // Revoke share link mutation
  const revokeShareLinkMutation = useMutation({
    mutationFn: async (shareId: string) => {
      const res = await api.delete(`/api/competitions/${competitionId}/shares/${shareId}`);
      if (!res.ok) throw new Error("Failed to revoke share link");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["share-links", competitionId] });
    },
  });

  const handleCopy = useCallback((text: string, type: "url" | "token") => {
    copyToClipboard(text);
    if (type === "url") setCopiedUrl(text);
    else setCopiedToken(text);
    setTimeout(() => { setCopiedUrl(null); setCopiedToken(null); }, 3000);
  }, []);

  const handleCreateShareLink = useCallback(() => {
    createShareLinkMutation.mutate({
      scope,
      expiresInDays,
      memberId: scope === "my_tasks" ? memberId : undefined,
    });
  }, [scope, expiresInDays, memberId]);

  const activeMembers = membersData?.members.filter(m => m.status === "active") ?? [];

  if (isLoading) {
    return (
      <Dialog open={open} onClose={onClose} title="Share with Team" footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Dialog>
    );
  }

  const shares = sharesData?.shares ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share with Team"
      description="Create share links to give others access to the competition plan or individual task lists."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="w-full max-w-2xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Create Link</TabsTrigger>
            <TabsTrigger value="manage">Manage Links</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-6 py-4">
            <div className="space-y-4">
              <Label htmlFor="share-scope">Share Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="share-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read_only_plan">Read-Only Plan (public, no login)</SelectItem>
                  <SelectItem value="my_tasks">My Tasks (per member, requires login)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{SCOPE_DESCRIPTIONS[scope]}</p>

              {scope === "my_tasks" && activeMembers.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="share-member">Team Member</Label>
                  <Select value={memberId} onValueChange={setMemberId}>
                    <SelectTrigger id="share-member">
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.invitedEmail ?? m.userId} ({m.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="share-expires">Expires In (Days)</Label>
                <Input
                  id="share-expires"
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 1)}
                />
              </div>

              <Button onClick={handleCreateShareLink} disabled={createShareLinkMutation.isPending || (scope === "my_tasks" && !memberId)}>
                {createShareLinkMutation.isPending ? "Creating..." : "Create Share Link"}
              </Button>

              {(copiedToken || copiedUrl) && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800">
                  <p className="font-medium">Share link created!</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {copiedToken && (
                      <Button variant="outline" size="sm" onClick={() => handleCopy(copiedToken, "token")} className={cn(copiedToken === copiedUrl ? "bg-green-100" : "")}>
                        <Check className="mr-1 h-3 w-3" /> Token Copied
                      </Button>
                    )}
                    {copiedUrl && (
                      <Button variant="outline" size="sm" onClick={() => handleCopy(copiedUrl, "url")} className={cn(copiedUrl === copiedToken ? "bg-green-100" : "")}>
                        <Check className="mr-1 h-3 w-3" /> URL Copied
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(copiedUrl ?? copiedToken ?? "", "url")}>
                      <Copy className="mr-1 h-3 w-3" /> Copy URL
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manage" className="space-y-6 py-4">
            {shares.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Link2 className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4">No share links created yet.</p>
                <p className="text-sm">Create your first share link in the "Create Link" tab.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {shares.map((share) => (
                  <Card key={share.id} className={cn(share.revokedAt && "opacity-50")}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge variant={share.scope === "read_only_plan" ? "default" : "secondary"}>
                              {share.scope === "read_only_plan" ? <Hash className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
                              {SCOPE_LABELS[share.scope]}
                            </Badge>
                            {share.memberId && (
                              <Badge variant="outline">
                                <User className="mr-1 h-3 w-3" />
                                Member-specific
                              </Badge>
                            )}
                            {share.revokedAt && (
                              <Badge variant="destructive">Revoked</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-3 font-mono text-xs break-all">{share.url}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Created: {new Date(share.createdAt).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>Expires: {new Date(share.expiresAt).toLocaleDateString()}</span>
                            {share.revokedAt && <span>• Revoked: {new Date(share.revokedAt).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy(share.url, "url")}
                          >
                            <Copy className="mr-1 h-3 w-3" /> Copy URL
                          </Button>
                          {!share.revokedAt && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm("Revoke this share link? This action cannot be undone.")) {
                                  revokeShareLinkMutation.mutate(share.id);
                                }
                              }}
                            >
                              <X className="mr-1 h-3 w-3" /> Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      </Dialog>
  );
}
