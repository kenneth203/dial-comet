import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer, Download, ArrowLeft, Send } from "lucide-react";
import { type Package } from "@/context/PackagesContext";
import { format } from "date-fns";
import { formatGBP } from "@/lib/currency";

interface ProposalInvoiceTabProps {
  selectedPackage: Package;
  clientName: string;
  companyName: string;
  clientAddress: string;
  invoiceNumber: string;
  serviceLabel?: string;
  onBack: () => void;
  onSubmit: () => void;
}

export function ProposalInvoiceTab({
  selectedPackage,
  clientName,
  companyName,
  clientAddress,
  invoiceNumber,
  serviceLabel = "VA",
  onBack,
  onSubmit,
}: ProposalInvoiceTabProps) {
  const today = format(new Date(), "dd/MM/yyyy");
  const subtotal = selectedPackage.price;
  const taxRate = 0.20;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Print / Download bar */}
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" /> Print
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Download className="h-4 w-4 mr-2" /> Download PDF
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <img
          src="/va-team-logo.png"
          alt="The VA Team"
          className="h-16"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="text-right text-sm">
          <p className="font-semibold">{serviceLabel === "VR" ? "Call Answering Service" : serviceLabel === "CL" ? "Call Answering Service (Clinic)" : serviceLabel === "CB" ? "Call Answering Service (Bookings)" : serviceLabel === "AI" ? "AI Call Handling Service" : serviceLabel === "DT" ? "Digital Typing Service" : "Virtual Assistant Service"}</p>
          <p className="text-muted-foreground">Invoice #{invoiceNumber} {today}</p>
        </div>
      </div>

      <Separator />

      {/* To / From */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">To:</p>
          <div className="border rounded-md p-3 text-sm space-y-0.5">
            <p className="font-semibold">{companyName || clientName}</p>
            {clientAddress ? (
              clientAddress.split("\n").map((line, i) => <p key={i}>{line}</p>)
            ) : (
              <p className="text-muted-foreground italic">Address not provided</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-1">From:</p>
          <div className="border rounded-md p-3 text-sm space-y-0.5">
            <p className="font-semibold">The VA Team Limited</p>
            <p>02034740859</p>
            <p>info@thevateam.co.uk</p>
            <p className="mt-2">Easthampstead Works,</p>
            <p>Easthampstead House,</p>
            <p>Bracknell RG12 1BH</p>
            <p>United Kingdom</p>
          </div>
        </div>
      </div>

      {/* Line items table */}
      <div className="border rounded-md overflow-x-auto">
        <div className="grid grid-cols-12 bg-muted/50 p-3 text-sm font-medium">
          <span className="col-span-5">Item</span>
          <span className="col-span-2 text-center">Qty/Hrs</span>
          <span className="col-span-1 text-center">Tax</span>
          <span className="col-span-2 text-right">Price</span>
          <span className="col-span-2 text-right">Subtotal</span>
        </div>
        <div className="grid grid-cols-12 p-3 text-sm border-t">
          <span className="col-span-5">{selectedPackage.name} ({serviceLabel}) — Monthly</span>
          <span className="col-span-2 text-center">{serviceLabel === "VR" || serviceLabel === "CL" || serviceLabel === "CB" ? `${selectedPackage.minutes} calls` : serviceLabel === "AI" ? `${selectedPackage.aiCallsAllocated} calls` : serviceLabel === "DT" ? "Per min" : `${selectedPackage.packagedHours}h`}</span>
          <span className="col-span-1 text-center">20%</span>
          <span className="col-span-2 text-right">{formatGBP(subtotal)}</span>
          <span className="col-span-2 text-right">{formatGBP(subtotal)}</span>
        </div>
      </div>

      {/* Payment Plan */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Payment Plan</h3>
        <div className="border rounded-md overflow-x-auto">
          <div className="grid grid-cols-3 bg-muted/50 p-3 text-sm font-medium">
            <span>Status</span>
            <span>Due Date</span>
            <span>Amount Due</span>
          </div>
          <div className="grid grid-cols-3 p-3 text-sm text-muted-foreground">
            <span>Pending</span>
            <span>Upon agreement</span>
            <span>{formatGBP(total)}</span>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="space-y-1 text-sm text-right">
          <div className="flex justify-between gap-8">
            <span className="font-medium">Subtotal:</span>
            <span>{formatGBP(subtotal)}</span>
          </div>
          <div className="flex justify-between gap-8">
            <span className="font-medium">Tax (20%):</span>
            <span>{formatGBP(tax)}</span>
          </div>
          <Separator className="my-1" />
          <div className="flex justify-between gap-8 text-base font-semibold">
            <span>Total:</span>
            <span>{formatGBP(total)}</span>
          </div>
          <div className="flex justify-between gap-8 text-muted-foreground">
            <span className="font-medium">Remainder:</span>
            <span>{formatGBP(total)}</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Footer notes */}
      <div className="text-sm text-muted-foreground space-y-1">
        <p>All invoices are due within 7 days from the date shown on the invoice.</p>
        <p>Please note that your services might be suspended if this invoice is not settled within this period.</p>
        <p className="mt-2 font-medium text-foreground">Our Banking Details:</p>
        <p>Account Name: The VA Team Limited</p>
        <p>Account: 93528582</p>
        <p>Sort code: 51-81-22</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-2 print:hidden">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Agreement
        </Button>
        <Button className="flex-1" onClick={onSubmit}>
          <Send className="h-4 w-4 mr-2" /> Submit & Send to Customer
        </Button>
      </div>
    </div>
  );
}
