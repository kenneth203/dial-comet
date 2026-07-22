import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useHoliday } from "@/context/HolidayContext";
import { Trash2, Edit, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { EditHolidayRequestDialog } from "./EditHolidayRequestDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const statusColors = {
  pending: "bg-orange-100 text-orange-800 border-orange-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  declined: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-gray-100 text-gray-800 border-gray-200"
};

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

export function MyRequestsCard() {
  const { myRequests, cancelMyHolidayRequest, deleteHolidayRequest, isAdmin } = useHoliday();
  const [editingRequest, setEditingRequest] = useState(null);
  const [cancellingRequests, setCancellingRequests] = useState<Set<string>>(new Set());

  // Filter out cancelled requests and separate pending and processed requests
  const visibleRequests = myRequests.filter(request => request.status !== 'cancelled');
  const pendingMyRequests = visibleRequests.filter(request => request.status === 'pending');
  const nonPendingRequests = visibleRequests.filter(request => request.status !== 'pending');

  const handleCancelRequest = async (requestId: string) => {
    setCancellingRequests(prev => new Set(prev).add(requestId));
    
    try {
      const success = await cancelMyHolidayRequest(requestId);
      if (success) {
        toast({
          title: "Request Cancelled",
          description: "Your holiday request has been cancelled"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to cancel request. Please try again.",
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error cancelling request:', error);
      toast({
        title: "Error", 
        description: error.message || "Failed to cancel request. Please try again.",
        variant: 'destructive'
      });
    } finally {
      setCancellingRequests(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    try {
      await deleteHolidayRequest(requestId);
    } catch (error) {
      console.error('Error deleting request:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Holiday Requests</CardTitle>
        <CardDescription>
          View and manage your approved, declined, and cancelled holiday requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* My Pending Requests Section */}
        {pendingMyRequests.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-3 text-orange-700">My Pending Requests</h4>
            <div className="space-y-2">
              {pendingMyRequests.map((request) => (
                <div key={request.id} className="flex items-start justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg flex-wrap gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{absenceTypeLabels[request.absence_type]}{request.is_unpaid ? " (Unpaid)" : ""}</span>
                      <Badge className="bg-orange-100 text-orange-800 border-orange-200" variant="outline">
                        Pending
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {format(new Date(request.start_date), 'dd/MM/yyyy')} - {format(new Date(request.end_date), 'dd/MM/yyyy')} ({request.total_days} days)
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingRequest(request)}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelRequest(request.id)}
                      disabled={cancellingRequests.has(request.id)}
                      className="text-orange-600 hover:text-orange-700 disabled:opacity-50"
                    >
                      {cancellingRequests.has(request.id) ? 'Cancelling...' : 'Cancel'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Processed Requests Table */}
        {nonPendingRequests.length === 0 && pendingMyRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No holiday requests yet</p>
          </div>
        ) : nonPendingRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No processed holiday requests yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nonPendingRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">
                      {absenceTypeLabels[request.absence_type]}{request.is_unpaid ? " (Unpaid)" : ""}
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
                    <TableCell>
                      <Badge className={statusColors[request.status]} variant="outline">
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Badge>
                      {request.status === 'declined' && request.decline_reason && (
                        <div className="text-xs text-red-600 mt-1">{request.decline_reason}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {/* Edit button - only for pending and declined requests */}
                        {(request.status === 'pending' || request.status === 'declined') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingRequest(request)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        )}
                        
                        {/* Cancel button - only for pending requests */}
                        {request.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelRequest(request.id)}
                            disabled={cancellingRequests.has(request.id)}
                            className="text-orange-600 hover:text-orange-700 disabled:opacity-50"
                          >
                            {cancellingRequests.has(request.id) ? 'Cancelling...' : 'Cancel'}
                          </Button>
                        )}
                        
                        {/* Delete button - for pending/declined requests, and admin delete for approved requests */}
                        {((request.status === 'pending' || request.status === 'declined') || 
                          (request.status === 'approved' && isAdmin)) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {request.status === 'approved' && isAdmin ? 'Admin Delete' : 'Delete'}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertCircle className="h-5 w-5 text-red-500" />
                                  {request.status === 'approved' && isAdmin ? 'Admin Delete Holiday Request' : 'Delete Holiday Request'}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {request.status === 'approved' && isAdmin ? 
                                    'As an admin, you can delete this approved request. This action will permanently remove it from all systems and cannot be undone.' :
                                    'Are you sure you want to permanently delete this holiday request? This action cannot be undone.'
                                  }
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteRequest(request.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {request.status === 'approved' && isAdmin ? 'Admin Delete' : 'Delete Request'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        
        {/* Edit Dialog */}
        {editingRequest && (
          <EditHolidayRequestDialog
            request={editingRequest}
            open={!!editingRequest}
            onOpenChange={(open) => !open && setEditingRequest(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}