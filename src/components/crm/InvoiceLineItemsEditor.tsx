import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { formatGBP } from "@/lib/currency";

export type ExtraLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
};

export const extraLineTotal = (items: ExtraLineItem[]) =>
  items.reduce((sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0), 0);

interface Props {
  items: ExtraLineItem[];
  onChange: (items: ExtraLineItem[]) => void;
  title?: string;
  description?: string;
}

export function InvoiceLineItemsEditor({ items, onChange, title = "Additional Lines", description }: Props) {
  const update = (idx: number, patch: Partial<ExtraLineItem>) =>
    onChange(items.map((li, i) => (i === idx ? { ...li, ...patch } : li)));

  const add = () => onChange([...items, { description: "", quantity: 1, unit_price: 0 }]);
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/30">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold">{title}</Label>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" /> Add line
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No extra lines. Use "Add line" for extras such as extra hours, postage or expenses.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
            <div className="col-span-6">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Unit price (£)</div>
            <div className="col-span-2 text-right">Amount</div>
          </div>
          {items.map((li, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-12 sm:col-span-6">
                <Input
                  placeholder="e.g. Extra hours, Postage"
                  value={li.description}
                  onChange={(e) => update(idx, { description: e.target.value })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  className="text-right"
                  value={li.quantity}
                  onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Input
                  type="number"
                  step="0.01"
                  className="text-right"
                  value={li.unit_price}
                  onChange={(e) => update(idx, { unit_price: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2 flex items-center justify-end gap-1">
                <span className="text-sm font-medium tabular-nums">
                  {formatGBP((Number(li.quantity) || 0) * (Number(li.unit_price) || 0))}
                </span>
                <Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)} title="Remove line">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex justify-between text-sm font-semibold pt-1 border-t">
            <span>Extras subtotal</span>
            <span>{formatGBP(extraLineTotal(items))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
