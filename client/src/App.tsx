import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CreateTask from "@/pages/create-task";
import TaskDetail from "@/pages/task-detail";
import NrjVote from "@/pages/nrj-vote";

function Router() {
  return (
    <Switch>
      <Route path="/" component={NrjVote} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/tasks/new" component={CreateTask} />
      <Route path="/tasks/:id" component={TaskDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
