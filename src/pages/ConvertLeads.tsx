import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight,
  CheckCircle2,
  Search,
  TrendingUp,
  Mail,
  Phone,
  Building2,
  Bell,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useCustomers, type Customer } from "@/context/CustomersContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatGBP } from "@/lib/currency";

type OperatorDelivery = {
  userId: string;
  name: string;
  status: "queued" | "sent" | "read" | "failed";
  createdAt: string | null;
};

type PromotionDelivery = {
  customerId: string;
  customerName: string;
  promotedAt: string | null;
  operators: OperatorDelivery[];
  counts: { queued: number; sent: number; read: number; failed: number };
};

export default function ConvertLeads() {
  const { customers, updateCustomer } = useCustomers();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [confirmLead, setConfirmLead] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  const leads = customers.filter(
    (c) =>
      c.status === "Lead" &&
      (search.trim() === "" ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.contact || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.email || "").toLowerCase().includes(search.toLowerCase()))
  );

  const [deliveries, setDeliveries] = useState<PromotionDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);


  const loadDeliveryStatus = useCallback(async () => {
    setLoadingDeliveries(true);
    try {
      // 1. Pull recent customer_activated notifications
      const { data: notifs, error: notifErr } = await (supabase
        .from("task_notifications") as any)
        .select("user_id, related_id, is_read, created_at")
        .eq("type", "customer_activated")
        .order("created_at", { ascending: false })
        .limit(500);
      if (notifErr) throw notifErr;

      // 2. Current active operators (the expected recipients)
      const { data: operators, error: opErr } = await supabase
        .from("profiles")
        .select("user_id, name")
        .eq("role", "Operator")
        .eq("status", "Active");
      if (opErr) throw opErr;

      const operatorList = (operators || []).filter((o) => !!o.user_id);

      // 3. Group notifications by customer (related_id)
      const byCustomer = new Map<string, any[]>();
      (notifs || []).forEach((n: any) => {
        if (!n.related_id) return;
        const arr = byCustomer.get(n.related_id) || [];
        arr.push(n);
        byCustomer.set(n.related_id, arr);
      });

      const customerNameLookup = new Map(customers.map((c) => [c.id, c.name]));

      const result: PromotionDelivery[] = [];
      byCustomer.forEach((rows, customerId) => {
        const latestByUser = new Map<string, any>();
        rows.forEach((r) => {
          const existing = latestByUser.get(r.user_id);
          if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
            latestByUser.set(r.user_id, r);
          }
        });

        const opsRows: OperatorDelivery[] = operatorList.map((op) => {
          const row = latestByUser.get(op.user_id as string);
          if (!row) {
            return {
              userId: op.user_id as string,
              name: op.name || "Unknown",
              status: "failed" as const,
              createdAt: null,
            };
          }
          const ageMs = Date.now() - new Date(row.created_at).getTime();
          // Treat very fresh, unread rows as "queued" awaiting client delivery
          const status: OperatorDelivery["status"] = row.is_read
            ? "read"
            : ageMs < 15_000
            ? "queued"
            : "sent";
          return {
            userId: op.user_id as string,
            name: op.name || "Unknown",
            status,
            createdAt: row.created_at,
          };
        });

        const promotedAt = rows
          .map((r) => r.created_at)
          .sort()
          .slice(-1)[0] || null;

        const counts = opsRows.reduce(
          (acc, o) => {
            acc[o.status] += 1;
            return acc;
          },
          { queued: 0, sent: 0, read: 0, failed: 0 }
        );

        result.push({
          customerId,
          customerName: customerNameLookup.get(customerId) || "Unknown customer",
          promotedAt,
          operators: opsRows,
          counts,
        });
      });

      result.sort((a, b) => {
        const at = a.promotedAt ? new Date(a.promotedAt).getTime() : 0;
        const bt = b.promotedAt ? new Date(b.promotedAt).getTime() : 0;
        return bt - at;
      });

      setDeliveries(result.slice(0, 25));
    } catch (err) {
      console.error("Failed to load delivery status:", err);
      toast({
        title: "Could not load delivery status",
        description: "Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingDeliveries(false);
    }
  }, [customers, toast]);

  useEffect(() => {
    loadDeliveryStatus();
  }, [loadDeliveryStatus]);

  const notifyOperators = async (customerName: string, customerId: string) => {
    try {
      const { data: operators } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("role", "Operator")
        .eq("status", "Active");

      if (!operators || operators.length === 0) return;

      const rows = operators
        .filter((o) => !!o.user_id)
        .map((o) => ({
          user_id: o.user_id as string,
          type: "customer_activated",
          message: `New active customer available in the directory: ${customerName}`,
          related_id: customerId,
          is_read: false,
        }));

      if (rows.length > 0) {
        await (supabase.from("task_notifications") as any).insert(rows);
      }
    } catch (err) {
      console.error("Failed to notify operators:", err);
    }
  };

  const handlePromote = async () => {
    if (!confirmLead) return;
    setBusy(true);
    try {
      const ok = await updateCustomer(confirmLead.id, {
        status: "Active",
        leadMetadata: {
          ...(confirmLead.leadMetadata || {}),
          pipelineStatus: "won",
        },
      });
      if (ok) {
        await notifyOperators(confirmLead.name, confirmLead.id);
        toast({
          title: "Lead promoted to Active",
          description: `${confirmLead.name} is now visible in the operator directory.`,
        });
        setConfirmLead(null);
        // Refresh delivery view to surface queued/sent/failed status
        loadDeliveryStatus();
      } else {
        toast({
          title: "Promotion failed",
          description: "Please try again or contact support.",
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Convert Leads to Active Customers | The VA Team Portal</title>
        <meta
          name="description"
          content="Promote qualified leads to active customers and notify operators."
        />
      </Helmet>

      <main className="container max-w-[1400px] py-6 px-3 sm:px-6 space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-gradient">
            Convert Leads to Active Customers
          </h1>
          <p className="text-muted-foreground">
            Review qualified leads and promote them to Active. Once converted, the customer
            appears in the operator directory and all operators receive a notification.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Pending Leads ({leads.length})
                </CardTitle>
                <CardDescription>Only Admin/Supervisor roles can promote leads.</CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-muted-foreground/60" />
                <p>No leads waiting for conversion.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {leads.map((lead) => {
                  const meta = lead.leadMetadata || {};
                  const primaryContact = (lead.contacts || []).find((c) => !c.hidden);
                  const contactName = primaryContact
                    ? `${primaryContact.firstName || ""} ${primaryContact.surname || ""}`.trim()
                    : lead.contact || "";
                  const contactEmail = primaryContact?.email || lead.email || "";
                  const contactPhone = primaryContact?.mobile || lead.phone || "";
                  return (
                    <Card key={lead.id} className="flex flex-col">
                      <CardContent className="p-4 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 font-semibold truncate">
                              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{lead.name}</span>
                            </div>
                            {contactName && (
                              <div className="text-sm text-muted-foreground truncate">
                                {contactName}
                              </div>
                            )}
                          </div>
                          <Badge variant="secondary" className="capitalize shrink-0">
                            {(meta.pipelineStatus || "new").replace("_", " ")}
                          </Badge>
                        </div>

                        <div className="space-y-1 text-sm">
                          {contactEmail && (
                            <div className="flex items-center gap-2 text-muted-foreground truncate">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{contactEmail}</span>
                            </div>
                          )}
                          {contactPhone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0" />
                              <span>{contactPhone}</span>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded-md p-2">
                          <div>
                            <div className="text-muted-foreground">Source</div>
                            <div className="font-medium capitalize">
                              {(meta.source || "—").replace("_", " ")}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Value</div>
                            <div className="font-medium">{formatGBP(meta.value || 0)}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-muted-foreground">Last contact</div>
                            <div className="font-medium">
                              {meta.lastContact
                                ? new Date(meta.lastContact).toLocaleDateString("en-GB")
                                : "Never"}
                            </div>
                          </div>
                        </div>

                        <Button
                          className="mt-auto"
                          onClick={() => setConfirmLead(lead)}
                        >
                          Promote to Active
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Delivery Status
                </CardTitle>
                <CardDescription>
                  Recent lead promotions and whether each active operator received the in-app alert.
                  Status reflects current data: <strong>queued</strong> (just sent, &lt;15s),{" "}
                  <strong>sent</strong> (delivered, unread), <strong>read</strong> (opened), or{" "}
                  <strong>failed</strong> (no notification row for an active operator).
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadDeliveryStatus}
                disabled={loadingDeliveries}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${loadingDeliveries ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                <p>No promotion notifications recorded yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {deliveries.map((d) => (
                  <div key={d.customerId} className="border rounded-md">
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 border-b">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{d.customerName}</div>
                        <div className="text-xs text-muted-foreground">
                          Promoted{" "}
                          {d.promotedAt
                            ? new Date(d.promotedAt).toLocaleString("en-GB")
                            : "—"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {d.counts.queued > 0 && (
                          <Badge variant="secondary">Queued: {d.counts.queued}</Badge>
                        )}
                        <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/15 border-transparent">
                          Sent: {d.counts.sent}
                        </Badge>
                        <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/15 border-transparent">
                          Read: {d.counts.read}
                        </Badge>
                        {d.counts.failed > 0 && (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Failed: {d.counts.failed}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Operator</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Delivered at</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.operators.map((op) => (
                          <TableRow key={op.userId}>
                            <TableCell className="font-medium">{op.name}</TableCell>
                            <TableCell>
                              {op.status === "failed" ? (
                                <Badge variant="destructive">Failed</Badge>
                              ) : op.status === "read" ? (
                                <Badge className="bg-green-500/15 text-green-700 hover:bg-green-500/15 border-transparent">
                                  Read
                                </Badge>
                              ) : op.status === "queued" ? (
                                <Badge variant="secondary">Queued</Badge>
                              ) : (
                                <Badge className="bg-blue-500/15 text-blue-700 hover:bg-blue-500/15 border-transparent">
                                  Sent
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {op.createdAt
                                ? new Date(op.createdAt).toLocaleString("en-GB")
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>


      <AlertDialog
        open={!!confirmLead}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmLead(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote {confirmLead?.name} to Active?</AlertDialogTitle>
            <AlertDialogDescription>
              This customer will become visible in the operator directory and all operators
              will receive an in-app notification. This action can be reversed by editing the
              customer's status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePromote} disabled={busy}>
              {busy ? "Promoting..." : "Promote to Active"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
