import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { type Package } from "@/context/PackagesContext";
import { formatGBP } from "@/lib/currency";

interface AIProposalPackagesTabProps {
  aiPackages: Package[];
  selectedPackageId: string | null;
  onSelectPackage: (id: string) => void;
}

export function AIProposalPackagesTab({ aiPackages, selectedPackageId, onSelectPackage }: AIProposalPackagesTabProps) {
  const renderPackageCard = (pkg: Package) => {
    const isSelected = selectedPackageId === pkg.id;

    return (
      <Card
        key={pkg.id}
        className={`relative border-2 transition-all cursor-pointer hover:shadow-lg ${
          isSelected ? "border-primary shadow-lg ring-2 ring-primary/20" : "border-border hover:border-primary/30"
        }`}
        onClick={() => onSelectPackage(pkg.id)}
      >
        <CardContent className="p-4 text-center space-y-3">
          <h3 className="text-sm font-bold text-primary">{pkg.name} (AI)</h3>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">AI Call Handling Service</p>
            {pkg.aiSetupFee > 0 && <p>Setup Fee: {formatGBP(pkg.aiSetupFee)}</p>}
            {pkg.aiSetupFee === 0 && <p className="text-emerald-600 font-medium">No Setup Fee</p>}
            <p>Monthly Fee: {formatGBP(pkg.aiMonthlyFee)}</p>
            <p>Calls Allocated: {pkg.aiCallsAllocated}</p>
            {pkg.features.length > 0 && (
              <div className="pt-1 space-y-0.5">
                {pkg.features.map((feature, idx) => (
                  <p key={idx} className="flex items-start gap-1 text-xs">
                    <Check className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{feature}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="pt-2 border-t">
            <p className="text-xl font-bold text-foreground">{formatGBP(pkg.aiMonthlyFee)}</p>
            <p className="text-[10px] text-muted-foreground">per month</p>
          </div>
          <Button
            size="sm"
            className="w-full"
            variant={isSelected ? "default" : "outline"}
            onClick={(e) => { e.stopPropagation(); onSelectPackage(pkg.id); }}
          >
            {isSelected ? <><Check className="h-3 w-3 mr-1" /> Selected</> : "Select"}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <img
          src="/va-team-logo.png"
          alt="The VA Team"
          className="h-14 mx-auto mb-2"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <h2 className="text-xl font-bold text-foreground">Our AI Call Handling Services</h2>
        <p className="text-sm text-muted-foreground">Our Packages</p>
      </div>

      {aiPackages.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="font-medium">No AI Call Handling packages available</p>
          <p className="text-sm mt-1">Add packages with the "AI" service on the Packages & Pricing page first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {aiPackages.map(renderPackageCard)}
        </div>
      )}
    </div>
  );
}
