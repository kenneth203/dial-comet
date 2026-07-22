import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BillingSettings {
  id: string;
  vat_rate: number;
  default_package: string;
  default_call_rate: number;
}

export function BillingSettingsTab() {
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    vat_rate: 0.20,
    default_package: 'Standard Package',
    default_call_rate: 0.05
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('billing_settings')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings(data);
        setFormData({
          vat_rate: data.vat_rate,
          default_package: data.default_package,
          default_call_rate: data.default_call_rate
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: "Error",
        description: "Failed to fetch billing settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (settings) {
        // Update existing settings
        const { error } = await supabase
          .from('billing_settings')
          .update(formData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Create new settings
        const { error } = await supabase
          .from('billing_settings')
          .insert([formData]);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Billing settings updated successfully",
      });

      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Error",
        description: "Failed to save billing settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Billing Settings
          </CardTitle>
          <CardDescription>
            Configure default values for the billing system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="vat_rate">VAT Rate</Label>
                <div className="relative">
                  <Input
                    id="vat_rate"
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={formData.vat_rate}
                    onChange={(e) => setFormData({
                      ...formData,
                      vat_rate: parseFloat(e.target.value) || 0
                    })}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-muted-foreground">
                    {(formData.vat_rate * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  VAT rate applied to all invoices (e.g., 0.20 for 20%)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_package">Default Package Name</Label>
                <Input
                  id="default_package"
                  value={formData.default_package}
                  onChange={(e) => setFormData({
                    ...formData,
                    default_package: e.target.value
                  })}
                  placeholder="Standard Package"
                />
                <p className="text-sm text-muted-foreground">
                  Default package name for new customers
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="default_call_rate">Default Call Rate (£)</Label>
                <Input
                  id="default_call_rate"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={formData.default_call_rate}
                  onChange={(e) => setFormData({
                    ...formData,
                    default_call_rate: parseFloat(e.target.value) || 0
                  })}
                />
                <p className="text-sm text-muted-foreground">
                  Default rate per call for new customers
                </p>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Current billing system status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Database Status</p>
              <p className="text-lg font-semibold text-green-600">Active</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Current Period</p>
              <p className="text-lg font-semibold">
                {new Date().toISOString().slice(0, 7)}
              </p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">Access Level</p>
              <p className="text-lg font-semibold text-blue-600">Kenneth Pote</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Process Workflow</CardTitle>
          <CardDescription>Standard procedure for monthly billing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div>
                <p className="font-medium">Upload Monthly Call Log</p>
                <p className="text-sm text-muted-foreground">
                  Use the Call Logs tab to import call data for the billing period
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div>
                <p className="font-medium">Auto-Match Calls to Customers</p>
                <p className="text-sm text-muted-foreground">
                  System automatically links calls to customer records
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                3
              </div>
              <div>
                <p className="font-medium">Generate Invoices</p>
                <p className="text-sm text-muted-foreground">
                  Create invoices with usage summary and charges
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                4
              </div>
              <div>
                <p className="font-medium">Export & Distribute</p>
                <p className="text-sm text-muted-foreground">
                  Download invoices and reports for distribution
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}