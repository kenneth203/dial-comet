import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Check, Loader2, Shield, Star, FolderOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface FormElement {
  id: string;
  type: string;
  content?: string;
  level?: number;
  imageUrl?: string;
  imageAlt?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  options?: string[];
  width?: string;
  groupTitle?: string;
  groupCollapsible?: boolean;
  children?: FormElement[];
  columnCount?: number;
  columnChildren?: FormElement[][];
  tableColumns?: string[];
  tableRows?: number;
  tableHeaderColor?: string;
}

interface FormData {
  submission: { id: string; status: string; responses: Record<string, any>; completed_at?: string };
  template: { name: string; description: string; elements: FormElement[]; brandColor: string };
  customer: { name: string; contact: string } | null;
  prefill?: Record<string, string> | null;
}

// Match a form element label to a known customer prefill field.
// Returns the prefill key (or null when no confident match).
function matchPrefillKey(label: string): string | null {
  const l = label.toLowerCase().replace(/[*_\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!l) return null;

  // Postcode
  if (/\b(post\s?code|zip)\b/.test(l)) return "postcode";
  // City / town
  if (/\b(city|town|county)\b/.test(l)) return "city";
  // Address line 2
  if (/address\s*(line)?\s*2|line\s*2/.test(l)) return "addressLine2";
  // Address line 1 / street / business address
  if (/address\s*(line)?\s*1|line\s*1|street|business\s+address|postal\s+address|address$/.test(l))
    return "addressLine1";
  // Website
  if (/\b(website|web\s*site|url)\b/.test(l)) return "website";
  // Email
  if (/e[-\s]?mail/.test(l)) return "email";
  // Mobile / direct
  if (/\b(mobile|cell|direct|personal)\b/.test(l) && /(phone|number|tel|dial|mobile|cell)/.test(l))
    return "mobile";
  if (l === "mobile" || l.startsWith("mobile ")) return "mobile";
  // Telephone / business phone
  if (/(telephone|phone|tel\b|contact\s*number|business\s+number)/.test(l)) return "telephone";
  // Surname / last name
  if (/(surname|last\s*name|family\s*name)/.test(l)) return "contactLastName";
  // First name
  if (/(first\s*name|forename|given\s*name)/.test(l)) return "contactFirstName";
  // Full contact name
  if (/(main\s+contact|contact\s+name|primary\s+contact|your\s+name|full\s+name)/.test(l) && !/company|business|trading/.test(l))
    return "contactFirstName";
  // Company / trading / business name
  if (/(company|business|organisation|organization|trading)\s+(name|trading)?/.test(l) || /trading\s+name/.test(l))
    return "companyName";

  return null;
}

function buildPrefilledResponses(
  elements: FormElement[],
  prefill: Record<string, string>,
  into: Record<string, any>
) {
  for (const el of elements) {
    if (el.label && ["text_input", "email", "phone", "textarea", "text", "url"].includes(el.type)) {
      const key = matchPrefillKey(el.label);
      if (key && prefill[key] && into[el.id] === undefined) {
        into[el.id] = prefill[key];
      }
    }
    if (el.children) buildPrefilledResponses(el.children, prefill, into);
    if (el.columnChildren) {
      for (const col of el.columnChildren) buildPrefilledResponses(col, prefill, into);
    }
  }
}

export default function PublicForm() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [formData, setFormData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!submissionId) return;
    fetchForm();
  }, [submissionId]);

  const fetchForm = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-form?id=${submissionId}`, {
        headers: { "apikey": SUPABASE_ANON_KEY },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load form");
      }
      const data: FormData = await res.json();
      setFormData(data);
      if (data.submission.status === "completed") {
        setResponses(data.submission.responses || {});
        setSubmitted(true);
      } else {
        // Seed responses with any saved answers, then autofill remaining
        // matching fields (name, contact, email, phone, website, address)
        // from the customer's saved Details so they don't retype them.
        const seeded: Record<string, any> = { ...(data.submission.responses || {}) };
        if (data.prefill) {
          buildPrefilledResponses(data.template.elements, data.prefill, seeded);
        }
        setResponses(seeded);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (elementId: string, value: any) => {
    setResponses(prev => ({ ...prev, [elementId]: value }));
  };

  const handleSubmit = async () => {
    if (!formData) return;

    const requiredFields = collectRequiredFields(formData.template.elements);
    const missing = requiredFields.filter(f => {
      const v = responses[f.id];
      if (v === undefined || v === null) return true;
      if (typeof v === "string" && !v.trim()) return true;
      return false;
    });
    if (missing.length > 0) {
      toast({ title: "Required Fields", description: `Please fill in: ${missing.map(f => f.label).join(", ")}`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ submissionId, responses }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit");
      }
      setSubmitted(true);
      toast({ title: "Form Submitted!", description: "Thank you for completing the form." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const collectRequiredFields = (elements: FormElement[]): { id: string; label: string }[] => {
    const result: { id: string; label: string }[] = [];
    for (const el of elements) {
      if (el.required && el.label) result.push({ id: el.id, label: el.label });
      if (el.children) result.push(...collectRequiredFields(el.children));
      if (el.columnChildren) {
        for (const col of el.columnChildren) {
          result.push(...collectRequiredFields(col));
        }
      }
    }
    return result;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
          <p className="text-slate-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <Shield className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Unable to Load Form</h2>
            <p className="text-slate-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!formData) return null;

  const brandColor = formData.template.brandColor || "#1c477a";

  if (submitted) {
    return (
      <div className="min-h-screen bg-white">
        <Toaster />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto bg-green-100">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: brandColor }}>Thank You!</h1>
          <p className="text-lg text-slate-600">
            Your form has been submitted successfully. We'll be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster />

      {/* Form container matching the preview style */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="w-full rounded-xl overflow-hidden shadow-xl border bg-white">

          {/* Form content */}
          <div className="p-6 space-y-5">
            {renderElements(formData.template.elements, responses, handleResponseChange, brandColor)}

            {formData.template.elements.length > 0 && (
              <Button
                className="w-full text-white font-semibold py-3"
                style={{ backgroundColor: brandColor }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : "Submit"}
              </Button>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 text-center text-xs text-slate-400 border-t" style={{ borderColor: `${brandColor}20` }}>
            Powered by The VA Team
          </div>
        </div>
      </div>
    </div>
  );
}

function renderElements(
  elements: FormElement[],
  responses: Record<string, any>,
  onChange: (id: string, value: any) => void,
  brandColor: string
) {
  return elements.map((el) => renderElement(el, responses, onChange, brandColor));
}

function renderElement(
  el: FormElement,
  responses: Record<string, any>,
  onChange: (id: string, value: any) => void,
  brandColor: string
) {
  switch (el.type) {
    case "heading":
      const HeadingTag = el.level === 1 ? "h1" : el.level === 2 ? "h2" : "h3";
      const headingSize = el.level === 1 ? "text-2xl" : el.level === 2 ? "text-xl" : "text-lg";
      return <HeadingTag key={el.id} className={`${headingSize} font-bold`} style={{ color: brandColor }}>{el.content}</HeadingTag>;

    case "paragraph":
      return <p key={el.id} className="text-sm text-slate-500 leading-relaxed">{el.content}</p>;

    case "separator":
      return <Separator key={el.id} />;

    case "image":
      return el.imageUrl ? (
        <img key={el.id} src={el.imageUrl} alt={el.imageAlt || ""} className="mx-auto max-h-20 w-auto object-contain" />
      ) : null;

    case "image_upload":
      return el.imageUrl ? (
        <img key={el.id} src={el.imageUrl} alt={el.imageAlt || ""} className="mx-auto max-h-20 w-auto object-contain" />
      ) : null;

    case "text_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Input
            placeholder={el.placeholder}
            value={responses[el.id] || ""}
            onChange={(e) => onChange(el.id, e.target.value)}
          />
          {el.helpText && <p className="text-xs text-slate-400">{el.helpText}</p>}
        </div>
      );

    case "email_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Input
            type="email"
            placeholder={el.placeholder || "email@example.com"}
            value={responses[el.id] || ""}
            onChange={(e) => onChange(el.id, e.target.value)}
          />
          {el.helpText && <p className="text-xs text-slate-400">{el.helpText}</p>}
        </div>
      );

    case "phone_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Input
            type="tel"
            placeholder={el.placeholder || "+44..."}
            value={responses[el.id] || ""}
            onChange={(e) => onChange(el.id, e.target.value)}
          />
          {el.helpText && <p className="text-xs text-slate-400">{el.helpText}</p>}
        </div>
      );

    case "textarea_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Textarea
            placeholder={el.placeholder}
            value={responses[el.id] || ""}
            onChange={(e) => onChange(el.id, e.target.value)}
            rows={4}
          />
          {el.helpText && <p className="text-xs text-slate-400">{el.helpText}</p>}
        </div>
      );

    case "select_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Select value={responses[el.id] || ""} onValueChange={(v) => onChange(el.id, v)}>
            <SelectTrigger><SelectValue placeholder={el.placeholder || "Select..."} /></SelectTrigger>
            <SelectContent>
              {(el.options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {el.helpText && <p className="text-xs text-slate-400">{el.helpText}</p>}
        </div>
      );

    case "checkbox_input":
      return (
        <div key={el.id} className="flex items-center gap-3">
          <Checkbox
            checked={!!responses[el.id]}
            onCheckedChange={(checked) => onChange(el.id, checked)}
          />
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
        </div>
      );

    case "date_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Input
            type="date"
            value={responses[el.id] || ""}
            onChange={(e) => onChange(el.id, e.target.value)}
          />
          {el.helpText && <p className="text-xs text-slate-400">{el.helpText}</p>}
        </div>
      );

    case "toggle_input":
      return (
        <div key={el.id} className="flex items-center justify-between">
          <Label>{el.label}</Label>
          <Switch
            checked={!!responses[el.id]}
            onCheckedChange={(checked) => onChange(el.id, checked)}
          />
        </div>
      );

    case "rating_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onChange(el.id, star)}
                className="p-1"
              >
                <Star className={`h-6 w-6 ${(responses[el.id] || 0) >= star ? "fill-yellow-400 text-yellow-400" : "text-slate-300"}`} />
              </button>
            ))}
          </div>
        </div>
      );

    case "group":
      return (
        <div key={el.id} className="rounded-lg border-2 overflow-hidden" style={{ borderColor: `${brandColor}40` }}>
          {/* Group header matching the editor preview */}
          <div
            className="flex items-center gap-2 p-3"
            style={{ backgroundColor: `${brandColor}10` }}
          >
            <div className="p-1 rounded" style={{ backgroundColor: brandColor }}>
              <FolderOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm" style={{ color: brandColor }}>{el.groupTitle || "Untitled Group"}</span>
          </div>
          {/* Group body */}
          <div className="p-4 space-y-4">
            {el.children && renderElements(el.children, responses, onChange, brandColor)}
          </div>
        </div>
      );

    case "columns":
      const colCount = el.columnCount || 2;
      return (
        <div key={el.id} className={`grid gap-4 grid-cols-1 md:grid-cols-${colCount}`}>
          {(el.columnChildren || []).map((colElements, i) => (
            <div key={i} className="space-y-4">
              {renderElements(colElements, responses, onChange, brandColor)}
            </div>
          ))}
        </div>
      );

    case "table":
      const cols = el.tableColumns || ["Column 1", "Column 2"];
      const rows = el.tableRows || 3;
      return (
        <div key={el.id} className="space-y-2">
          {el.label && <Label>{el.label}</Label>}
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: el.tableHeaderColor || brandColor }}>
                  {cols.map((col, i) => (
                    <th key={i} className="px-3 py-2 text-left text-white font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }).map((_, rowIdx) => (
                  <tr key={rowIdx} className="border-t">
                    {cols.map((col, colIdx) => (
                      <td key={colIdx} className="px-3 py-1">
                        <Input
                          className="border-0 bg-transparent h-8 text-sm"
                          value={responses[`${el.id}_${rowIdx}_${colIdx}`] || ""}
                          onChange={(e) => onChange(`${el.id}_${rowIdx}_${colIdx}`, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );

    case "file_input":
      return (
        <div key={el.id} className="space-y-2">
          <Label>{el.label}{el.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <div className="border-2 border-dashed rounded-lg p-4 text-center text-sm text-slate-400">
            Click or drag to upload
          </div>
          {el.helpText && <p className="text-xs text-slate-400">{el.helpText}</p>}
        </div>
      );

    default:
      return null;
  }
}