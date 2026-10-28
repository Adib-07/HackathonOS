import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Filter, ChevronDown, ChevronUp, BarChart2, AlertCircle, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface TaskAssignmentPanelProps {
  competitionId: string;
  currentUserId: string;
  isLeadOrOwner: boolean;
}

interface Task {
  id: string;
  competitionId: string;
  planId: string;
  taskKey: string;
  title: string;
  description: string;
  phase: string;
  priority: string;
  estimatedMinutes: number;
  plannedStartAt: string;
  plannedEndAt: string;
  status: string;
  assigneeMemberId: string | null;
  blockedReason: string | null;
  acceptanceCriteria: string | null;
  verificationMethod: string | null;
  verification: {
    state: string;
    verified: boolean;
    evidenceCount: number;
    reason: string;
  };
}

interface TeamMember {
  id: string;
  competitionId: string;
  userId: string;
  invitedEmail: string | null;
  role: string;
  status: string;
  createdAt: string;
}

interface AssignTaskResponse {
  task: {
    id: string;
    assigneeMemberId: string | null;
    blockedReason: string | null;
  };
}

interface BulkAssignResponse {
  updated: Array<{
    id: string;
    assigneeMemberId: string | null;
  }>;
}

type TaskFilter = "all" | "my" | "unassigned" | string; // string = memberId

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-blue-100 text-blue-800",
  low: "bg-gray-100 text-gray-800",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800",
  blocked: "bg-red-100 text-red-800",
  done: "bg-green-100 text-green-800",
  deferred: "bg-gray-100 text-gray-800",
};

