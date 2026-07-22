import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Type,
  Mail,
  Phone,
  Calendar,
  CheckSquare,
  List,
  Upload,
  Star,
  Image,
  AlignLeft,
  Heading1,
  Minus,
  Trash2,
  GripVertical,
  Settings,
  Eye,
  Save,
  Plus,
  MoveUp,
  MoveDown,
  ToggleLeft,
  Columns,
  LayoutGrid,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Table,
  ImagePlus,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Element types for the form builder
type ElementType =
  | "heading"
  | "paragraph"
  | "separator"
  | "image"
  | "image_upload"
  | "text_input"
  | "email_input"
  | "phone_input"
  | "textarea_input"
  | "select_input"
  | "checkbox_input"
  | "date_input"
  | "file_input"
  | "rating_input"
  | "toggle_input"
  | "group"
  | "columns"
  | "table";

interface FormElement {
  id: string;
  type: ElementType;
  // Content elements
  content?: string;
  level?: 1 | 2 | 3;
  imageUrl?: string;
  imageAlt?: string;
  // Field elements
  label?: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  options?: string[];
  // Layout
  width?: "full" | "half";
  // Group / Container
  groupTitle?: string;
  groupCollapsible?: boolean;
  children?: FormElement[];
  // Columns
  columnCount?: 2 | 3 | 4;
  columnChildren?: FormElement[][]; // one array per column
  // Table
  tableColumns?: string[];
  tableRows?: number;
  tableHeaderColor?: string;
}

interface FormTemplate {
  id: string;
  name: string;
  description: string;
  type: string;
  elements: FormElement[];
  isActive: boolean;
  brandColor: string;
  logoUrl?: string;
}

interface FormEditorCanvasProps {
  onBack: () => void;
  onSave: (template: FormTemplate) => void;
  editingTemplate?: FormTemplate | null;
}

const ELEMENT_PALETTE: { category: string; items: { type: ElementType; label: string; icon: React.ElementType }[] }[] = [
  {
    category: "Layout",
    items: [
      { type: "group", label: "Group / Section", icon: FolderOpen },
      { type: "columns", label: "Columns", icon: Columns },
    ],
  },
  {
    category: "Content",
    items: [
      { type: "heading", label: "Heading", icon: Heading1 },
      { type: "paragraph", label: "Text Block", icon: AlignLeft },
      { type: "image", label: "Image (URL)", icon: Image },
      { type: "image_upload", label: "Image Upload", icon: ImagePlus },
      { type: "table", label: "Table", icon: Table },
      { type: "separator", label: "Divider", icon: Minus },
    ],
  },
  {
    category: "Form Fields",
    items: [
      { type: "text_input", label: "Text Field", icon: Type },
      { type: "email_input", label: "Email", icon: Mail },
      { type: "phone_input", label: "Phone", icon: Phone },
      { type: "textarea_input", label: "Long Text", icon: AlignLeft },
      { type: "select_input", label: "Dropdown", icon: List },
      { type: "checkbox_input", label: "Checkbox", icon: CheckSquare },
      { type: "date_input", label: "Date", icon: Calendar },
      { type: "file_input", label: "File Upload", icon: Upload },
      { type: "rating_input", label: "Rating", icon: Star },
      { type: "toggle_input", label: "Toggle", icon: ToggleLeft },
    ],
  },
];

// ── Helpers to work with nested trees ──
function findElementById(elements: FormElement[], id: string): FormElement | null {
  for (const el of elements) {
    if (el.id === id) return el;
    if (el.children) {
      const found = findElementById(el.children, id);
      if (found) return found;
    }
    if (el.columnChildren) {
      for (const col of el.columnChildren) {
        const found = findElementById(col, id);
        if (found) return found;
      }
    }
  }
  return null;
}

function updateElementInTree(elements: FormElement[], id: string, updates: Partial<FormElement>): FormElement[] {
  return elements.map((el) => {
    if (el.id === id) return { ...el, ...updates };
    const newEl = { ...el };
    if (newEl.children) newEl.children = updateElementInTree(newEl.children, id, updates);
    if (newEl.columnChildren) newEl.columnChildren = newEl.columnChildren.map((col) => updateElementInTree(col, id, updates));
    return newEl;
  });
}

function removeElementFromTree(elements: FormElement[], id: string): FormElement[] {
  return elements.filter((el) => el.id !== id).map((el) => {
    const newEl = { ...el };
    if (newEl.children) newEl.children = removeElementFromTree(newEl.children, id);
    if (newEl.columnChildren) newEl.columnChildren = newEl.columnChildren.map((col) => removeElementFromTree(col, id));
    return newEl;
  });
}

function moveElementInList(list: FormElement[], id: string, direction: "up" | "down"): FormElement[] {
  const idx = list.findIndex((el) => el.id === id);
  if (idx === -1) return list;
  if (direction === "up" && idx > 0) {
    const next = [...list];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    return next;
  }
  if (direction === "down" && idx < list.length - 1) {
    const next = [...list];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    return next;
  }
  return list;
}

