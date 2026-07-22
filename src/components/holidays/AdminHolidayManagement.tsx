import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useHoliday } from "@/context/HolidayContext";
import { useAuth } from "@/context/AuthContext";
import { Trash2, Search, Filter, AlertCircle, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { checkHolidayAllocation } from "@/lib/holidayAllocation";


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

const statusIcons = {
  pending: Clock,
  approved: CheckCircle,
  declined: XCircle,
  cancelled: XCircle
};

export function AdminHolidayManagement() {
  const { holidayRequests, deleteHolidayRequest, approveRequest, declineRequest, isAdmin } = useHoliday();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  if (!isAdmin) {
    return null;
  }

  // Filter requests based on search and filters
  const filteredRequests = holidayRequests.filter(request => {
    const matchesSearch = request.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.reason?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || request.status === statusFilter;
    const matchesType = typeFilter === "all" || request.absence_type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleDeleteRequest = async (requestId: string, userName: string) => {
    try {
      await deleteHolidayRequest(requestId);
      toast({
        title: "Request Deleted",
        description: `Holiday request for ${userName} has been deleted`
      });
    } catch (error) {
      console.error('Error deleting request:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    const Icon = statusIcons[status as keyof typeof statusIcons];
    return Icon ? <Icon className="h-4 w-4" /> : null;
  };

  const handleApprove = async (request: any) => {
    try {
      const alloc = await checkHolidayAllocation({
        user_id: request.user_id,
        system_user_id: request.system_user_id,
        absence_type: request.absence_type,
        start_date: request.start_date,
        total_days: request.total_days,
      });
      if (alloc.deducts && !alloc.hasEnough) {
        toast({
          title: 'Insufficient allocation',
          description: `${request.user_name ?? 'This user'} only has ${alloc.remaining} ${alloc.bucketLabel} day(s) left for ${alloc.year} but needs ${alloc.requested}. Approval blocked.`,
          variant: 'destructive',
        });
        return;
      }
      await approveRequest(request.id, user?.id || '');
      if (alloc.deducts) {
        toast({
          title: 'Approved',
          description: `${alloc.bucketLabel} remaining for ${request.user_name}: ${alloc.remainingAfter} day(s).`,
        });
      }
    } catch (err) {
      console.error('approve failed', err);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Holiday Management
        </CardTitle>
        <CardDescription>
          Manage all holiday requests - approve, decline, or delete requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col gap-3 mb-4 sm:mb-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Search by staff name or reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(absenceTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results Summary */}
        <div className="mb-4 text-sm text-muted-foreground">
          Showing {filteredRequests.length} of {holidayRequests.length} requests
        </div>

        {/* Requests Table */}
        {filteredRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No holiday requests found matching your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0"><div className="min-w-[700px] px-4 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="font-medium">{request.user_name}</div>
                      {request.reason && (
                        <div className="text-xs text-muted-foreground mt-1">{request.reason}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {absenceTypeLabels[request.absence_type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {format(new Date(request.start_date), 'dd/MM/yyyy')} - {format(new Date(request.end_date), 'dd/MM/yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>{request.total_days}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[request.status]} flex items-center gap-1 w-fit`} variant="outline">
                        {getStatusIcon(request.status)}
                        {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                      </Badge>
                      {request.status === 'declined' && request.decline_reason && (
                        <div className="text-xs text-red-600 mt-1">{request.decline_reason}</div>
                      )}
                      {request.status === 'approved' && request.approver_name && (
                        <div className="text-xs text-green-600 mt-1">Approved by {request.approver_name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(request.created_at), 'dd/MM/yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        {/* Action buttons for pending requests */}
                        {request.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApprove(request)}
                              className="text-green-600 hover:text-green-700"
                            >
                              Approve
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const reason = prompt("Please provide a reason for declining:");
                                if (reason) {
                                  declineRequest(request.id, reason, user?.id || '');
                                }
                              }}
                              className="text-orange-600 hover:text-orange-700"
                            >
                              Decline
                            </Button>
                          </>
                        )}
                        
                        {/* Delete button - available for all requests */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-red-500" />
                                Delete Holiday Request
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to permanently delete this {request.status} holiday request for <strong>{request.user_name}</strong>? 
                                {request.status === 'approved' && (
                                  <div className="mt-2 p-2 bg-red-50 rounded text-red-700 text-sm">
                                    <strong>Warning:</strong> This will delete an approved holiday request. 
                                    This action should only be used when a staff member leaves or for correcting mistakes.
                                  </div>
                                )}
                                <br /><br />This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteRequest(request.id, request.user_name || 'Unknown')}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete Request
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}