import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  DEFAULT_PRESENCE_PREFS,
  loadPresenceAlertPrefs,
  savePresenceAlertPrefs,
  type PresenceAlertChannel,
  type PresenceAlertPrefs,
} from "@/lib/presenceAlertPrefs";

interface Props {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const THROTTLE_OPTIONS = [
  { value: "0", label: "Instant (every change)" },
  { value: "5", label: "At most every 5 minutes" },
  { value: "15", label: "At most every 15 minutes" },
  { value: "30", label: "At most every 30 minutes" },
  { value: "60", label: "At most once per hour" },
];

export function PresenceAlertSettingsDialog({ userId, open, onOpenChange }: Props) {
  const [prefs, setPrefs] = useState<PresenceAlertPrefs>(DEFAULT_PRESENCE_PREFS);

  useEffect(() => {
    if (open && userId) setPrefs(loadPresenceAlertPrefs(userId));
  }, [open, userId]);

  const handleSave = () => {
    savePresenceAlertPrefs(userId, prefs);
    toast.success("Notification preferences saved");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Presence notification settings</DialogTitle>
          <DialogDescription>
            Choose how you want to be alerted when operators go Online or Offline.
            These preferences apply only to your account on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Delivery method</Label>
            <RadioGroup
              value={prefs.channel}
              onValueChange={(value) =>
                setPrefs((p) => ({ ...p, channel: value as PresenceAlertChannel }))
              }
              className="space-y-2"
            >
              {[
                { v: "both", l: "Toast + email" },
                { v: "toast", l: "Toast only" },
                { v: "email", l: "Email only" },
                { v: "none", l: "Off" },
              ].map((o) => (
                <div key={o.v} className="flex items-center space-x-2">
                  <RadioGroupItem value={o.v} id={`channel-${o.v}`} />
                  <Label htmlFor={`channel-${o.v}`} className="font-normal cursor-pointer">
                    {o.l}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Frequency</Label>
            <Select
              value={String(prefs.throttleMinutes)}
              onValueChange={(v) =>
                setPrefs((p) => ({ ...p, throttleMinutes: Number(v) }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THROTTLE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Limits repeat alerts for the same operator and transition.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Offline events only</Label>
              <p className="text-xs text-muted-foreground">
                Skip "back Online" alerts.
              </p>
            </div>
            <Switch
              checked={prefs.offlineOnly}
              onCheckedChange={(checked) =>
                setPrefs((p) => ({ ...p, offlineOnly: checked }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save preferences</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
