import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Task, TaskLog } from "@shared/schema";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Play,
  Square,
  Trash2,
  Globe,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Shield,
  Code2,
  Terminal,
  Wifi,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TaskDetail() {
  const [, params] = useRoute("/tasks/:id");
  const taskId = params?.id;
  const { toast } = useToast();

  const { data: task, isLoading: taskLoading } = useQuery<Task>({
    queryKey: ["/api/tasks", taskId],
    refetchInterval: 2000,
    enabled: !!taskId,
  });

  const { data: logs, isLoading: logsLoading } = useQuery<TaskLog[]>({
    queryKey: ["/api/tasks", taskId, "logs"],
    refetchInterval: 2000,
    enabled: !!taskId,
  });

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tasks/${taskId}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      toast({ title: "Task started" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tasks/${taskId}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      toast({ title: "Stop request sent" });
    },
  });

  const clearLogsMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/tasks/${taskId}/logs`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "logs"] });
      toast({ title: "Logs cleared" });
    },
  });

  if (taskLoading) {
    return (
      <div className="min-h-full p-6 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-40" />
          <Skeleton className="h-60" />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-full p-6 md:p-8 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Task not found</h2>
          <Link href="/">
            <Button className="mt-4" data-testid="button-back-home">Go Back</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isRunning = task.status === "running";
  const totalRuns = (task.completedRuns || 0) + (task.failedRuns || 0);
  const progressPercent = task.repetitions > 0 ? Math.round((totalRuns / task.repetitions) * 100) : 0;

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button size="icon" variant="ghost" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate" data-testid="text-task-name">{task.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{task.targetUrl}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isRunning ? (
              <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-run">
                <Play className="w-4 h-4 mr-2" />
                Run
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending} data-testid="button-stop">
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4 mb-6">
          <Card className="p-4 text-center">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-1.5">
              <Badge variant={isRunning ? "default" : task.status === "completed" ? "outline" : "secondary"} data-testid="badge-detail-status">
                {isRunning && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                {task.status}
              </Badge>
            </div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-xs text-muted-foreground">Progress</div>
            <div className="font-semibold text-lg mt-1" data-testid="text-progress">{totalRuns}/{task.repetitions}</div>
            {isRunning && (
              <div className="h-1 w-full bg-muted rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
              </div>
            )}
          </Card>
          <Card className="p-4 text-center">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="font-semibold text-lg mt-1 text-green-600 dark:text-green-400" data-testid="text-detail-completed">
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              {task.completedRuns || 0}
            </div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-xs text-muted-foreground">Failed</div>
            <div className="font-semibold text-lg mt-1 text-red-600 dark:text-red-400" data-testid="text-detail-failed">
              <XCircle className="w-4 h-4 inline mr-1" />
              {task.failedRuns || 0}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Settings</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Repetitions</span>
                <span className="font-medium">{task.repetitions}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Delay</span>
                <span className="font-medium">{(task.delayMs / 1000).toFixed(1)}s</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Proxy
                </span>
                <span className="font-medium truncate max-w-[180px]">
                  {task.proxyUrl || "Not configured"}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Code2 className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Actions ({(task.actions as any[])?.length || 0})</h3>
            </div>
            <div className="space-y-2">
              {(task.actions as any[])?.map((action: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50" data-testid={`text-action-${i}`}>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {action.type}
                  </Badge>
                  <span className="truncate text-muted-foreground">
                    {action.description || action.selector?.substring(0, 40) + "..."}
                  </span>
                </div>
              ))}
              {(!task.actions || (task.actions as any[]).length === 0) && (
                <p className="text-sm text-muted-foreground">No actions configured</p>
              )}
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Execution Logs</h3>
              {logs && <Badge variant="secondary" className="text-xs">{logs.length}</Badge>}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => clearLogsMutation.mutate()}
              disabled={clearLogsMutation.isPending || !logs?.length}
              data-testid="button-clear-logs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear
            </Button>
          </div>

          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : logs && logs.length > 0 ? (
            <ScrollArea className="h-[350px]">
              <div className="space-y-1.5">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-2.5 rounded text-sm bg-muted/30"
                    data-testid={`log-${log.id}`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {log.status === "success" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : log.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">Run #{log.runNumber}</span>
                        {log.ipUsed && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Wifi className="w-3 h-3" />
                            {log.ipUsed.length > 30 ? "proxy" : log.ipUsed}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.message}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ""}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Terminal className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>No logs yet. Run the task to see execution results.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