function moveElementInTree(elements: FormElement[], id: string, direction: "up" | "down"): FormElement[] {
  // Try at this level
  if (elements.some((el) => el.id === id)) return moveElementInList(elements, id, direction);
  return elements.map((el) => {
    const newEl = { ...el };
    if (newEl.children) newEl.children = moveElementInTree(newEl.children, id, direction);
    if (newEl.columnChildren) newEl.columnChildren = newEl.columnChildren.map((col) => moveElementInTree(col, id, direction));
    return newEl;
  });
}

function addElementToContainer(elements: FormElement[], containerId: string, newEl: FormElement, columnIndex?: number): FormElement[] {
  return elements.map((el) => {
    if (el.id === containerId) {
      if (el.type === "columns" && typeof columnIndex === "number" && el.columnChildren) {
        const newCols = el.columnChildren.map((col, i) => i === columnIndex ? [...col, newEl] : col);
        return { ...el, columnChildren: newCols };
      }
      if (el.type === "group") {
        return { ...el, children: [...(el.children || []), newEl] };
      }
    }
    const newNode = { ...el };
    if (newNode.children) newNode.children = addElementToContainer(newNode.children, containerId, newEl, columnIndex);
    if (newNode.columnChildren) newNode.columnChildren = newNode.columnChildren.map((col) => addElementToContainer(col, containerId, newEl, columnIndex));
    return newNode;
  });
}

// ── Image Upload Field with drag-and-drop + click-to-browse ──
function ImageUploadField({ el, onUpload }: { el: FormElement; onUpload: (url: string) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload PNG, JPG, GIF or WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max file size is 10MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    const filePath = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data, error } = await supabase.storage.from('form-images').upload(filePath, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('form-images').getPublicUrl(data.path);
    onUpload(urlData.publicUrl);
    toast({ title: "Image uploaded", description: "Image added to form." });
    setUploading(false);
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); if (fileInputRef.current) fileInputRef.current.value = ''; }}
      />
      {el.imageUrl ? (
        <div className="relative border rounded-lg p-2 bg-muted/10">
          <img src={el.imageUrl} alt={el.imageAlt || "Uploaded"} className="w-full max-h-[300px] mx-auto rounded object-cover" />
          <div className="flex gap-2 mt-2 justify-center">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              Replace
            </Button>
            <Button variant="outline" size="sm" onClick={() => onUpload('')} className="text-destructive">
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-navy bg-brand-navy/5' : 'border-muted-foreground/20 bg-muted/10 hover:border-brand-navy/50'}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-8 w-8 border-2 border-brand-navy border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImagePlus className="h-8 w-8 opacity-50" />
              <p className="text-sm font-medium">Click to upload or drag & drop</p>
              <p className="text-xs">PNG, JPG, GIF, WebP up to 10MB</p>
            </div>
          )}
        </div>
      )}
      {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
    </div>
  );
}

