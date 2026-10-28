import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Hash, Eye, AlertCircle, CheckCircle, Clock, Calendar, User, Target, Flag, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface PublicShareData {
  competition: {
    name: string;
    organizer: string | null;
    deadline: string;
    competitionType: string;
  };
  plan: {
    version: number;
    generatedAt: string;
    deadline: string;
    availableMinutes: number;
    bufferMinutes: number;
    status: string;
    warnings: string[];
  };
  tasks: Array<{
    taskKey: string;
    title: string;
    description: string;
    phase: string;
    priority: string;
    estimatedMinutes: number;
    plannedStartAt: string;
    plannedEndAt: string;
    status: string;
    assignee: { name: string } | null;
    blockedReason: string | null;
  }>;
}

interface PublicMyTasksData {
  competition: {
    name: string;
    deadline: string;
  };
  member: { role: string };
  tasks: Array<{
    taskKey: string;
    title: string;
    description: string;
    phase: string;
    priority: string;
    estimatedMinutes: number;
    plannedStartAt: string;
    plannedEndAt: string;
    status: string;
    blockedReason: string | null;
    acceptanceCriteria: string | null;
    verificationMethod: string | null;
  }>;
}

type ShareScope = "read_only_plan" | "my_tasks";

export function PublicSharePage() {
  const [, params] = useRoute("/share/:token");
  const [location] = useLocation();
  const token = params?.token;
  const isTasksView = location.includes("/tasks");

  const [data, setData] = useState<PublicShareData | PublicMyTasksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [scope, setScope] = useState<ShareScope | null>(null);

  useEffect(() => {
    if (!token) {
      setError({ status: 404, message: "Invalid share link" });
      setLoading(false);
      return;
    }

    async function fetchShare() {
      try {
        // Try read_only_plan first
        const planRes = await api.get(`/api/share/${token}`);
        if (planRes.ok) {
          const data = (await planRes.json()) as PublicShareData;
          setData(data);
          setScope("read_only_plan");
          setLoading(false);
          return;
        }

        // Try my_tasks
        const tasksRes = await api.get(`/api/share/${token}/tasks`);
        if (tasksRes.ok) {
          const data = (await tasksRes.json()) as PublicMyTasksData;
          setData(data);
          setScope("my_tasks");
          setLoading(false);
          return;
        }

        // Handle errors
        if (planRes.status === 410 || tasksRes.status === 410) {
          const errData = (await planRes.json().catch(() => ({}))) as { error?: string };
          setError({ status: 410, message: errData.error || "This share link has expired or been revoked." });
        } else if (planRes.status === 403) {
          setError({ status: 403, message: "This share link is for a different scope." });
        } else {
          setError({ status: 404, message: "Share link not found." });
        }
      } catch {
        setError({ status: 404, message: "Share link not found." });
      } finally {
        setLoading(false);
      }
    }

    fetchShare();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-xl font-bold">Share Link Invalid</h2>
            <p className="mt-2 text-muted-foreground">{error.message}</p>
            {error.status === 410 && (
              <p className="mt-4 text-sm text-muted-foreground">
                This link has expired or been revoked by the owner.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || !scope) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  // Render based on scope
  if (scope === "read_only_plan") {
    return renderReadOnlyPlan(data as PublicShareData);
  }

  return renderMyTasks(data as PublicMyTasksData);
}

function renderReadOnlyPlan(data: PublicShareData) {
  const { competition, plan, tasks } = data;

  const priorityColors: Record<string, string> = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-blue-100 text-blue-800",
    low: "bg-gray-100 text-gray-800",
  };

  const statusColors: Record<string, string> = {
    todo: "bg-gray-100 text-gray-800",
    in_progress: "bg-blue-100 text-blue-800",
    blocked: "bg-red-100 text-red-800",
    done: "bg-green-100 text-green-800",
    deferred: "bg-gray-100 text-gray-800",
  };

  const phaseColors: Record<string, string> = {
    intake: "bg-purple-100 text-purple-800",
    problem: "bg-blue-100 text-blue-800",
    research: "bg-cyan-100 text-cyan-800",
    track_selection: "bg-amber-100 text-amber-800",
    idea_selection: "bg-orange-100 text-orange-800",
    architecture: "bg-green-100 text-green-800",
    implementation: "bg-indigo-100 text-indigo-800",
    testing: "bg-pink-100 text-pink-800",
    security: "bg-red-100 text-red-800",
    deployment: "bg-violet-100 text-violet-800",
    demo: "bg-emerald-100 text-emerald-800",
    submission: "bg-rose-100 text-rose-800",
  };

  const renderTask = (task: typeof tasks[0]) => (
    <Card key={task.taskKey} className="mb-3">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={cn(phaseColors[task.phase])}>
                {task.phase.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className={cn(priorityColors[task.priority])}>
                {task.priority}
              </Badge>
              <Badge variant="outline" className={cn(statusColors[task.status])}>
                {task.status.replace("_", " ")}
              </Badge>
            </div>
            <h3 className="text-lg font-medium">{task.title}</h3>
            <p className="text-muted-foreground mt-1">{task.description}</p>
            <div className="flex flex-wrap gap-2 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" /> {task.taskKey}
              </span>
              <span className="flex items-center gap-1">
                <Flag className="h-3 w-3" /> Priority: {task.priority}
              </span>
              {task.assignee && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" /> Assignee: {task.assignee.name}
                </span>
              )}
              {task.blockedReason && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertCircle className="h-3 w-3" /> Blocked: {task.blockedReason}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>Est: {Math.floor(task.estimatedMinutes / 60)}h {task.estimatedMinutes % 60}m</span>
              <span>Start: {new Date(task.plannedStartAt).toLocaleString()}</span>
              <span>End: {new Date(task.plannedEndAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderTasksForFilter = (filter: string) => {
    const filteredTasks = tasks.filter((t) => filter === "all" || t.status === filter);
    return filteredTasks.map(renderTask);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-primary">PUBLIC SHARE</span>
                  <Badge variant="outline">Read-Only Plan</Badge>
                </div>
                <h1 className="text-3xl font-bold">{competition.name}</h1>
                <p className="text-muted-foreground">{competition.organizer || "No organizer specified"}</p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Deadline: {new Date(competition.deadline).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Flag className="h-4 w-4" />
                  <span>{competition.competitionType}</span>
                </div>
              </div>
            </div>

            {/* Plan Summary */}
            <div className="grid gap-4 md:grid-cols-4 mt-6">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{plan.version}</p>
                <p className="text-xs text-muted-foreground">Plan Version</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{Math.floor(plan.availableMinutes / 60)}h {plan.availableMinutes % 60}m</p>
                <p className="text-xs text-muted-foreground">Available Time</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold">{plan.bufferMinutes}m</p>
                <p className="text-xs text-muted-foreground">Buffer</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <Badge variant="outline" className={cn("text-xs", plan.status === "at_risk" && "border-red-300 text-red-700 bg-red-50")}>
                  {plan.status.replace("_", " ")}
                </Badge>
              </div>
            </div>

            {/* Warnings */}
            {plan.warnings.length > 0 && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Warnings
                </h4>
                <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                  {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Plan Dates */}
            <div className="grid gap-4 md:grid-cols-3 mt-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Generated</p>
                <p className="font-medium">{new Date(plan.generatedAt).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Plan Deadline</p>
                <p className="font-medium">{new Date(plan.deadline).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Competition Deadline</p>
                <p className="font-medium">{new Date(competition.deadline).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasks Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
            <TabsTrigger value="todo">To Do</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
            <TabsTrigger value="blocked">Blocked</TabsTrigger>
          </TabsList>

          {["all", "todo", "in_progress", "done", "blocked"].map((filter) => (
            <TabsContent key={filter} value={filter} className="mt-4">
              {renderTasksForFilter(filter)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function renderMyTasks(data: PublicMyTasksData) {
  const { competition, member, tasks } = data;

  const statusColors: Record<string, string> = {
    todo: "bg-gray-100 text-gray-800",
    in_progress: "bg-blue-100 text-blue-800",
    blocked: "bg-red-100 text-red-800",
    done: "bg-green-100 text-green-800",
    deferred: "bg-gray-100 text-gray-800",
  };

  const renderTask = (task: typeof tasks[0]) => (
    <Card key={task.taskKey} className="mb-3">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="bg-blue-100 text-blue-800">
                {task.phase.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className="bg-gray-100 text-gray-800">
                {task.priority}
              </Badge>
              <Badge variant="outline" className={cn(statusColors[task.status])}>
                {task.status.replace("_", " ")}
              </Badge>
            </div>
            <h3 className="text-lg font-medium">{task.title}</h3>
            <p className="text-muted-foreground mt-1">{task.description}</p>
            {task.blockedReason && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
                <AlertCircle className="mr-1 h-4 w-4 inline" />
                <strong>Blocked:</strong> {task.blockedReason}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Flag className="h-3 w-3" /> Priority: {task.priority}
              </span>
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3" /> {task.taskKey}
              </span>
            </div>
            {(task.acceptanceCriteria || task.verificationMethod) && (
              <div className="mt-4 space-y-2 text-sm">
                {task.acceptanceCriteria && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">Acceptance Criteria</p>
                    <p className="text-muted-foreground mt-1">{task.acceptanceCriteria}</p>
                  </div>
                )}
                {task.verificationMethod && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">Verification Method</p>
                    <p className="text-muted-foreground mt-1">{task.verificationMethod}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderTasksForFilter = (filter: string) => {
    const filteredTasks = tasks.filter((t) => filter === "all" || t.status === filter);
    return filteredTasks.map(renderTask);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-primary">PUBLIC SHARE</span>
                  <Badge variant="outline">My Tasks</Badge>
                </div>
                <h1 className="text-3xl font-bold">{competition.name}</h1>
                <p className="text-muted-foreground mt-1">Your role: {member.role}</p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>Deadline: {new Date(competition.deadline).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">All ({tasks.length})</TabsTrigger>
                <TabsTrigger value="todo">To Do</TabsTrigger>
                <TabsTrigger value="in_progress">In Progress</TabsTrigger>
                <TabsTrigger value="done">Done</TabsTrigger>
                <TabsTrigger value="blocked">Blocked</TabsTrigger>
              </TabsList>

              {["all", "todo", "in_progress", "done", "blocked"].map((filter) => (
                <TabsContent key={filter} value={filter} className="mt-4">
                  {renderTasksForFilter(filter)}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}