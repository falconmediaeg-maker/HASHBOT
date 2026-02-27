import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Globe,
  Timer,
  Repeat,
  Shield,
  Code2,
  Zap,
  Save,
} from "lucide-react";
import type { Action } from "@shared/schema";
import { Link } from "wouter";

export default function CreateTask() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [repetitions, setRepetitions] = useState(1);
  const [delayMs, setDelayMs] = useState(3000);
  const [proxyUrl, setProxyUrl] = useState("");
  const [actions, setActions] = useState<Action[]>([]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/tasks", {
        name,
        targetUrl,
        repetitions,
        delayMs,
        proxyUrl: proxyUrl || null,
        actions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created successfully" });
      setLocation("/");
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const addAction = () => {
    setActions([...actions, { type: "check", selector: "", description: "" }]);
  };

  const updateAction = (index: number, field: keyof Action, value: string) => {
    const updated = [...actions];
    (updated[index] as any)[field] = value;
    setActions(updated);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetUrl.trim()) {
      toast({ title: "Please fill in required fields", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="min-h-full p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button size="icon" variant="ghost" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Create New Task</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Configure your automation task</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Basic Info</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Task Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Daily Poll Vote"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="input-name"
              />
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Target URL</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">Website URL *</Label>
              <Input
                id="url"
                placeholder="https://example.com/poll"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                data-testid="input-url"
              />
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Timer className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Execution Settings</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reps" className="flex items-center gap-1.5">
                  <Repeat className="w-3.5 h-3.5" />
                  Repetitions
                </Label>
                <Input
                  id="reps"
                  type="number"
                  min={1}
                  max={10000}
                  value={repetitions}
                  onChange={(e) => setRepetitions(parseInt(e.target.value) || 1)}
                  data-testid="input-repetitions"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delay" className="flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  Delay (ms)
                </Label>
                <Input
                  id="delay"
                  type="number"
                  min={500}
                  max={60000}
                  value={delayMs}
                  onChange={(e) => setDelayMs(parseInt(e.target.value) || 3000)}
                  data-testid="input-delay"
                />
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">Proxy Configuration</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proxy">Proxy API URL (optional)</Label>
              <Input
                id="proxy"
                placeholder="http://proxy-api.example.com:8080"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                data-testid="input-proxy"
              />
              <p className="text-xs text-muted-foreground">
                Each request will use this proxy for a different IP address
              </p>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Actions</h2>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={addAction} data-testid="button-add-action">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Action
              </Button>
            </div>

            {actions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Code2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No actions added yet</p>
                <p className="text-xs mt-1">Add actions to interact with the target website</p>
              </div>
            ) : (
              <div className="space-y-4">
                {actions.map((action, index) => (
                  <div key={index} className="p-4 rounded-md bg-muted/50 space-y-3" data-testid={`action-${index}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Action #{index + 1}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeAction(index)}
                        data-testid={`button-remove-action-${index}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={action.type}
                          onValueChange={(val) => updateAction(index, "type", val)}
                        >
                          <SelectTrigger data-testid={`select-action-type-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="check">Checkbox</SelectItem>
                            <SelectItem value="click">Click Button</SelectItem>
                            <SelectItem value="input">Fill Input</SelectItem>
                            <SelectItem value="select">Select Option</SelectItem>
                            <SelectItem value="wait">Wait</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Description</Label>
                        <Input
                          placeholder="e.g., Select option 1"
                          value={action.description || ""}
                          onChange={(e) => updateAction(index, "description", e.target.value)}
                          data-testid={`input-action-desc-${index}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">HTML Code / Selector</Label>
                      <Textarea
                        placeholder='e.g., <input class="17" value="1" name="answers[289]" type="checkbox">'
                        value={action.selector}
                        onChange={(e) => updateAction(index, "selector", e.target.value)}
                        className="font-mono text-xs resize-none"
                        rows={2}
                        data-testid={`input-action-selector-${index}`}
                      />
                    </div>
                    {(action.type === "input" || action.type === "select") && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Value</Label>
                        <Input
                          placeholder="Value to fill or select"
                          value={action.value || ""}
                          onChange={(e) => updateAction(index, "value", e.target.value)}
                          data-testid={`input-action-value-${index}`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Link href="/">
              <Button type="button" variant="secondary" data-testid="button-cancel">Cancel</Button>
            </Link>
            <Button type="submit" disabled={createMutation.isPending} className="flex-1" data-testid="button-save">
              <Save className="w-4 h-4 mr-2" />
              {createMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
