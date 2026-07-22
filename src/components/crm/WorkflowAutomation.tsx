import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Workflow, Plus, Play, Pause, Settings } from "lucide-react";

export function WorkflowAutomation() {
  const workflows = [
    {
      id: '1',
      name: 'Lead Follow-up',
      description: 'Automatically send follow-up emails to new leads',
      status: 'active',
      triggers: 3,
      actions: 5
    },
    {
      id: '2',
      name: 'Contract Reminders',
      description: 'Send contract signing reminders to clients',
      status: 'paused',
      triggers: 2,
      actions: 3
    }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              Workflow Automation
            </CardTitle>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Workflow
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{workflow.name}</h3>
                    <Badge variant={workflow.status === 'active' ? 'default' : 'secondary'}>
                      {workflow.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{workflow.description}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{workflow.triggers} triggers</span>
                    <span>{workflow.actions} actions</span>
                  </div>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <Button variant="ghost" size="sm">
                    {workflow.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}