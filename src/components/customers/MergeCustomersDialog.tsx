import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Customer } from "@/context/CustomersContext";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MergeCustomersDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onMerge: (targetId: string, sourceId: string) => void;
  customers: Customer[];
}

export function MergeCustomersDialog({ isOpen, onClose, onMerge, customers }: MergeCustomersDialogProps) {
  const [targetId, setTargetId] = useState("");
  const [sourceId, setSourceId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetId && sourceId && targetId !== sourceId) {
      onMerge(targetId, sourceId);
      onClose();
      setTargetId("");
      setSourceId("");
    }
  };

  const availableTargets = customers.filter(c => c.id !== sourceId);
  const availableSources = customers.filter(c => c.id !== targetId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Merge Customers</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert>
            <AlertDescription>
              Select which customer to keep (target) and which to merge into it (source). 
              The source customer will be deleted and its data merged into the target.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <Label htmlFor="target">Keep Customer (Target)</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer to keep" />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name} - {customer.contact}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Merge From (Source)</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer to merge from" />
              </SelectTrigger>
              <SelectContent>
                {availableSources.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name} - {customer.contact}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!targetId || !sourceId || targetId === sourceId}
              variant="destructive"
            >
              Merge Customers
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}