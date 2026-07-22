import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { type Package } from "@/context/PackagesContext";
import { formatGBP } from "@/lib/currency";

interface ProposalPackagesTabProps {
  vaPackages: Package[];
  selectedPackageId: string | null;
  onSelectPackage: (id: string) => void;
  onContinue: () => void;
}

export function ProposalPackagesTab({ vaPackages, selectedPackageId, onSelectPackage, onContinue }: ProposalPackagesTabProps) {
  const renderPackageCard = (pkg: Package) => {
    const isSelected = selectedPackageId === pkg.id;
    const hourlyRate = pkg.packagedHours > 0 ? (pkg.price / pkg.packagedHours).toFixed(2) : "0.00";

    return (
      <Card
        key={pkg.id}
        className={`relative border-2 transition-all cursor-pointer hover:shadow-lg ${
          isSelected ? "border-primary shadow-lg ring-2 ring-primary/20" : "border-border hover:border-primary/30"
        }`}
        onClick={() => onSelectPackage(pkg.id)}
      >
        <CardContent className="p-4 text-center space-y-3">
          <h3 className="text-sm font-bold text-primary">{pkg.name} (VA)</h3>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Includes: Monthly Membership Fee</p>
            <p>Includes: {pkg.packagedHours} Hours</p>
            <p>Additional hours charged at {formatGBP(pkg.hourlyOverageRate)}/hr</p>
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
            <p className="text-[10px]">({formatGBP(hourlyRate)}/hr based on {pkg.packagedHours}h)</p>
          </div>
          <div className="pt-2 border-t">
            <p className="text-xl font-bold text-foreground">{formatGBP(pkg.price)}</p>
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
        <h2 className="text-xl font-bold text-foreground">Our Virtual Assistant Services</h2>
        <p className="text-sm text-muted-foreground">Our Packages</p>
      </div>

      {vaPackages.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="font-medium">No VA packages available</p>
          <p className="text-sm mt-1">Add packages with the "VA" service on the Packages & Pricing page first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vaPackages.map(renderPackageCard)}
        </div>
      )}

      {selectedPackageId && (
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onContinue}>
            Continue to Agreement →
          </Button>
        </div>
      )}
    </div>
  );
}