export function FormEditorCanvas({ onBack, onSave, editingTemplate }: FormEditorCanvasProps) {
  const [formName, setFormName] = useState(editingTemplate?.name || "");
  const [formDescription, setFormDescription] = useState(editingTemplate?.description || "");
  const [formType, setFormType] = useState(editingTemplate?.type || "lead_capture");
  const [brandColor, setBrandColor] = useState(editingTemplate?.brandColor || "#1c477a");
  const [elements, setElements] = useState<FormElement[]>(editingTemplate?.elements || []);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverColTarget, setDragOverColTarget] = useState<{ columnsId: string; colIdx: number } | null>(null);

  const selectedElement = selectedElementId ? findElementById(elements, selectedElementId) : null;

  const createNewElement = (type: ElementType): FormElement => {
    const newElement: FormElement = { id: crypto.randomUUID(), type, width: "full" };
    switch (type) {
      case "heading":
        newElement.content = "Section Heading";
        newElement.level = 2;
        break;
      case "paragraph":
        newElement.content = "Enter your text here.";
        break;
      case "image":
        newElement.imageUrl = "";
        newElement.imageAlt = "Form image";
        break;
      case "text_input":
        newElement.label = "Text Field";
        newElement.placeholder = "Enter text...";
        break;
      case "email_input":
        newElement.label = "Email Address";
        newElement.placeholder = "name@example.com";
        newElement.required = true;
        break;
      case "phone_input":
        newElement.label = "Phone Number";
        newElement.placeholder = "+44 000 000 0000";
        break;
      case "textarea_input":
        newElement.label = "Details";
        newElement.placeholder = "Tell us more...";
        break;
      case "select_input":
        newElement.label = "Select Option";
        newElement.options = ["Option 1", "Option 2", "Option 3"];
        break;
      case "checkbox_input":
        newElement.label = "I agree to the terms and conditions";
        break;
      case "date_input":
        newElement.label = "Select Date";
        break;
      case "file_input":
        newElement.label = "Upload File";
        break;
      case "rating_input":
        newElement.label = "Rate your experience";
        break;
      case "toggle_input":
        newElement.label = "Enable notifications";
        break;
      case "group":
        newElement.groupTitle = "Section Title";
        newElement.groupCollapsible = false;
        newElement.children = [];
        break;
      case "columns":
        newElement.columnCount = 2;
        newElement.columnChildren = [[], []];
        break;
      case "table":
        newElement.label = "Staff Details";
        newElement.tableColumns = ["Name & role", "Mobile / direct", "Email address", "Email direct? Y/N"];
        newElement.tableRows = 5;
        newElement.tableHeaderColor = brandColor;
        break;
      case "image_upload":
        newElement.label = "Upload Image";
        newElement.helpText = "Drag and drop or click to upload an image";
        break;
    }
    return newElement;
  };

  const addElement = (type: ElementType) => {
    const newEl = createNewElement(type);
    // If a group or column is selected, add inside it
    if (selectedElement) {
      if (selectedElement.type === "group" && type !== "group") {
        setElements(addElementToContainer(elements, selectedElement.id, newEl));
        setSelectedElementId(newEl.id);
        return;
      }
    }
    setElements([...elements, newEl]);
    setSelectedElementId(newEl.id);
  };

  const addToColumn = (columnsId: string, columnIndex: number, type: ElementType) => {
    const newEl = createNewElement(type);
    setElements(addElementToContainer(elements, columnsId, newEl, columnIndex));
    setSelectedElementId(newEl.id);
  };

  const updateElement = (id: string, updates: Partial<FormElement>) => {
    setElements(updateElementInTree(elements, id, updates));
  };

  const removeElement = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      setElements(removeElementFromTree(elements, deleteConfirmId));
      if (selectedElementId === deleteConfirmId) setSelectedElementId(null);
      setDeleteConfirmId(null);
      toast({ title: "Element deleted", description: "The element has been removed from the form." });
    }
  };

  const moveElement = (id: string, direction: "up" | "down") => {
    setElements(moveElementInTree(elements, id, direction));
  };

  // ── Drag and drop handlers ──
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== draggedId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(null);
    if (!draggedId || draggedId === targetId) return;

    setElements((prev) => {
      const dragIdx = prev.findIndex((el) => el.id === draggedId);
      const targetIdx = prev.findIndex((el) => el.id === targetId);
      if (dragIdx === -1 || targetIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDraggedId(null);
  };

  // ── Column-specific drop handlers ──
  const handleColumnDragOver = (e: React.DragEvent, columnsId: string, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverColTarget({ columnsId, colIdx });
  };

  const handleColumnDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setDragOverColTarget(null);
  };

  const handleColumnDrop = (e: React.DragEvent, columnsId: string, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColTarget(null);
    setDragOverId(null);
    if (!draggedId) return;

    const draggedEl = findElementById(elements, draggedId);
    if (!draggedEl || draggedEl.type === "group" || draggedEl.type === "columns") return;

    setElements((prev) => {
      const cleaned = removeElementFromTree(prev, draggedId);
      return addElementToContainer(cleaned, columnsId, { ...draggedEl }, colIdx);
    });
    setDraggedId(null);
  };

  const toggleGroupCollapse = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast({ title: "Form name required", description: "Please enter a name for your form.", variant: "destructive" });
      return;
    }
    onSave({
      id: editingTemplate?.id || crypto.randomUUID(),
      name: formName,
      description: formDescription,
      type: formType,
      elements,
      isActive: editingTemplate?.isActive ?? true,
      brandColor,
    });
  };

  // ── Element toolbar (reusable) ──
  const renderToolbar = (el: FormElement) => (
    <div className="absolute -top-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
      <div
        className="h-6 w-6 flex items-center justify-center rounded border bg-background cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => e.stopPropagation()}
        title="Drag to reorder"
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>
      <Button variant="outline" size="icon" className="h-6 w-6 bg-background" onClick={(e) => { e.stopPropagation(); moveElement(el.id, "up"); }}>
        <MoveUp className="h-3 w-3" />
      </Button>
      <Button variant="outline" size="icon" className="h-6 w-6 bg-background" onClick={(e) => { e.stopPropagation(); moveElement(el.id, "down"); }}>
        <MoveDown className="h-3 w-3" />
      </Button>
      <Button variant="outline" size="icon" className="h-6 w-6 bg-background text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );

  // ── Render a single field element (no wrapper) ──
  const renderFieldContent = (el: FormElement) => {
    switch (el.type) {
      case "heading":
        return <h2 className={`font-bold ${el.level === 1 ? "text-2xl" : el.level === 3 ? "text-lg" : "text-xl"}`} style={{ color: brandColor }}>{el.content}</h2>;
      case "paragraph":
        return <p className="text-sm text-muted-foreground leading-relaxed">{el.content}</p>;
      case "separator":
        return <Separator className="my-2" />;
      case "image":
        return el.imageUrl ? (
          <img src={el.imageUrl} alt={el.imageAlt} className="max-h-40 mx-auto rounded" />
        ) : (
          <div className="bg-muted/30 border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 text-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Image className="h-8 w-8" />
              <span className="text-sm">Paste image URL in properties</span>
            </div>
          </div>
        );
      case "text_input":
      case "email_input":
      case "phone_input":
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
            <Input placeholder={el.placeholder} disabled className="bg-background" />
            {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
          </div>
        );
      case "textarea_input":
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
            <Textarea placeholder={el.placeholder} disabled className="bg-background" rows={3} />
            {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
          </div>
        );
      case "select_input":
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
            <Select disabled><SelectTrigger className="bg-background"><SelectValue placeholder="Select..." /></SelectTrigger></Select>
            {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
          </div>
        );
      case "checkbox_input":
        return (
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
          </div>
        );
      case "date_input":
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
            <Input type="date" disabled className="bg-background" />
          </div>
        );
      case "file_input":
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground bg-background">
              <Upload className="h-5 w-5 mx-auto mb-1" /> Click or drag to upload
            </div>
          </div>
        );
      case "rating_input":
        return (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{el.label}</Label>
            <div className="flex gap-1">{[1, 2, 3, 4, 5].map((s) => <Star key={s} className="h-6 w-6 text-muted-foreground/30" />)}</div>
          </div>
        );
      case "toggle_input":
        return (
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{el.label}</Label>
            <Switch disabled />
          </div>
        );
      case "table": {
        const cols = el.tableColumns || ["Column 1", "Column 2"];
        const rows = el.tableRows || 3;
        return (
          <div className="space-y-1.5">
            {el.label && <Label className="text-sm font-medium">{el.label}</Label>}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: el.tableHeaderColor || brandColor }}>
                    {cols.map((col, i) => (
                      <th key={i} className="px-3 py-2 text-left text-white font-semibold text-xs">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rows }).map((_, rowIdx) => (
                    <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-muted/20" : "bg-background"}>
                      {cols.map((_, colIdx) => (
                        <td key={colIdx} className="px-3 py-2 border-t">
                          <div className="h-5" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
      case "image_upload":
        return <ImageUploadField el={el} onUpload={(url) => updateElement(el.id, { imageUrl: url })} />;
      default:
        return null;
    }
  };

  // ── Render a canvas element (with selection wrapper) ──
  const renderCanvasElement = (el: FormElement): React.ReactNode => {
    const isSelected = selectedElementId === el.id;

    if (el.type === "group") {
      const isCollapsed = collapsedGroups.has(el.id);
      const isDragOver = dragOverId === el.id;
      return (
        <div
          key={el.id}
          draggable
          onDragStart={(e) => handleDragStart(e, el.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, el.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, el.id)}
          onClick={(e) => { e.stopPropagation(); setSelectedElementId(el.id); }}
          className={`relative group/outer rounded-lg border-2 transition-all ${
            isDragOver ? "border-primary/50 bg-primary/5 scale-[1.01]" :
            isSelected ? "border-primary shadow-md" : "border-muted-foreground/20 hover:border-muted-foreground/40"
          } ${draggedId === el.id ? "opacity-50" : ""}`}
        >
          {renderToolbar(el)}
          {/* Group header */}
          <div
            className="flex items-center gap-2 p-3 rounded-t-lg cursor-pointer"
            style={{ backgroundColor: `${brandColor}10` }}
            onClick={(e) => { e.stopPropagation(); toggleGroupCollapse(el.id); setSelectedElementId(el.id); }}
          >
            <div className="p-1 rounded" style={{ backgroundColor: brandColor }}>
              <FolderOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm flex-1" style={{ color: brandColor }}>{el.groupTitle || "Untitled Group"}</span>
            {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            <Badge variant="outline" className="text-[10px]">{(el.children || []).length} items</Badge>
          </div>
          {/* Group body - drop zone */}
          {!isCollapsed && (
            <div
              className={`p-3 space-y-2 bg-muted/10 min-h-[60px] transition-all ${
                draggedId && draggedId !== el.id ? "ring-2 ring-dashed ring-primary/30" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setDragOverId(`group-body-${el.id}`);
              }}
              onDragLeave={(e) => {
                e.stopPropagation();
                setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverId(null);
                if (!draggedId || draggedId === el.id) return;
                // Move the dragged element into this group
                const draggedEl = findElementById(elements, draggedId);
                if (!draggedEl) return;
                // Don't allow nesting groups inside groups
                if (draggedEl.type === "group") return;
                setElements((prev) => {
                  const cleaned = removeElementFromTree(prev, draggedId);
                  return addElementToContainer(cleaned, el.id, draggedEl);
                });
                setDraggedId(null);
              }}
            >
              {dragOverId === `group-body-${el.id}` && draggedId && draggedId !== el.id && (
                <div className="border-2 border-dashed border-primary/40 rounded-lg p-3 text-center text-xs text-primary/60 bg-primary/5">
                  Drop here to add to this group
                </div>
              )}
              {(el.children || []).length === 0 && dragOverId !== `group-body-${el.id}` ? (
                <div className="text-center py-6 text-muted-foreground border-2 border-dashed rounded-lg">
                  <LayoutGrid className="h-6 w-6 mx-auto mb-1 opacity-40" />
                  <p className="text-xs">Drop fields here or select this group and add elements</p>
                </div>
              ) : (
                (el.children || []).map(renderCanvasElement)
              )}
            </div>
          )}
        </div>
      );
    }

    if (el.type === "columns") {
      const cols = el.columnChildren || [[], []];
      const colCount = el.columnCount || 2;
      const isDragOver = dragOverId === el.id;
      return (
        <div
          key={el.id}
          draggable
          onDragStart={(e) => handleDragStart(e, el.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, el.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, el.id)}
          onClick={(e) => { e.stopPropagation(); setSelectedElementId(el.id); }}
          className={`relative group/outer rounded-lg border-2 transition-all ${
            isDragOver ? "border-primary/50 bg-primary/5 scale-[1.01]" :
            isSelected ? "border-primary shadow-md" : "border-muted-foreground/20 hover:border-muted-foreground/40"
          } ${draggedId === el.id ? "opacity-50" : ""}`}
        >
          {renderToolbar(el)}
          {/* Column header */}
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-t-lg">
            <Columns className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{colCount}-Column Layout</span>
          </div>
          {/* Column grid */}
          <div className={`grid gap-3 p-3 ${colCount === 2 ? "grid-cols-2" : colCount === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
            {cols.map((colElements, colIdx) => {
              const isColDragOver = dragOverColTarget?.columnsId === el.id && dragOverColTarget?.colIdx === colIdx;
              return (
                <div
                  key={colIdx}
                  onDragOver={(e) => handleColumnDragOver(e, el.id, colIdx)}
                  onDragLeave={handleColumnDragLeave}
                  onDrop={(e) => handleColumnDrop(e, el.id, colIdx)}
                  className={`border border-dashed rounded-lg p-2 min-h-[80px] space-y-2 transition-all ${
                    isColDragOver
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-muted-foreground/20"
                  }`}
                >
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase text-center mb-1">Col {colIdx + 1}</p>
                  {isColDragOver && colElements.length === 0 && (
                    <div className="flex items-center justify-center py-3 text-xs text-primary font-medium">
                      Drop here
                    </div>
                  )}
                  {colElements.map(renderCanvasElement)}
                  {/* Add to column button */}
                  <div className="flex justify-center">
                    <Select onValueChange={(type) => addToColumn(el.id, colIdx, type as ElementType)}>
                      <SelectTrigger className="h-7 w-7 p-0 border-dashed">
                        <Plus className="h-3.5 w-3.5" />
                      </SelectTrigger>
                      <SelectContent>
                        {ELEMENT_PALETTE.filter((c) => c.category !== "Layout").flatMap((cat) =>
                          cat.items.map((item) => (
                            <SelectItem key={item.type} value={item.type}>
                              <span className="flex items-center gap-2 text-xs">
                                <item.icon className="h-3 w-3" /> {item.label}
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Regular element
    const isDragOver = dragOverId === el.id;
    return (
      <div
        key={el.id}
        draggable
        onDragStart={(e) => handleDragStart(e, el.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, el.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, el.id)}
        onClick={(e) => { e.stopPropagation(); setSelectedElementId(el.id); }}
        className={`relative group cursor-pointer rounded-lg border-2 transition-all p-3 ${
          isDragOver ? "border-primary/50 bg-primary/5 scale-[1.01]" :
          isSelected ? "border-primary bg-primary/5 shadow-md" : "border-transparent hover:border-muted-foreground/20"
        } ${draggedId === el.id ? "opacity-50" : ""}`}
      >
        {renderToolbar(el)}
        {renderFieldContent(el)}
      </div>
    );
  };

  // ── Properties panel ──
  const renderPropertiesPanel = () => {
    if (!selectedElement) {
      return (
        <div className="text-center text-muted-foreground py-12">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select an element to edit its properties</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">Element Properties</h4>
          <Badge variant="secondary" className="text-xs">{selectedElement.type.replace("_", " ")}</Badge>
        </div>
        <Separator />

        {/* Group properties */}
        {selectedElement.type === "group" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Group Title</Label>
              <Input value={selectedElement.groupTitle || ""} onChange={(e) => updateElement(selectedElement.id, { groupTitle: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Collapsible</Label>
              <Switch checked={selectedElement.groupCollapsible || false} onCheckedChange={(v) => updateElement(selectedElement.id, { groupCollapsible: v })} />
            </div>
          </div>
        )}

        {/* Column properties */}
        {selectedElement.type === "columns" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Number of Columns</Label>
              <Select
                value={String(selectedElement.columnCount || 2)}
                onValueChange={(v) => {
                  const newCount = Number(v) as 2 | 3 | 4;
                  const currentCols = selectedElement.columnChildren || [];
                  const newCols: FormElement[][] = [];
                  for (let i = 0; i < newCount; i++) {
                    newCols.push(currentCols[i] || []);
                  }
                  updateElement(selectedElement.id, { columnCount: newCount, columnChildren: newCols });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 Columns</SelectItem>
                  <SelectItem value="3">3 Columns</SelectItem>
                  <SelectItem value="4">4 Columns</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Use the + button inside each column to add fields.</p>
          </div>
        )}

        {/* Table properties */}
        {selectedElement.type === "table" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Table Title</Label>
              <Input value={selectedElement.label || ""} onChange={(e) => updateElement(selectedElement.id, { label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Column Headers (one per line)</Label>
              <Textarea
                rows={4}
                value={(selectedElement.tableColumns || []).join("\n")}
                onChange={(e) => updateElement(selectedElement.id, { tableColumns: e.target.value.split("\n").filter(Boolean) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Number of Rows</Label>
              <Select value={String(selectedElement.tableRows || 3)} onValueChange={(v) => updateElement(selectedElement.id, { tableRows: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} row{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Header Colour</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={selectedElement.tableHeaderColor || brandColor} onChange={(e) => updateElement(selectedElement.id, { tableHeaderColor: e.target.value })} className="h-8 w-8 rounded border cursor-pointer" />
                <Input value={selectedElement.tableHeaderColor || brandColor} onChange={(e) => updateElement(selectedElement.id, { tableHeaderColor: e.target.value })} className="font-mono text-xs" />
              </div>
            </div>
          </div>
        )}

        {/* Image upload properties */}
        {selectedElement.type === "image_upload" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input value={selectedElement.label || ""} onChange={(e) => updateElement(selectedElement.id, { label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Help Text</Label>
              <Input value={selectedElement.helpText || ""} onChange={(e) => updateElement(selectedElement.id, { helpText: e.target.value })} placeholder="Optional instructions" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Required</Label>
              <Switch checked={selectedElement.required || false} onCheckedChange={(v) => updateElement(selectedElement.id, { required: v })} />
            </div>
          </div>
        )}

        {/* Content-type elements */}
        {(selectedElement.type === "heading" || selectedElement.type === "paragraph") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Content</Label>
              {selectedElement.type === "heading" ? (
                <Input value={selectedElement.content || ""} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} />
              ) : (
                <Textarea rows={4} value={selectedElement.content || ""} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} />
              )}
            </div>
            {selectedElement.type === "heading" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Heading Level</Label>
                <Select value={String(selectedElement.level || 2)} onValueChange={(v) => updateElement(selectedElement.id, { level: Number(v) as 1 | 2 | 3 })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">H1 — Large</SelectItem>
                    <SelectItem value="2">H2 — Medium</SelectItem>
                    <SelectItem value="3">H3 — Small</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {selectedElement.type === "image" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Image URL</Label>
              <Input value={selectedElement.imageUrl || ""} onChange={(e) => updateElement(selectedElement.id, { imageUrl: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alt Text</Label>
              <Input value={selectedElement.imageAlt || ""} onChange={(e) => updateElement(selectedElement.id, { imageAlt: e.target.value })} />
            </div>
          </div>
        )}

        {/* Field-type elements */}
        {selectedElement.type.endsWith("_input") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input value={selectedElement.label || ""} onChange={(e) => updateElement(selectedElement.id, { label: e.target.value })} />
            </div>
            {!["checkbox_input", "toggle_input", "rating_input", "file_input", "date_input"].includes(selectedElement.type) && (
              <div className="space-y-1.5">
                <Label className="text-xs">Placeholder</Label>
                <Input value={selectedElement.placeholder || ""} onChange={(e) => updateElement(selectedElement.id, { placeholder: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Help Text</Label>
              <Input value={selectedElement.helpText || ""} onChange={(e) => updateElement(selectedElement.id, { helpText: e.target.value })} placeholder="Optional helper text" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Required</Label>
              <Switch checked={selectedElement.required || false} onCheckedChange={(v) => updateElement(selectedElement.id, { required: v })} />
            </div>

            {selectedElement.type === "select_input" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Options (one per line)</Label>
                <Textarea
                  rows={4}
                  value={(selectedElement.options || []).join("\n")}
                  onChange={(e) => updateElement(selectedElement.id, { options: e.target.value.split("\n").filter(Boolean) })}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Preview: render element for preview mode ──
  const renderPreviewElement = (el: FormElement): React.ReactNode => {
    if (el.type === "group") {
      return (
        <div key={el.id} className="rounded-lg border overflow-hidden">
          <div className="flex items-center gap-2 p-3" style={{ backgroundColor: `${brandColor}10`, borderBottom: `2px solid ${brandColor}30` }}>
            <div className="p-1 rounded" style={{ backgroundColor: brandColor }}>
              <FolderOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm" style={{ color: brandColor }}>{el.groupTitle}</span>
          </div>
          <div className="p-4 space-y-4">
            {(el.children || []).map(renderPreviewElement)}
          </div>
        </div>
      );
    }

    if (el.type === "columns") {
      const cols = el.columnChildren || [[], []];
      const colCount = el.columnCount || 2;
      return (
        <div key={el.id} className={`grid gap-4 ${colCount === 2 ? "grid-cols-1 sm:grid-cols-2" : colCount === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-4"}`}>
          {cols.map((colEls, i) => (
            <div key={i} className="space-y-4">
              {colEls.map(renderPreviewElement)}
            </div>
          ))}
        </div>
      );
    }

    // Standard field preview
    if (el.type === "heading") return <h2 key={el.id} className={`font-bold ${el.level === 1 ? "text-2xl" : el.level === 3 ? "text-lg" : "text-xl"}`} style={{ color: brandColor }}>{el.content}</h2>;
    if (el.type === "paragraph") return <p key={el.id} className="text-sm text-muted-foreground leading-relaxed">{el.content}</p>;
    if (el.type === "separator") return <Separator key={el.id} />;
    if (el.type === "image" && el.imageUrl) return <img key={el.id} src={el.imageUrl} alt={el.imageAlt} className="mx-auto max-h-20 w-auto object-contain" />;
    if (["text_input", "email_input", "phone_input"].includes(el.type)) {
      return (
        <div key={el.id} className="space-y-1.5">
          <Label>{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
          <Input placeholder={el.placeholder} />
          {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
        </div>
      );
    }
    if (el.type === "textarea_input") {
      return (
        <div key={el.id} className="space-y-1.5">
          <Label>{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
          <Textarea placeholder={el.placeholder} rows={3} />
          {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
        </div>
      );
    }
    if (el.type === "select_input") {
      return (
        <div key={el.id} className="space-y-1.5">
          <Label>{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
          <Select>
            <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>{(el.options || []).map((opt, i) => <SelectItem key={i} value={opt}>{opt}</SelectItem>)}</SelectContent>
          </Select>
          {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
        </div>
      );
    }
    if (el.type === "checkbox_input") {
      return (
        <div key={el.id} className="flex items-center gap-2">
          <input type="checkbox" className="rounded border-muted-foreground" />
          <Label>{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
        </div>
      );
    }
    if (el.type === "date_input") {
      return (
        <div key={el.id} className="space-y-1.5">
          <Label>{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
          <Input type="date" />
        </div>
      );
    }
    if (el.type === "file_input") {
      return (
        <div key={el.id} className="space-y-1.5">
          <Label>{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
          <div className="border-2 border-dashed rounded-lg p-4 text-center text-sm text-muted-foreground">
            <Upload className="h-5 w-5 mx-auto mb-1" /> Click or drag to upload
          </div>
        </div>
      );
    }
    if (el.type === "rating_input") {
      return (
        <div key={el.id} className="space-y-1.5">
          <Label>{el.label}</Label>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((s) => <Star key={s} className="h-6 w-6 text-amber-400 cursor-pointer" />)}</div>
        </div>
      );
    }
    if (el.type === "toggle_input") {
      return (
        <div key={el.id} className="flex items-center justify-between">
          <Label>{el.label}</Label>
          <Switch />
        </div>
      );
    }
    if (el.type === "table") {
      const cols = el.tableColumns || ["Column 1", "Column 2"];
      const rows = el.tableRows || 3;
      return (
        <div key={el.id} className="space-y-1.5">
          {el.label && <Label className="font-medium">{el.label}</Label>}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: el.tableHeaderColor || brandColor }}>
                  {cols.map((col, i) => (
                    <th key={i} className="px-3 py-2 text-left text-white font-semibold text-xs">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: rows }).map((_, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-muted/20" : "bg-background"}>
                    {cols.map((_, colIdx) => (
                      <td key={colIdx} className="px-3 py-2 border-t">
                        <Input className="h-8 text-sm border-0 bg-transparent p-0" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
    if (el.type === "image_upload") {
      return (
        <div key={el.id} className="space-y-1.5">
          <Label>{el.label} {el.required && <span className="text-destructive">*</span>}</Label>
          {el.imageUrl ? (
            <img src={el.imageUrl} alt={el.imageAlt || "Uploaded"} className="w-full max-h-[300px] mx-auto rounded object-cover" />
          ) : (
            <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground">
              <ImagePlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Click to upload or drag & drop</p>
              <p className="text-xs mt-1">PNG, JPG, GIF, WebP up to 10MB</p>
            </div>
          )}
          {el.helpText && <p className="text-xs text-muted-foreground">{el.helpText}</p>}
        </div>
      );
    }
    return null;
  };

  // ── Preview mode ──
  if (showPreview) {
    return (
      <div className="min-h-[600px]">
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" onClick={() => setShowPreview(false)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Editor
          </Button>
          <Badge variant="secondary">Preview Mode</Badge>
        </div>

        <div className="w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-xl border">

          <div className="bg-background p-6 space-y-5">
            {elements.map(renderPreviewElement)}

            {elements.length > 0 && (
              <Button className="w-full text-white" style={{ backgroundColor: brandColor }}>
                Submit
              </Button>
            )}
          </div>

          <div className="px-6 py-3 text-center text-xs text-muted-foreground border-t" style={{ borderColor: `${brandColor}20` }}>
            Powered by The VA Team
          </div>
        </div>
      </div>
    );
  }

  // ── Editor layout ──
  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Form name..."
            className="font-semibold text-lg border-none shadow-none focus-visible:ring-0 w-[250px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4 mr-1" /> Save Form
          </Button>
        </div>
      </div>

      {/* Form settings row */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label className="text-xs">Description</Label>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Short description..." />
            </div>
            <div className="space-y-1.5 w-[180px]">
              <Label className="text-xs">Form Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead_capture">Lead Capture</SelectItem>
                  <SelectItem value="questionnaire">Questionnaire</SelectItem>
                  <SelectItem value="survey">Survey</SelectItem>
                  <SelectItem value="welcome_packet">Welcome Packet</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                  <SelectItem value="booking">Booking</SelectItem>
                  <SelectItem value="discovery">Discovery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-[140px]">
              <Label className="text-xs">Brand Colour</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-9 w-9 rounded border cursor-pointer" />
                <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="font-mono text-xs" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile element palette - horizontal scroll */}
      <div className="md:hidden">
        <Card>
          <div className="p-3 border-b bg-muted/30">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add Elements</h3>
          </div>
          <div className="p-2 flex gap-2 overflow-x-auto">
            {ELEMENT_PALETTE.flatMap((cat) =>
              cat.items.map((item) => (
                <Button
                  key={item.type}
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 text-xs"
                  onClick={() => addElement(item.type)}
                >
                  <item.icon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                  {item.label}
                </Button>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* 3-column layout: palette | canvas | properties */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] lg:grid-cols-[220px_1fr_280px] gap-4 min-h-[500px]">
        {/* Left: Element palette */}
        <Card className="overflow-hidden md:block hidden">
          <div className="p-3 border-b bg-muted/30">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add Elements</h3>
          </div>
          <ScrollArea className="h-[500px]">
            <div className="p-3 space-y-4">
              {ELEMENT_PALETTE.map((cat) => (
                <div key={cat.category}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat.category}</p>
                  <div className="space-y-1">
                    {cat.items.map((item) => (
                      <Button
                        key={item.type}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start h-8 text-xs"
                        onClick={() => addElement(item.type)}
                      >
                        <item.icon className="h-3.5 w-3.5 mr-2 shrink-0" />
                        {item.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Center: Canvas */}
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Canvas</h3>
            <Badge variant="outline" className="text-xs">{elements.length} element{elements.length !== 1 ? "s" : ""}</Badge>
          </div>
          <ScrollArea className="h-[500px]">
            <div className="p-4">

              {elements.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <GripVertical className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Your form is empty</p>
                  <p className="text-sm">Click elements from the left panel to start building</p>
                </div>
              ) : (
                <div className="space-y-2">{elements.map(renderCanvasElement)}</div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Right: Properties panel */}
        <Card className="overflow-hidden lg:block hidden">
          <div className="p-3 border-b bg-muted/30">
            <h3 className="font-semibold text-sm flex items-center gap-1.5"><Settings className="h-4 w-4" /> Properties</h3>
          </div>
          <ScrollArea className="h-[500px]">
            <div className="p-3">{renderPropertiesPanel()}</div>
          </ScrollArea>
        </Card>

        {/* Properties panel inline on smaller screens */}
        {selectedElement && (
          <Card className="overflow-hidden lg:hidden col-span-full">
            <div className="p-3 border-b bg-muted/30">
              <h3 className="font-semibold text-sm flex items-center gap-1.5"><Settings className="h-4 w-4" /> Properties</h3>
            </div>
            <div className="p-3">{renderPropertiesPanel()}</div>
          </Card>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Element</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this element? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
