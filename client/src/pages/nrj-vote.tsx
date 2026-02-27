import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Square,
  Vote,
  Timer,
  Hash,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Tv,
  User,
} from "lucide-react";

const CANDIDATES = [
  { key: "essam", name: "عصام السقا", category: "أفضل ممثل مساعد", icon: User },
  { key: "sahab", name: "صحاب الأرض", category: "أفضل مسلسل درامي قصير", icon: Tv },
  { key: "aliklay", name: "على كلاى", category: "أفضل مسلسل درامي طويل", icon: Tv },
];

function VoteCard({ candidate }: { candidate: typeof CANDIDATES[0] }) {
  const [votes, setVotes] = useState(100);
  const [delayMs, setDelayMs] = useState(4000);
  const { toast } = useToast();
  const Icon = candidate.icon;

  const { data: status } = useQuery<{
    running: boolean;
    completed: number;
    failed: number;
    total: number;
    taskId: string | null;
  }>({
    queryKey: ["/api/nrj/status", candidate.key],
    queryFn: () => fetch(`/api/nrj/status/${candidate.key}`).then(r => r.json()),
    refetchInterval: 2000,
  });

  const startMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/nrj/start/${candidate.key}`, { votes, delayMs }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nrj/status", candidate.key] });
      toast({ title: `بدأ التصويت لـ ${candidate.name}` });
    },
    onError: (err: Error) =>
      toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/nrj/stop/${candidate.key}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nrj/status", candidate.key] });
      toast({ title: "تم إيقاف التصويت" });
    },
  });

  const isRunning = status?.running || false;
  const completed = status?.completed || 0;
  const failed = status?.failed || 0;
  const total = status?.total || votes;
  const done = completed + failed;
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Card className="p-6" data-testid={`card-vote-${candidate.key}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-bold text-lg" data-testid={`text-candidate-${candidate.key}`}>{candidate.name}</h2>
          <p className="text-xs text-muted-foreground">{candidate.category}</p>
        </div>
        {isRunning && (
          <Badge variant="default" className="mr-auto" data-testid={`badge-status-${candidate.key}`}>
            <Loader2 className="w-3 h-3 ml-1 animate-spin" />
            جاري التصويت
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <Label htmlFor={`votes-${candidate.key}`} className="flex items-center gap-1 mb-1.5 text-xs">
            <Hash className="w-3 h-3" />
            عدد الأصوات
          </Label>
          <Input
            id={`votes-${candidate.key}`}
            type="number"
            min={1}
            max={1000}
            value={votes}
            onChange={(e) => setVotes(parseInt(e.target.value) || 1)}
            disabled={isRunning}
            data-testid={`input-votes-${candidate.key}`}
          />
        </div>
        <div>
          <Label htmlFor={`delay-${candidate.key}`} className="flex items-center gap-1 mb-1.5 text-xs">
            <Timer className="w-3 h-3" />
            التأخير (ثانية)
          </Label>
          <Input
            id={`delay-${candidate.key}`}
            type="number"
            min={1}
            max={60}
            value={delayMs / 1000}
            onChange={(e) => setDelayMs((parseFloat(e.target.value) || 1) * 1000)}
            disabled={isRunning}
            data-testid={`input-delay-${candidate.key}`}
          />
        </div>
      </div>

      <div className="mb-4">
        {!isRunning ? (
          <Button
            className="w-full"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            data-testid={`button-start-${candidate.key}`}
          >
            {startMutation.isPending ? (
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 ml-2" />
            )}
            ابدأ التصويت
          </Button>
        ) : (
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            data-testid={`button-stop-${candidate.key}`}
          >
            <Square className="w-4 h-4 ml-2" />
            إيقاف
          </Button>
        )}
      </div>

      {(isRunning || done > 0) && (
        <>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
              data-testid={`progress-${candidate.key}`}
            />
          </div>
          <div className="text-center text-xs text-muted-foreground mb-3" data-testid={`text-progress-${candidate.key}`}>
            {progressPercent}% ({done} / {total})
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              <div>
                <div className="text-[10px] text-muted-foreground">ناجحة</div>
                <div className="font-bold text-green-600 dark:text-green-400" data-testid={`text-completed-${candidate.key}`}>{completed}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
              <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <div>
                <div className="text-[10px] text-muted-foreground">فاشلة</div>
                <div className="font-bold text-red-600 dark:text-red-400" data-testid={`text-failed-${candidate.key}`}>{failed}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

export default function NrjVote() {
  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Vote className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
              تصويت كاس انرچي للدراما
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            حدد عدد الأصوات والوقت وادوس ابدأ
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded-lg">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>تصويت تلقائي عبر متصفح حقيقي</span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {CANDIDATES.map((c) => (
            <VoteCard key={c.key} candidate={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
