import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Task } from "@shared/schema";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Play,
  Square,
  Trash2,
  Globe,
  RotateCcw,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
    idle: { variant: "secondary", icon: Clock },
    running: { variant: "default", icon: Loader2 },
    completed: { variant: "outline", icon: CheckCircle2 },
    stopped: { variant: "secondary", icon: Square },
    failed: { variant: "destructive", icon: XCircle },
  };

  const { variant, icon: Icon } = config[status] || config.idle;

  return (
    <Badge variant={variant} data-testid={`badge-status-${status}`}>
      <Icon className={`w-3 h-3 mr-1 ${status === "running" ? "animate-spin" : ""}`} />
      {status === "idle" ? "Idle" : status === "running" ? "Running" : status === "completed" ? "Completed" : status === "stopped" ? "Stopped" : "Failed"}
    </Badge>
  );
}

function TaskCard({ task }: { task: Task }) {
  const { toast } = useToast();

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tasks/${task.id}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task started successfully" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/tasks/${task.id}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Stop request sent" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/tasks/${task.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted" });
    },
  });

  const isRunning = task.status === "running";
  const totalRuns = (task.completedRuns || 0) + (task.failedRuns || 0);
  const progressPercent = task.repetitions > 0 ? Math.round((totalRuns / task.repetitions) * 100) : 0;

  return (
    <Card className="p-5 group" data-testid={`card-task-${task.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link href={`/tasks/${task.id}`}>
            <h3 className="font-semibold text-base truncate cursor-pointer" data-testid={`text-task-name-${task.id}`}>
              {task.name}
            </h3>
          </Link>
          <div className="flex items-center gap-2 mt-1.5 text-sm text-muted-foreground">
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate" data-testid={`text-task-url-${task.id}`}>{task.targetUrl}</span>
          </div>
        </div>
        <StatusBadge status={task.status} />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Repetitions</div>
          <div className="font-semibold text-sm mt-0.5" data-testid={`text-repetitions-${task.id}`}>{task.repetitions}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Completed</div>
          <div className="font-semibold text-sm mt-0.5 text-green-600 dark:text-green-400" data-testid={`text-completed-${task.id}`}>{task.completedRuns || 0}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className="font-semibold text-sm mt-0.5 text-red-600 dark:text-red-400" data-testid={`text-failed-${task.id}`}>{task.failedRuns || 0}</div>
        </div>
      </div>

      {isRunning && (
        <div className="mt-3">
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
              data-testid={`progress-${task.id}`}
            />
          </div>
          <div className="text-xs text-muted-foreground mt-1 text-center">{progressPercent}%</div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 pt-3 border-t">
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-1">
          <Zap className="w-3 h-3" />
          <span>{(task.actions as any[])?.length || 0} actions</span>
          <span className="mx-1">-</span>
          <Clock className="w-3 h-3" />
          <span>{(task.delayMs / 1000).toFixed(1)}s delay</span>
        </div>
        <div className="flex items-center gap-1">
          {!isRunning ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              data-testid={`button-run-${task.id}`}
            >
              <Play className="w-4 h-4 text-green-600 dark:text-green-400" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              data-testid={`button-stop-${task.id}`}
            >
              <Square className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending || isRunning}
            data-testid={`button-delete-${task.id}`}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TaskCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60 mt-2" />
        </div>
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    refetchInterval: 3000,
  });

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Task Automator</h1>
            <p className="text-muted-foreground text-sm mt-1">Automate web actions with proxy support</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] })}
              data-testid="button-refresh"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Link href="/tasks/new">
              <Button data-testid="button-create-task">
                <Plus className="w-4 h-4 mr-2" />
                New Task
              </Button>
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <TaskCardSkeleton key={i} />
            ))}
          </div>
        ) : tasks && tasks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg" data-testid="text-empty-state">No tasks yet</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm">
              Create your first automation task to get started
            </p>
            <Link href="/tasks/new">
              <Button className="mt-4" data-testid="button-create-first-task">
                <Plus className="w-4 h-4 mr-2" />
                Create Task
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
