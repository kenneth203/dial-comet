import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Palette, Edit, Trash2, Calendar, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const leaveTypes = [
  {
    id: "annual_leave",
    name: "Paid Time Off",
    description: "Annual leave entitlement for rest and recreation",
    color: "bg-pink-200 border-pink-300 text-pink-800",
    defaultDays: 25
  },
  {
    id: "sick_leave", 
    name: "Sick Leave",
    description: "Medical leave for illness or injury",
    color: "bg-yellow-200 border-yellow-300 text-yellow-800",
    defaultDays: 10
  },
  {
    id: "maternity_leave",
    name: "Maternity Leave", 
    description: "Leave for mothers following childbirth",
    color: "bg-purple-200 border-purple-300 text-purple-800",
    defaultDays: 52
  },
  {
    id: "paternity_leave",
    name: "Paternity Leave",
    description: "Leave for fathers following childbirth",
    color: "bg-blue-200 border-blue-300 text-blue-800", 
    defaultDays: 2
  },
  {
    id: "compassionate_leave",
    name: "Compassionate Leave",
    description: "Leave for bereavement or family emergencies",
    color: "bg-gray-200 border-gray-300 text-gray-800",
    defaultDays: 5
  },
  {
    id: "study_leave",
    name: "Study Leave",
    description: "Leave for educational purposes and training",
    color: "bg-green-200 border-green-300 text-green-800",
    defaultDays: 5
  },
  {
    id: "unpaid_leave",
    name: "Unpaid Leave", 
    description: "Extended leave without pay",
    color: "bg-orange-200 border-orange-300 text-orange-800",
    defaultDays: 0
  },
  {
    id: "public_holiday",
    name: "Bank Holiday/Closures",
    description: "Bank holidays and public holidays",
    color: "bg-red-200 border-red-300 text-red-800",
    defaultDays: 8
  }
];

interface HolidayRule {
  year: number;
  base_annual: number;
  bank_holidays: number;
  christmas_closure_days: number;
  created_at: string;
  updated_at: string;
  applied_at?: string;
}

export function LeaveTypesManagement() {
  const [holidayRules, setHolidayRules] = useState<HolidayRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHolidayRules();
  }, []);

  const loadHolidayRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leave_quota_defaults')
        .select('*')
        .order('year', { ascending: false });

      if (error) throw error;
      setHolidayRules(data || []);
    } catch (error: any) {
      console.error('Error loading holiday rules:', error);
      toast.error('Failed to load holiday rules');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (leaveType: typeof leaveTypes[0]) => {
    // TODO: Implement edit functionality
  };

  const handleDelete = (leaveType: typeof leaveTypes[0]) => {
    // TODO: Implement delete functionality
  };

  const handleEditHolidayRule = (rule: HolidayRule) => {
    // TODO: Implement edit functionality for holiday rules
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Leave Types Configuration
          </CardTitle>
          <CardDescription>
            Manage and configure different types of leave available in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0"><div className="min-w-[600px] px-4 sm:px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Leave Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Color Preview</TableHead>
                <TableHead className="text-right">Default Days</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveTypes.map((leaveType) => (
                <TableRow key={leaveType.id}>
                  <TableCell className="font-medium">
                    {leaveType.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {leaveType.description}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`${leaveType.color} text-xs`}
                    >
                      {leaveType.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {leaveType.defaultDays > 0 ? `${leaveType.defaultDays} days` : 'No limit'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(leaveType)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(leaveType)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div></div>
          
          <div className="mt-6 p-3 sm:p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Color Scheme Information</h4>
            <p className="text-sm text-muted-foreground">
              The colors shown above are used consistently across all holiday displays including the weekly calendar view, 
              monthly calendar, and request forms. Each leave type has a unique color to help distinguish between different 
              types of absences at a glance.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Holiday Rules Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Holiday Rules Configuration
          </CardTitle>
          <CardDescription>
            View and manage holiday allocation rules and default quotas for each year
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : holidayRules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No holiday rules configured yet
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0"><div className="min-w-[580px] px-4 sm:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Base Annual Leave</TableHead>
                  <TableHead className="text-right">Bank Holidays</TableHead>
                  <TableHead className="text-right">Christmas Closure</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidayRules.map((rule) => (
                  <TableRow key={rule.year}>
                    <TableCell className="font-medium">
                      {rule.year}
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.base_annual} days
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.bank_holidays} days
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.christmas_closure_days} days
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={rule.applied_at ? "default" : "secondary"}>
                        {rule.applied_at ? "Applied" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditHolidayRule(rule)}
                          className="h-8 w-8 p-0"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div></div>
          )}

          
          <div className="mt-6 p-3 sm:p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Holiday Rules Information</h4>
            <p className="text-sm text-muted-foreground">
              Holiday rules define the default allocations for each year. Base annual leave is the standard 
              entitlement, bank holidays cover public holidays, and Christmas closure days account for 
              company-wide closures during holiday periods. Rules marked as "Applied" are active and being 
              used for new employee entitlements.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}