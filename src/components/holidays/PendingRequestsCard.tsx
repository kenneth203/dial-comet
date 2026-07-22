import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { useHoliday } from "@/context/HolidayContext";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Check, X, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { checkHolidayAllocation, type AllocationCheck } from "@/lib/holidayAllocation";
import { toast } from "@/hooks/use-toast";

const absenceTypeLabels = {
  annual_leave: "Annual Leave",
  sick_leave: "Sick Leave",
  maternity_leave: "Maternity Leave",
  paternity_leave: "Paternity Leave",
  compassionate_leave: "Compassionate Leave",
  study_leave: "Study Leave",
  unpaid_leave: "Unpaid Leave",
  public_holiday: "Bank Holiday/Closures"
};

export function PendingRequestsCard() {
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { pendingRequests, approveRequest, declineRequest } = useHoliday();
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [action, setAction] = useState<'approve' | 'decline' | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allocation, setAllocation] = useState<AllocationCheck | null>(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [overrideAllocation, setOverrideAllocation] = useState(false);
  const [convertToUnpaid, setConvertToUnpaid] = useState(false);

  const activeRequest = pendingRequests.find(r => r.id === selectedRequest) || null;
  const overridableType =
    activeRequest?.absence_type === 'sick_leave' ||
    activeRequest?.absence_type === 'compassionate_leave';
  const canOverride = isSuperAdmin && overridableType;

  // Load allocation info when opening the approve dialog
  useEffect(() => {
    let cancelled = false;
    if (action === 'approve' && activeRequest) {
      setAllocLoading(true);
      setAllocation(null);
      checkHolidayAllocation({
        user_id: (activeRequest as any).user_id,
        system_user_id: (activeRequest as any).system_user_id,
        absence_type: activeRequest.absence_type,
        start_date: activeRequest.start_date,
        total_days: activeRequest.total_days,
      })
        .then(res => { if (!cancelled) setAllocation(res); })
        .catch(err => {
          console.error('allocation check failed', err);
          if (!cancelled) setAllocation(null);
        })
        .finally(() => { if (!cancelled) setAllocLoading(false); });
    } else {
      setAllocation(null);
    }
    return () => { cancelled = true; };
  }, [action, activeRequest?.id]);

  const handleApprove = async () => {
    if (!selectedRequest || !user) return;

    const insufficient = !!(allocation && allocation.deducts && !allocation.hasEnough);
    const usingOverride = canOverride && (overrideAllocation || convertToUnpaid);

    if (insufficient && !usingOverride) {
      toast({
        title: 'Insufficient allocation',
        description: `${activeRequest?.user_name ?? 'This user'} only has ${allocation!.remaining} ${allocation!.bucketLabel} day(s) left for ${allocation!.year} but needs ${allocation!.requested}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await approveRequest(selectedRequest, user.id, {
        override: canOverride ? overrideAllocation : false,
        convertToUnpaid: canOverride ? convertToUnpaid : false,
      });
      setSelectedRequest(null);
      setAction(null);
      setOverrideAllocation(false);
      setConvertToUnpaid(false);
    } catch (error) {
      console.error('Error approving request:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!selectedRequest || !user || !declineReason.trim()) return;
    
    setIsLoading(true);
    try {
      await declineRequest(selectedRequest, declineReason, user.id);
      setSelectedRequest(null);
      setAction(null);
      setDeclineReason('');
    } catch (error) {
      console.error('Error declining request:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const openApprovalDialog = (requestId: string, actionType: 'approve' | 'decline') => {
    setSelectedRequest(requestId);
    setAction(actionType);
    setOverrideAllocation(false);
    setConvertToUnpaid(false);
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setAction(null);
    setDeclineReason('');
    setOverrideAllocation(false);
    setConvertToUnpaid(false);
  };

  const insufficient = !!(allocation && allocation.deducts && !allocation.hasEnough);
  const overrideActive = canOverride && (overrideAllocation || convertToUnpaid);
  const approveDisabled =
    isLoading ||
    allocLoading ||
    (action === 'approve' && insufficient && !overrideActive);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pending Requests</CardTitle>
          <CardDescription>
            Holiday requests awaiting manager approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No pending requests</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">
                        {request.user_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {absenceTypeLabels[request.absence_type]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {format(new Date(request.start_date), 'dd/MM/yyyy')} - {format(new Date(request.end_date), 'dd/MM/yyyy')}
                          </div>
                          {request.reason && (
                            <div className="text-xs text-muted-foreground">{request.reason}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{request.total_days}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openApprovalDialog(request.id, 'approve')}
                          className="text-green-600 hover:text-green-700"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openApprovalDialog(request.id, 'decline')}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Decline
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval/Decline Dialog */}
      <Dialog open={selectedRequest !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Request' : 'Decline Request'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve'
                ? `Review ${activeRequest?.user_name ?? 'the employee'}'s remaining allocation before approving.`
                : 'Please provide a reason for declining this request.'}
            </DialogDescription>
          </DialogHeader>

          {action === 'approve' && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              {allocLoading && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking allocation…
                </div>
              )}

              {!allocLoading && allocation && !allocation.deducts && (
                <div className="text-muted-foreground">
                  <strong>{absenceTypeLabels[activeRequest?.absence_type as keyof typeof absenceTypeLabels]}</strong> does not deduct from a yearly allocation. Approval will not affect any balance.
                </div>
              )}

              {!allocLoading && allocation && allocation.deducts && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{allocation.bucketLabel} ({allocation.year})</span>
                    <span className="font-medium">{allocation.remaining} / {allocation.entitlement} day(s) remaining</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Requested</span>
                    <span className="font-medium">{allocation.requested} day(s)</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-muted-foreground">After approval</span>
                    <span className={`font-semibold ${allocation.hasEnough ? '' : 'text-destructive'}`}>
                      {allocation.remainingAfter} day(s)
                    </span>
                  </div>

                  {!allocation.hasEnough && (
                    <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive p-2 mt-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div>
                        Insufficient {allocation.bucketLabel.toLowerCase()} — short by {Math.abs(allocation.remainingAfter)} day(s).
                        {canOverride
                          ? ' As a Super-Admin you can override the limit or record the absence as Unpaid Leave instead.'
                          : ' Approval is blocked. Increase the entitlement or ask the employee to amend the request.'}
                      </div>
                    </div>
                  )}

                  {canOverride && !allocation.hasEnough && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 mt-2 space-y-3">
                      <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                        <ShieldAlert className="h-4 w-4" />
                        Super-Admin override
                      </div>
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="override-allocation"
                          checked={overrideAllocation}
                          disabled={convertToUnpaid}
                          onCheckedChange={(v) => setOverrideAllocation(v === true)}
                        />
                        <Label htmlFor="override-allocation" className="text-sm leading-snug font-normal cursor-pointer">
                          Override the {allocation.bucketLabel.toLowerCase()} limit and approve anyway
                          <span className="block text-xs text-muted-foreground">
                            The bucket will still be deducted and may go negative. An audit note is added to the request.
                          </span>
                        </Label>
                      </div>
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id="convert-unpaid"
                          checked={convertToUnpaid}
                          disabled={overrideAllocation}
                          onCheckedChange={(v) => setConvertToUnpaid(v === true)}
                        />
                        <Label htmlFor="convert-unpaid" className="text-sm leading-snug font-normal cursor-pointer">
                          Record as Unpaid Leave instead
                          <span className="block text-xs text-muted-foreground">
                            The day is logged but no Sick / Compassionate allocation is used.
                          </span>
                        </Label>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {action === 'decline' && (
            <div className="space-y-2">
              <Label htmlFor="decline-reason">Reason for declining</Label>
              <Textarea
                id="decline-reason"
                placeholder="Please explain why this request is being declined..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={action === 'approve' ? handleApprove : handleDecline}
              disabled={
                action === 'approve'
                  ? approveDisabled
                  : isLoading || !declineReason.trim()
              }
              variant={action === 'approve' ? 'default' : 'destructive'}
            >
              {isLoading ? 'Processing...' : (action === 'approve' ? 'Approve' : 'Decline')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
