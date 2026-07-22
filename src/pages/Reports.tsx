import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ClipboardList, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDisplayName } from "@/lib/nameUtils";
import { StandardNavigation } from "@/components/common/StandardNavigation";
import GradientBackdrop from "@/components/common/GradientBackdrop";
import { toast } from "@/hooks/use-toast";

interface TimingRecord {
  id: string;
  user_name: string;
  status: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
}

export default function Reports() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState("daily");
  const [timingData, setTimingData] = useState<TimingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const generateReport = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Get date range based on report type
      const startDate = new Date(selectedDate);
      const endDate = new Date(selectedDate);
      
      if (reportType === "weekly") {
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        endDate.setDate(startDate.getDate() + 6);
      } else if (reportType === "monthly") {
        startDate.setDate(1);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
      }

      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      // Fetch timing logs for the date range
      const { data: logs, error } = await supabase
        .from('status_timing_logs')
        .select('*')
        .gte('timestamp', startDate.toISOString())
        .lte('timestamp', endDate.toISOString())
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Error fetching timing logs:', error);
        toast({
          title: "Error",
          description: "Failed to fetch timing data. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Get user profiles for names
      const userIds = [...new Set(logs?.map(log => log.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name')
        .in('user_id', userIds);

      const profileMap = profiles?.reduce((acc, profile) => {
        const displayName = formatDisplayName(profile.name || '');
        acc[profile.user_id] = displayName;
        return acc;
      }, {} as Record<string, string>) || {};

      // Process logs into timing records
      const records: TimingRecord[] = [];
      const activeSessions: Record<string, any> = {};

      logs?.forEach(log => {
        const sessionKey = `${log.user_id}-${log.status}`;
        
        if (log.action === 'start') {
          activeSessions[sessionKey] = {
            ...log,
            user_name: profileMap[log.user_id] || 'User'
          };
        } else if (log.action === 'end' && activeSessions[sessionKey]) {
          const startLog = activeSessions[sessionKey];
          const startTime = new Date(startLog.timestamp);
          const endTime = new Date(log.timestamp);
          const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

          records.push({
            id: `${startLog.id}-${log.id}`,
            user_name: startLog.user_name,
            status: log.status,
            start_time: startLog.timestamp,
            end_time: log.timestamp,
            duration_minutes: durationMinutes
          });

          delete activeSessions[sessionKey];
        }
      });

      // Add ongoing sessions (started but not ended)
      Object.values(activeSessions).forEach((session: any) => {
        records.push({
          id: session.id,
          user_name: session.user_name,
          status: session.status,
          start_time: session.timestamp,
          end_time: null,
          duration_minutes: null
        });
      });

      setTimingData(records);
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return "Ongoing";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-GB');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground">Please log in to access reports.</p>
        </div>
      </div>
    );
  }

  // Group records by user and date for better display
  const groupedData = timingData.reduce((acc, record) => {
    const date = formatDate(record.start_time);
    const key = `${record.user_name}-${date}`;
    
    if (!acc[key]) {
      acc[key] = {
        user_name: record.user_name,
        date: date,
        records: []
      };
    }
    acc[key].records.push(record);
    return acc;
  }, {} as Record<string, { user_name: string; date: string; records: TimingRecord[] }>);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>The VA Team Portal</title>
        <meta name="description" content="View detailed reports on user status timing and break duration." />
        <link rel="canonical" href={window.location.origin + "/reports"} />
      </Helmet>

      <GradientBackdrop />
      <StandardNavigation currentPage="reports" />

      <main className="container max-w-[2000px] px-3 py-4 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">Status Reports</h1>
            <p className="text-muted-foreground">View timing reports for toilet and coffee breaks</p>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Report Parameters
              </CardTitle>
              <CardDescription>
                Select the date range and generate timing reports
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="reportType">Report Type</Label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="selectedDate">
                    {reportType === 'daily' ? 'Date' : reportType === 'weekly' ? 'Week Starting' : 'Month'}
                  </Label>
                  <Input
                    id="selectedDate"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <Button onClick={generateReport} disabled={isLoading} className="w-full">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    {isLoading ? "Generating..." : "Generate Report"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {timingData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Timing Report Results
                </CardTitle>
                <CardDescription>
                  Break timing data for {reportType} period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {Object.values(groupedData).map((group) => (
                    <div key={`${group.user_name}-${group.date}`} className="border rounded-lg p-4">
                      <h3 className="font-semibold text-lg mb-2">
                        {group.user_name} - {group.date}
                      </h3>
                      
                      <div className="grid gap-2">
                        {group.records.map((record) => (
                          <div
                            key={record.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center gap-4">
                              <span className="text-lg">
                                {record.status === 'toilet' ? '🚽' : '☕'}
                              </span>
                              <div>
                                <p className="font-medium capitalize">{record.status}</p>
                                <p className="text-sm text-muted-foreground">
                                  {formatTime(record.start_time)}
                                  {record.end_time && ` - ${formatTime(record.end_time)}`}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">
                                {formatDuration(record.duration_minutes)}
                              </p>
                              {record.duration_minutes === null && (
                                <p className="text-xs text-orange-500">Still active</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {group.records.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium">
                            Total completed breaks: {group.records.filter(r => r.duration_minutes !== null).length}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Total time: {formatDuration(
                              group.records
                                .filter(r => r.duration_minutes !== null)
                                .reduce((sum, r) => sum + (r.duration_minutes || 0), 0)
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {timingData.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No Data Found</h3>
                <p className="text-muted-foreground">
                  No timing data found for the selected period. Generate a report to see results.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}