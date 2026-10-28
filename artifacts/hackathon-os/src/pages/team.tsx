import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Shield, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TeamPage } from "@/components/team";
import { api } from "@/lib/api-client";

export default function TeamPageView() {
  const [, params] = useRoute("/competitions/:id/team");
  const competitionId = params?.id ?? "";

  const { data: competition } = useQuery({
    queryKey: ["competition", competitionId],
    queryFn: async () => {
      const res = await api.get(`/api/competitions/${competitionId}`);
      return (await res.json()) as { id: string; name: string };
    },
  });

  const { data: membership } = useQuery({
    queryKey: ["membership", competitionId],
    queryFn: async () => {
      const res = await api.get(`/api/competitions/${competitionId}/members`);
      return (await res.json()) as { members: Array<{ userId: string; role: string }> };
    },
  });

  if (!competition) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isOwner = membership?.members?.some((m: { userId: string; role: string }) => m.userId === "current-user-id" && m.role === "owner") ?? false;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{competition.name}</h1>
          <p className="text-muted-foreground">Team Management</p>
        </div>
      </div>
      <TeamPage competitionId={competitionId} currentUserId="current-user-id" isOwner={isOwner} />
    </div>
  );
}