export function TaskAssignmentPanel({ competitionId, currentUserId, isLeadOrOwner }: TaskAssignmentPanelProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssignments, setBulkAssignments] = useState<Record<string, string>>({});

  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["tasks", competitionId, filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter === "my") params.append("filter", "my");
      else if (filter === "unassigned") params.append("filter", "unassigned");
      else if (filter !== "all") params.append("filter", filter);
      
      const res = await api.get(`/api/competitions/${competitionId}/tasks?${params.toString()}`);
      return res.json() as Promise<{ tasks: Task[] }>;
    },
  });

  // Fetch members for assignment
  const { data: membersData } = useQuery({
    queryKey: ["team-members", competitionId],
    queryFn: async () => {
      const res = await api.get(`/api/competitions/${competitionId}/members`);
      return res.json() as Promise<{ members: TeamMember[] }>;
    },
  });

  // Assign single task mutation
  const assignTaskMutation = useMutation({
    mutationFn: async ({ taskId, assigneeMemberId, blockedReason }: { taskId: string; assigneeMemberId: string | null; blockedReason: string | null }) => {
      const res = await api.patch(`/api/competitions/${competitionId}/tasks/${taskId}/assign`, {
        assigneeMemberId,
        blockedReason,
      });
      if (!res.ok) throw new Error("Failed to assign task");
      return res.json() as Promise<AssignTaskResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", competitionId] });
    },
  });

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async (assignments: Array<{ taskId: string; assigneeMemberId: string | null }>) => {
      const res = await api.patch(`/api/competitions/${competitionId}/tasks/bulk-assign`, { assignments });
      if (!res.ok) throw new Error("Failed to bulk assign tasks");
      return res.json() as Promise<BulkAssignResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", competitionId] });
      setShowBulkAssign(false);
      setBulkAssignments({});
    },
  });

  const activeMembers = membersData?.members.filter(m => m.status === "active") ?? [];
  const tasks = tasksData?.tasks ?? [];

  // Calculate workload per member
  const workload = useMemo(() => {
    const work: Record<string, { total: number; done: number; name: string }> = {};
    activeMembers.forEach(m => {
      work[m.id] = { total: 0, done: 0, name: m.invitedEmail ?? m.userId };
    });
    work["unassigned"] = { total: 0, done: 0, name: "Unassigned" };

    tasks.forEach(task => {
      const assigneeId = task.assigneeMemberId ?? "unassigned";
      if (work[assigneeId]) {
        work[assigneeId].total += task.estimatedMinutes;
        if (task.status === "done") work[assigneeId].done += task.estimatedMinutes;
      }
    });
    return work;
  }, [tasks, activeMembers]);

  const handleAssign = useCallback((task: Task, assigneeMemberId: string | null, blockedReason: string | null = null) => {
    assignTaskMutation.mutate({ taskId: task.id, assigneeMemberId, blockedReason });
  }, []);

  const handleBulkAssign = useCallback(() => {
    const assignments = Object.entries(bulkAssignments)
      .filter(([, assigneeId]) => assigneeId !== "")
      .map(([taskId, assigneeId]) => ({ taskId, assigneeMemberId: assigneeId }));
    if (assignments.length > 0) {
      bulkAssignMutation.mutate(assignments);
    }
  }, [bulkAssignments]);

  const handleBulkToggle = useCallback((taskId: string, assigneeId: string | null) => {
    setBulkAssignments(prev => {
      const newAssignments = { ...prev };
      if (assigneeId === null) {
        delete newAssignments[taskId];
      } else {
        newAssignments[taskId] = assigneeId;
      }
      return newAssignments;
    });
  }, []);

  if (tasksLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === "all") return true;
    if (filter === "my") return task.assigneeMemberId === currentUserId;
    if (filter === "unassigned") return !task.assigneeMemberId;
    return task.assigneeMemberId === filter;
  });

  const currentUserMember = activeMembers.find(m => m.userId === currentUserId);
  const isCurrentUserLeadOrOwner = currentUserMember && ["owner", "lead"].includes(currentUserMember.role);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Task Assignment</h2>
          <p className="text-muted-foreground text-sm">
            {filteredTasks.length} of {tasks.length} tasks {filter !== "all" && `(${filter})`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All tasks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="my">My Tasks</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {activeMembers.map(m => (
                <SelectItem key={m.id} value={m.id}>
                  {m.invitedEmail ?? m.userId} ({m.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(isLeadOrOwner || isCurrentUserLeadOrOwner) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkAssign(!showBulkAssign)}
            >
              {showBulkAssign ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showBulkAssign ? "Done" : "Bulk Assign"}
            </Button>
          )}
        </div>
      </div>

      {/* Workload Bars */}
      {isLeadOrOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="h-5 w-5" />
              Workload Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(workload).map(([memberId, data]) => {
                const percentage = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
                const member = activeMembers.find(m => m.id === memberId) ?? { invitedEmail: "Unassigned", role: "" };
                return (
                  <div key={memberId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{member.invitedEmail ?? "Unassigned"}</span>
                      <span className="text-muted-foreground">
                        {Math.floor(data.total / 60)}h {data.total % 60}m total • {percentage}% done
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Assign Mode */}
      {showBulkAssign && isLeadOrOwner && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <span className="font-medium">Bulk Assign Mode</span>
              </div>
              <Button
                onClick={handleBulkAssign}
                disabled={bulkAssignMutation.isPending || Object.keys(bulkAssignments).length === 0}
              >
                {bulkAssignMutation.isPending ? "Assigning..." : `Assign ${Object.keys(bulkAssignments).length} Tasks`}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Select assignees for multiple tasks, then click "Assign" to apply all at once.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tasks List */}
      <Card>
        <CardContent className="pt-0">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Filter className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4">No tasks found for this filter.</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-3 p-4">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-start gap-4 p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors",
                      showBulkAssign && "bg-amber-50"
                    )}
                  >
                    {showBulkAssign && isLeadOrOwner && (
                      <div className="flex items-center h-full">
                        <Select
                          value={bulkAssignments[task.id] || ""}
                          onValueChange={(v) => handleBulkToggle(task.id, v || null)}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Assign..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Unassigned</SelectItem>
                            {activeMembers.map(m => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.invitedEmail ?? m.userId} ({m.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn(PRIORITY_COLORS[task.priority])}>
                          {task.priority}
                        </Badge>
                        <Badge variant="outline" className={cn(STATUS_COLORS[task.status])}>
                          {task.status.replace("_", " ")}
                        </Badge>
                        {task.blockedReason && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="mr-1 h-3 w-3" /> Blocked
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-medium">{task.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                      <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.floor(task.estimatedMinutes / 60)}h {task.estimatedMinutes % 60}m
                        </span>
                        {task.assigneeMemberId && activeMembers.find(m => m.id === task.assigneeMemberId) && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {activeMembers.find(m => m.id === task.assigneeMemberId)!.invitedEmail ?? "Member"}
                          </span>
                        )}
                        {task.blockedReason && (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertCircle className="h-3 w-3" /> Blocked: {task.blockedReason}
                          </span>
                        )}
                      </div>

                      {!showBulkAssign && isLeadOrOwner && (
                        <div className="flex items-center gap-2 shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <span className="sr-only">Assignment actions</span>
                              </Button>
                              </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() => handleAssign(task, null)}
                                className={!task.assigneeMemberId ? "bg-muted" : ""}
                              >
                                <User className="mr-2 h-4 w-4" />
                                Unassign
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {activeMembers.map(m => (
                                <DropdownMenuItem
                                  key={m.id}
                                  onClick={() => handleAssign(task, m.id)}
                                  className={task.assigneeMemberId === m.id ? "bg-muted" : ""}
                                >
                                  {task.assigneeMemberId === m.id && <CheckCircle className="mr-2 h-4 w-4 text-primary" />}
                                  {m.invitedEmail ?? m.userId} ({m.role})
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              {task.blockedReason ? (
                                <DropdownMenuItem
                                  onClick={() => handleAssign(task, task.assigneeMemberId, "")}
                                >
                                  <AlertCircle className="mr-2 h-4 w-4" />
                                  Clear Blocked Reason
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => {
                                    const reason = prompt("Enter blocked reason:");
                                    if (reason !== null) handleAssign(task, task.assigneeMemberId, reason);
                                  }}
                                >
                                  <AlertCircle className="mr-2 h-4 w-4" />
                                  Set Blocked Reason
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
