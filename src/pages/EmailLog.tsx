import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

interface Row {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

const STATUS_VARIANTS: Record<string, string> = {
  sent: "bg-green-100 text-green-800 border-green-300",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  failed: "bg-red-100 text-red-800 border-red-300",
  dlq: "bg-red-100 text-red-800 border-red-300",
  bounced: "bg-orange-100 text-orange-800 border-orange-300",
  complained: "bg-orange-100 text-orange-800 border-orange-300",
  suppressed: "bg-muted text-foreground border-border",
};

const TEMPLATE_LABELS: Record<string, string> = {
  "proposal-link": "Proposal link",
  "customer-form-link": "Questionnaire",
  "lead-introduction": "Lead introduction",
  auth_emails: "Auth email",
};

export default function EmailLog() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [intervalSec, setIntervalSec] = useState<string>("10");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_email_send_log_admin" as any, {
      p_limit: 200,
      p_template: template === "all" ? null : template,
    });
    if (!error && Array.isArray(data)) {
      const sorted = [...(data as Row[])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setRows(sorted);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  useEffect(() => {
    if (!autoRefresh) return;
    const ms = Math.max(2, parseInt(intervalSec) || 10) * 1000;
    const id = setInterval(() => load(), ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, intervalSec, template]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link to="/crm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Leads
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Email delivery log</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Filter by template" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              <SelectItem value="proposal-link">Proposal link</SelectItem>
              <SelectItem value="customer-form-link">Questionnaire</SelectItem>
              <SelectItem value="lead-introduction">Lead introduction</SelectItem>
              <SelectItem value="auth_emails">Auth email</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 border rounded-md px-3 py-1.5">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">Auto-refresh</Label>
            <Select value={intervalSec} onValueChange={setIntervalSec} disabled={!autoRefresh}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5s</SelectItem>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="30">30s</SelectItem>
                <SelectItem value="60">60s</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Most recent emails (last 200)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3 font-medium">Sent</th>
                  <th className="p-3 font-medium">Template</th>
                  <th className="p-3 font-medium">Recipient</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No emails yet.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.message_id} className="border-t">
                    <td className="p-3 whitespace-nowrap">
                      {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                    </td>
                    <td className="p-3">{TEMPLATE_LABELS[r.template_name] || r.template_name}</td>
                    <td className="p-3">{r.recipient_email}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={STATUS_VARIANTS[r.status] || ""}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-md truncate">
                      {r.error_message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Statuses: <strong>sent</strong> = delivered to the email provider · <strong>pending</strong> = queued ·
        <strong> failed/dlq</strong> = could not be delivered · <strong>bounced/complained</strong> = recipient rejected ·
        <strong> suppressed</strong> = recipient on suppression list.
      </p>
    </div>
  );
}
