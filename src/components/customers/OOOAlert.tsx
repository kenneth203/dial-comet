import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle, Edit, Trash2 } from "lucide-react";
import { CustomerContact } from "@/context/CustomersContext";
import { cn } from "@/lib/utils";

interface OOOAlertProps {
  contacts: CustomerContact[];
  onDismiss?: () => void;
}

interface ActiveOOOContact {
  contact: CustomerContact;
  isActive: boolean;
}

export function OOOAlert({ contacts, onDismiss }: OOOAlertProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFlashing, setIsFlashing] = useState(true);

  // Filter contacts that have active OOO (until date hasn't passed)
  const activeOOOContacts: ActiveOOOContact[] = contacts
    .filter(contact => {
      // Check if contact has OOO reason and dates
      if (!contact.oooReason || !contact.oooFromDate || !contact.oooUntilDate) {
        return false;
      }
      
      // Check if until date is in the future (still active)
      const untilDate = new Date(contact.oooUntilDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time for date-only comparison
      
      return untilDate >= today;
    })
    .map(contact => ({
      contact,
      isActive: true
    }));

  // Stop flashing after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFlashing(false);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, []);

  // Don't render if no active OOO contacts
  if (activeOOOContacts.length === 0 || !isVisible) {
    return null;
  }

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <div className={cn(
      "fixed bottom-4 right-4 max-w-md",
      isFlashing && "animate-pulse"
    )}
    style={{ zIndex: 9999 }}>
      <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20 shadow-lg border-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2 flex-1">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <AlertTitle className="text-amber-800 dark:text-amber-200 font-semibold mb-2">
                Out of Office Alert
              </AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300 space-y-2">
                <p className="font-medium">The following contacts are currently out of office:</p>
                {activeOOOContacts.map(({ contact }, index) => (
                  <div key={index} className="bg-amber-100 dark:bg-amber-900/30 rounded-md p-3 border border-amber-200 dark:border-amber-800">
                    <div className="font-semibold text-amber-800 dark:text-amber-200">
                      {contact.firstName} {contact.surname}
                    </div>
                    {contact.position && (
                      <div className="text-sm text-amber-600 dark:text-amber-400">
                        {contact.position}
                      </div>
                    )}
                    <div className="text-sm font-medium text-amber-700 dark:text-amber-300 mt-1">
                      Reason: {contact.oooReason}
                    </div>
                    <div className="text-sm text-amber-600 dark:text-amber-400">
                      {format(new Date(contact.oooFromDate!), "dd/MM/yyyy")} - {format(new Date(contact.oooUntilDate!), "dd/MM/yyyy")}
                    </div>
                  </div>
                ))}
              </AlertDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-200 dark:hover:bg-amber-900/30 ml-2 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
}