import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCustomers, type CustomerContact } from "@/context/CustomersContext";
import { secureLog } from "@/lib/secureLogger";

interface ContactOOODialogProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  contact: CustomerContact | null;
}

const toInputDate = (d?: Date | string): string => {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM-dd");
};

export function ContactOOODialog({ isOpen, onClose, customerId, customerName, contact }: ContactOOODialogProps) {
  const { toast } = useToast();
  const { refreshCustomers } = useCustomers();
  const [reason, setReason] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [untilDate, setUntilDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && contact) {
      setReason(contact.oooReason || "");
      setFromDate(toInputDate(contact.oooFromDate));
      setUntilDate(toInputDate(contact.oooUntilDate));
    }
  }, [isOpen, contact]);

  if (!contact) return null;

  const contactName = `${contact.firstName || ""} ${contact.surname || ""}`.trim() || "Contact";
  const hasExisting = !!(contact.oooReason || contact.oooFromDate || contact.oooUntilDate);

  const callRpc = async (payload: {
    p_customer_id: string;
    p_contact_id: string;
    p_reason: string | null;
    p_from: string | null;
    p_until: string | null;
  }) => {
    const { error } = await (supabase.rpc as any)("update_customer_contact_ooo", payload);
    if (error) throw error;
  };

  const handleSave = async () => {
    if (!reason.trim() || !fromDate || !untilDate) {
      toast({
        title: "Missing information",
        description: "Please enter a reason and both dates.",
        variant: "destructive",
      });
      return;
    }
    if (new Date(untilDate) < new Date(fromDate)) {
      toast({
        title: "Invalid dates",
        description: "The 'Until' date must be on or after the 'From' date.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await callRpc({
        p_customer_id: customerId,
        p_contact_id: contact.id,
        p_reason: reason.trim(),
        p_from: fromDate,
        p_until: untilDate,
      });
      await refreshCustomers();
      toast({
        title: "Out of Office saved",
        description: `OOO recorded for ${contactName} at ${customerName}.`,
      });
      onClose();
    } catch (e) {
      secureLog.debug("OOO save failed", { e: String(e) });
      toast({
        title: "Unable to save",
        description: "Out of Office could not be updated. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await callRpc({
        p_customer_id: customerId,
        p_contact_id: contact.id,
        p_reason: null,
        p_from: null,
        p_until: null,
      });
      await refreshCustomers();
      toast({
        title: "Out of Office cleared",
        description: `OOO removed for ${contactName}.`,
      });
      onClose();
    } catch (e) {
      secureLog.debug("OOO clear failed", { e: String(e) });
      toast({
        title: "Unable to clear",
        description: "Out of Office could not be cleared. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Out of Office — {contactName}</DialogTitle>
          <DialogDescription>
            Set or clear the Out of Office notice for this contact. Changes are logged in the script audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="ooo-reason">Reason</Label>
            <Textarea
              id="ooo-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. On annual leave, back Monday"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ooo-from">From</Label>
              <Input
                id="ooo-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ooo-until">Until</Label>
              <Input
                id="ooo-until"
                type="date"
                value={untilDate}
                onChange={(e) => setUntilDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {hasExisting && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              Clear OOO
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
