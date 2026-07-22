import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Calendar, Users } from "lucide-react";

interface LeaveQuotaDefaults {
  year: number;
  base_annual: number;
  bank_holidays: number;
  christmas_closure_days: number;
  applied_at?: string;
}

export function LeaveQuotasTab() {
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [quotaData, setQuotaData] = useState<LeaveQuotaDefaults | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    base_annual: 25,
    bank_holidays: 10,
    christmas_closure_days: 5
  });

  const currentYear = new Date().getFullYear();
  const periodOptions = [
    { value: currentYear.toString(), label: `Current Year (01 Jan - 31 Dec ${currentYear})` },
    { value: (currentYear + 1).toString(), label: `Next Year (01 Jan - 31 Dec ${currentYear + 1})` },
    { value: (currentYear + 2).toString(), label: (currentYear + 2).toString() }
  ];

  // Load existing data when period changes
  useEffect(() => {
    if (selectedPeriod) {
      loadQuotaData(parseInt(selectedPeriod));
    }
  }, [selectedPeriod]);

  const loadQuotaData = async (year: number) => {
    try {
      const { data, error } = await supabase
        .from('leave_quota_defaults')
        .select('*')
        .eq('year', year)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is ok
        console.error('Error loading quota data:', error);
        return;
      }

      if (data) {
        setQuotaData(data);
        setFormData({
          base_annual: data.base_annual,
          bank_holidays: data.bank_holidays,
          christmas_closure_days: data.christmas_closure_days
        });
      } else {
        // Reset to defaults for new year
        setQuotaData(null);
        setFormData({
          base_annual: 25,
          bank_holidays: 10,
          christmas_closure_days: 5
        });
      }
    } catch (error) {
      console.error('Error loading quota data:', error);
    }
  };

  const handleSave = async () => {
    if (!selectedPeriod) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('upsert_leave_quota_defaults', {
        p_year: parseInt(selectedPeriod),
        p_base_annual: formData.base_annual,
        p_bank_holidays: formData.bank_holidays,
        p_christmas_closure_days: formData.christmas_closure_days
      });

      if (error) throw error;

      setQuotaData(data);
      setIsDialogOpen(false);
      toast({
        title: "Success",
        description: `Leave quotas saved for ${selectedPeriod}`,
      });
    } catch (error) {
      console.error('Error saving quota data:', error);
      toast({
        title: "Error",
        description: "Failed to save leave quotas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyDefaults = async () => {
    if (!selectedPeriod || !quotaData) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('apply_leave_quota_defaults', {
        p_year: parseInt(selectedPeriod)
      });

      if (error) throw error;

      const result = data as any;
      toast({
        title: "Success",
        description: `Applied defaults to ${result.updated_users} active users for ${selectedPeriod}`,
      });

      // Reload data to get updated applied_at timestamp
      loadQuotaData(parseInt(selectedPeriod));
    } catch (error) {
      console.error('Error applying defaults:', error);
      toast({
        title: "Error",
        description: "Failed to apply defaults to users",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Leave Quotas Configuration
        </CardTitle>
        <CardDescription>
          Set default leave quotas for different periods and apply them to all active users
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="period-select">Select Period</Label>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger id="period-select">
              <SelectValue placeholder="Choose a period..." />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedPeriod && (
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-lg font-semibold">Current Settings for {selectedPeriod}</h3>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-1" />
                    Edit Quotas
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Leave Quotas for {selectedPeriod}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="base-annual">Base Annual</Label>
                      <Input
                        id="base-annual"
                        type="number"
                        min="0"
                        step="0.5"
                        value={formData.base_annual}
                        onChange={(e) => setFormData(prev => ({ ...prev, base_annual: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bank-holidays">Bank Holidays</Label>
                      <Input
                        id="bank-holidays"
                        type="number"
                        min="0"
                        step="0.5"
                        value={formData.bank_holidays}
                        onChange={(e) => setFormData(prev => ({ ...prev, bank_holidays: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="christmas-closure">Christmas Closure Days</Label>
                      <Input
                        id="christmas-closure"
                        type="number"
                        min="0"
                        step="0.5"
                        value={formData.christmas_closure_days}
                        onChange={(e) => setFormData(prev => ({ ...prev, christmas_closure_days: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading}>
                      {isLoading ? "Saving..." : "Save Quotas"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {quotaData ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Base Annual:</span>
                  <div className="font-medium">{quotaData.base_annual} days</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Bank Holidays:</span>
                  <div className="font-medium">{quotaData.bank_holidays} days</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Christmas Closure:</span>
                  <div className="font-medium">{quotaData.christmas_closure_days} days</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                No quotas configured for {selectedPeriod}. Click "Edit Quotas" to set them up.
              </div>
            )}

            {quotaData && (
              <div className="flex items-center justify-between pt-4 border-t flex-wrap gap-2">
                <div className="text-sm text-muted-foreground">
                  {quotaData.applied_at ? (
                    <>Applied to users on {new Date(quotaData.applied_at).toLocaleDateString('en-GB')}</>
                  ) : (
                    <>Not yet applied to users</>
                  )}
                </div>
                <Button 
                  onClick={handleApplyDefaults}
                  disabled={isLoading}
                  size="sm"
                >
                  <Users className="h-4 w-4 mr-1" />
                  {isLoading ? "Applying..." : "Apply to All Users"}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}