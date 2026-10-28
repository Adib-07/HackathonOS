import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { User, Mail, Shield, AlertCircle, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface InviteInfo {
  competitionId: string;
  competitionName: string;
  role: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  status: "valid" | "expired" | "revoked" | "max_uses_reached";
}

export function InviteAcceptPage() {
  const [, params] = useRoute("/invite/:token");
  const [, navigate] = useLocation();
  const token = params?.token;
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setInviteInfo({ competitionId: "", competitionName: "", role: "", expiresAt: "", maxUses: 0, uses: 0, status: "expired" });
      setLoading(false);
      return;
    }

    async function fetchInviteInfo() {
      try {
        const res = await api.get(`/api/invites/accept?token=${token}`);
        if (res.ok) {
          const data = (await res.json()) as { competitionId: string; competitionName?: string; role: string; expiresAt: string; maxUses: number; uses: number };
          setInviteInfo({
            competitionId: data.competitionId,
            competitionName: data.competitionName || "Unknown Competition",
            role: data.role,
            expiresAt: data.expiresAt,
            maxUses: data.maxUses,
            uses: data.uses,
            status: "valid",
          });
        } else {
          const errorData = (await res.json()) as { error?: string };
          setInviteInfo({ competitionId: "", competitionName: "", role: "", expiresAt: "", maxUses: 0, uses: 0, status: errorData.error?.includes("expired") ? "expired" : "revoked" });
        }
      } catch {
        setInviteInfo({ competitionId: "", competitionName: "", role: "", expiresAt: "", maxUses: 0, uses: 0, status: "revoked" });
      } finally {
        setLoading(false);
      }
    }

    fetchInviteInfo();
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const res = await api.post("/api/invites/accept", { token });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          navigate(`/competitions/${inviteInfo?.competitionId}`);
        }, 1500);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error || "Failed to accept invitation");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Verifying invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-xl font-bold">Invalid Link</h2>
            <p className="mt-2 text-muted-foreground">This invitation link is invalid or malformed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColors: Record<InviteInfo["status"], string> = {
    valid: "bg-green-100 text-green-800",
    expired: "bg-red-100 text-red-800",
    revoked: "bg-red-100 text-red-800",
    max_uses_reached: "bg-amber-100 text-amber-800",
  };

  const statusIcons: Record<InviteInfo["status"], React.ReactNode> = {
    valid: <CheckCircle className="h-4 w-4" />,
    expired: <Clock className="h-4 w-4" />,
    revoked: <AlertCircle className="h-4 w-4" />,
    max_uses_reached: <AlertCircle className="h-4 w-4" />,
  };

  const statusLabels: Record<InviteInfo["status"], string> = {
    valid: "Valid",
    expired: "Expired",
    revoked: "Revoked",
    max_uses_reached: "Max Uses Reached",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className={cn("mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center", inviteInfo.status === "valid" ? "bg-green-100" : "bg-red-100")}>
            {statusIcons[inviteInfo.status]}
          </div>
          <CardTitle className="text-2xl">{inviteInfo.status === "valid" ? "Join Competition" : "Invitation Invalid"}</CardTitle>
          <p className="text-muted-foreground">
            {inviteInfo.status === "valid"
              ? "You've been invited to join a competition team."
              : "This invitation link is no longer valid."}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">{inviteInfo.competitionName}</p>
                  <p className="text-sm text-muted-foreground">Competition</p>
                </div>
              </div>
              <Badge variant="outline">{inviteInfo.competitionId.slice(0, 8)}...</Badge>
            </div>

            <Separator />

            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <User className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="font-medium">{inviteInfo.role.charAt(0).toUpperCase() + inviteInfo.role.slice(1)}</p>
                  <p className="text-sm text-muted-foreground">Assigned Role</p>
                </div>
              </div>
              <Badge className={cn(statusColors[inviteInfo.status])}>
                {statusIcons[inviteInfo.status]} {statusLabels[inviteInfo.status]}
              </Badge>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{inviteInfo.maxUses}</p>
                <p className="text-xs text-muted-foreground">Max Uses</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{inviteInfo.uses}</p>
                <p className="text-xs text-muted-foreground">Used</p>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">Expires</p>
              <p className="font-medium">{new Date(inviteInfo.expiresAt).toLocaleDateString()} at {new Date(inviteInfo.expiresAt).toLocaleTimeString()}</p>
            </div>
          </div>

          {inviteInfo.status !== "valid" && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-center text-red-800">
              <AlertCircle className="mx-auto h-5 w-5 mb-2" />
              <p className="font-medium">This invitation cannot be accepted</p>
              <p className="text-sm mt-1">
                {inviteInfo.status === "expired" && "This invitation has expired."}
                {inviteInfo.status === "revoked" && "This invitation has been revoked by the owner."}
                {inviteInfo.status === "max_uses_reached" && "This invitation has reached its maximum number of uses."}
              </p>
            </div>
          )}

          {inviteInfo.status === "valid" && (
            <div className="space-y-3 pt-4">
              <Button
                className="w-full"
                size="lg"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  "Accept Invitation"
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                By accepting, you'll join the team with the assigned role.
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <AlertCircle className="mr-2 h-4 w-4 inline" />
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center text-green-800">
              <CheckCircle className="mx-auto h-5 w-5 mb-2" />
              <p className="font-medium">Successfully joined the competition!</p>
              <p className="text-sm mt-1">Redirecting to competition workspace...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}