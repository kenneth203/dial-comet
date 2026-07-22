import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Customer, CustomerContact, useCustomers } from "@/context/CustomersContext";
import { Edit, Save, Plus, Trash2, MapPin, AlertTriangle, Navigation, CalendarOff, FileText, ChevronDown, ChevronRight, Users, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { OOOAlert } from "./OOOAlert";
import { ContactOOODialog } from "./ContactOOODialog";
import { sanitizeHtml } from "@/lib/sanitize";
import { secureLog } from "@/lib/secureLogger";
import { isBlockedMapHost, isValidNonBlockedMapUrl } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import {
  clearCustomerScriptDraft,
  formatCustomerScriptDraftTime,
  loadCustomerScriptDraft,
  saveCustomerScriptDraft,
  scriptDraftDiffers,
  type CustomerScriptDraft,
} from "@/lib/customerScriptDrafts";

interface CustomerScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
}

export function CustomerScriptModal({ isOpen, onClose, customer }: CustomerScriptModalProps) {
  const { updateCustomer } = useCustomers();
  const { toast } = useToast();
  const { can } = usePermissions();
  const canEditScript = can('customer_directory', 'script_edit') || can('customer_directory', 'edit');
  const canEditContactOOO = can('customer_directory', 'contact_ooo_edit') || can('customer_directory', 'edit');
  const [isEditing, setIsEditing] = useState(false);
  const [editedScript, setEditedScript] = useState("");
  const [editedScriptTags, setEditedScriptTags] = useState<{ name: string; searchText: string; }[]>([]);
  const [showOOOAlert, setShowOOOAlert] = useState(false);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState<number | null>(null);
  const [oooContact, setOooContact] = useState<CustomerContact | null>(null);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [showQuickNav, setShowQuickNav] = useState(false);
  const [showEditQuickNav, setShowEditQuickNav] = useState(false);
  const [scriptDraft, setScriptDraft] = useState<CustomerScriptDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<number | null>(null);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const isAutosavingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  const loggedViewRef = useRef<string | null>(null);

  // Only (re)initialize the edited script when the modal opens or the
  // customer identity changes — NOT on every customer object refresh
  // (e.g. realtime/context refetches). Otherwise an incoming notification
  // that triggers a customers refetch would clobber the user's unsaved edits.
  const initializedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!customer) return;
    const key = isOpen ? customer.id : null;
    if (key && initializedForRef.current !== key) {
      secureLog.debug('Customer script modal loaded', {
        hasCustomer: true,
        hasContacts: !!customer.contacts?.length,
      });
      const draft = loadCustomerScriptDraft(customer.id);
      setEditedScript(customer.script ?? "");
      setEditedScriptTags(customer.scriptTags ?? []);
      setScriptDraft(draft && scriptDraftDiffers(draft, customer.script || "", customer.scriptTags || []) ? draft : null);
      initializedForRef.current = key;
    }
    if (!isOpen) {
      initializedForRef.current = null;
    }

    // OOO alert can safely react to latest customer data.
    const hasActiveOOO = customer.contacts && customer.contacts.some(contact => {
      if (!contact.oooReason || !contact.oooFromDate || !contact.oooUntilDate) {
        return false;
      }
      const untilDate = new Date(contact.oooUntilDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return untilDate >= today;
    });
    setShowOOOAlert(!!hasActiveOOO && isOpen);
  }, [customer, isOpen]);

  // Autosave a local draft while editing so a stray refetch / popup dismiss
  // can never wipe unsaved work. Cleared on successful save / cancel.
  useEffect(() => {
    if (!customer || !isOpen || !isEditing) return;
    const hasUnsavedScriptChanges = scriptDraftDiffers(
      { script: editedScript, scriptTags: editedScriptTags },
      customer.script || "",
      customer.scriptTags || [],
    );
    if (!hasUnsavedScriptChanges) return;

    const t = setTimeout(() => {
      try {
        saveCustomerScriptDraft(customer.id, editedScript, editedScriptTags, customer.name);
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(t);
  }, [editedScript, editedScriptTags, isEditing, isOpen, customer]);

  // Reset autosave indicator when entering/leaving edit mode or switching customer.
  useEffect(() => {
    if (!isEditing) {
      setLastAutosavedAt(null);
      setAutosaveState('idle');
    }
  }, [isEditing, customer?.id]);

  // Periodic background autosave to the database while editing, so long
  // sessions can't lose work to a session timeout, refresh or tab crash.
  // Runs every 60s and only when there are unsaved differences vs the
  // currently loaded customer record.
  useEffect(() => {
    if (!customer || !isOpen || !isEditing || !canEditScript) return;

    const runAutosave = async () => {
      if (isAutosavingRef.current || isSaving) return;
      const script = editedScript;
      const tags = editedScriptTags;
      const hasChanges = scriptDraftDiffers(
        { script, scriptTags: tags },
        customer.script || "",
        customer.scriptTags || [],
      );
      if (!hasChanges) return;

      isAutosavingRef.current = true;
      setAutosaveState('saving');
      try {
        // Keep the local draft up-to-date first so a failed remote save
        // still leaves the latest content recoverable.
        saveCustomerScriptDraft(customer.id, script, tags, customer.name);
        const success = await updateCustomer(customer.id, {
          script,
          scriptTags: tags,
        });
        if (success) {
          setLastAutosavedAt(Date.now());
          setAutosaveState('idle');
        } else {
          setAutosaveState('error');
        }
      } catch (e) {
        secureLog.debug('script autosave failed', { e: String(e) });
        setAutosaveState('error');
      } finally {
        isAutosavingRef.current = false;
      }
    };

    const interval = window.setInterval(runAutosave, 60_000);
    return () => window.clearInterval(interval);
  }, [customer, isOpen, isEditing, canEditScript, editedScript, editedScriptTags, isSaving, updateCustomer]);

  // Audit: log a 'view' once per open per customer
  useEffect(() => {
    if (!isOpen || !customer) return;
    const key = `${customer.id}`;
    if (loggedViewRef.current === key) return;
    loggedViewRef.current = key;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('customer_script_audit').insert({
        customer_id: customer.id,
        user_id: user.id,
        action: 'view',
      });
    })().catch((e) => secureLog.debug('script view audit failed', { e: String(e) }));
    if (!isOpen) loggedViewRef.current = null;
  }, [isOpen, customer]);

  useEffect(() => { if (!isOpen) loggedViewRef.current = null; }, [isOpen]);

  useEffect(() => {
    if (isEditing && dialogContentRef.current && editorRef.current) {
      setShowCustomerInfo(false);
      setShowEditQuickNav(false);
      const timeout = setTimeout(() => {
        dialogContentRef.current?.scrollTo({
          top: (editorRef.current?.offsetTop ?? 0) - 16,
          behavior: 'smooth',
        });
      }, 80);
      return () => clearTimeout(timeout);
    }
  }, [isEditing]);

  if (!customer) return null;

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const oldScript = customer.script || "";
      const oldTags = customer.scriptTags || [];
      const scriptChanged = oldScript !== editedScript;
      const tagsChanged = JSON.stringify(oldTags) !== JSON.stringify(editedScriptTags);

      saveCustomerScriptDraft(customer.id, editedScript, editedScriptTags, customer.name);
      const success = await updateCustomer(customer.id, {
        script: editedScript,
        scriptTags: editedScriptTags
      });

      if (!success) {
        toast({
          title: "Script not saved",
          description: "Your changes were kept as a local draft. Please sign in and try again.",
          variant: "destructive",
        });
        return;
      }

      if (scriptChanged || tagsChanged) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from('customer_script_audit').insert({
              customer_id: customer.id,
              user_id: user.id,
              action: 'edit',
              old_script: scriptChanged ? oldScript : null,
              new_script: scriptChanged ? editedScript : null,
              old_tags: tagsChanged ? (oldTags as any) : null,
              new_tags: tagsChanged ? (editedScriptTags as any) : null,
            });
          }
        } catch (e) {
          secureLog.debug('script edit audit failed', { e: String(e) });
        }
      }

      toast({
        title: "Script updated",
        description: `Script for ${customer.name} has been saved successfully.`,
      });

      clearCustomerScriptDraft(customer.id);
      setScriptDraft(null);
      setIsEditing(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save script. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedScript(customer.script || "");
    setEditedScriptTags(customer.scriptTags || []);
    clearCustomerScriptDraft(customer.id);
    setScriptDraft(null);
    setIsEditing(false);
  };

  const restoreScriptDraft = () => {
    if (!scriptDraft) return;
    setEditedScript(scriptDraft.script);
    setEditedScriptTags(scriptDraft.scriptTags || []);
    setScriptDraft(null);
    setIsEditing(true);
  };

  const discardScriptDraft = () => {
    clearCustomerScriptDraft(customer.id);
    setScriptDraft(null);
  };

  const addScriptTag = () => {
    setEditedScriptTags([...editedScriptTags, { name: "", searchText: "" }]);
  };

  const updateScriptTag = (index: number, field: 'name' | 'searchText', value: string) => {
    const tags = [...editedScriptTags];
    tags[index] = { ...tags[index], [field]: value };
    setEditedScriptTags(tags);
  };

  const removeScriptTag = (index: number) => {
    setEditedScriptTags(editedScriptTags.filter((_, i) => i !== index));
  };

  // Helper function to validate any HTTP/HTTPS URL
  const isValidHttpUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // Build map URL for any location - only returns non-blocked map URLs
  const buildLocationMapUrl = (location?: any) => {
    if (!location) return null;
    
    // Only return google_maps_url if it's a valid, non-blocked URL
    if (location.google_maps_url && isValidNonBlockedMapUrl(location.google_maps_url)) {
      return location.google_maps_url;
    }
    
    return null;
  };

  // Open map in new tab using window.open
  const openMapInNewTab = (url: string | null, locationName?: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      toast({
        title: "No map available",
        description: `No address found for ${locationName || 'this location'}`,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* OOO Alert - positioned outside dialog for proper z-index */}
      {showOOOAlert && customer && (
        <OOOAlert 
          contacts={customer.contacts || []} 
          onDismiss={() => setShowOOOAlert(false)}
        />
      )}
      
      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}>
      <DialogContent ref={dialogContentRef} className="max-w-[95vw] xl:max-w-[1400px] w-full h-[95dvh] max-h-[95dvh] overflow-y-auto flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogDescription className="sr-only">
            Customer script modal with navigation and editing capabilities
          </DialogDescription>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold text-destructive">
              {customer.name} - Inbound Call Script
            </DialogTitle>
            <div className="flex gap-2 mr-6">
              {canEditScript && (
                !isEditing ? (
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <>
                    <span className="hidden sm:inline text-xs text-muted-foreground self-center mr-1" aria-live="polite">
                      {autosaveState === 'saving'
                        ? 'Autosaving…'
                        : autosaveState === 'error'
                          ? 'Autosave failed — keep editing, we\'ll retry'
                          : lastAutosavedAt
                            ? `Autosaved ${formatCustomerScriptDraftTime(lastAutosavedAt)}`
                            : 'Autosaves every minute'}
                    </span>
                    <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </>
                )
              )}
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-shrink-0 space-y-3">
          {scriptDraft && canEditScript && !isEditing && (
            <Alert className="border-primary/30 bg-primary/5">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unsaved script draft found</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  A script draft from {formatCustomerScriptDraftTime(scriptDraft.savedAt)} is available for this customer.
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={restoreScriptDraft}>
                    Restore Draft
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={discardScriptDraft}>
                    Discard
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Customer Basic Info (now first, collapsible) */}
          <div className="bg-gradient-to-r from-primary/10 to-primary-variant/10 border border-primary/20 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCustomerInfo(v => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-primary/5 transition-colors"
              aria-expanded={showCustomerInfo}
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={`h-4 w-4 text-primary transition-transform duration-300 ${showCustomerInfo ? 'rotate-0' : '-rotate-90'}`}
                />
                <h3 className="font-semibold text-primary text-sm">Customer Information</h3>
              </div>
              {customer.systemIcon && customer.systemLink && (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-primary font-medium">Booking System:</span>
                  <a
                    href={customer.systemLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center p-1 rounded-md border-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
                    title={`Open booking system: ${customer.systemLink || 'No link configured'}`}
                  >
                    <img
                      src={customer.systemIcon}
                      alt="Booking system icon"
                      className="w-7 h-7 object-contain pointer-events-none"
                    />
                  </a>
                </div>
              )}
            </button>
            <div
              className={`grid transition-all duration-300 ease-out ${
                showCustomerInfo ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="px-4 pb-3 pt-1 border-t border-primary/10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-semibold text-primary">Name:</span> <span className="text-foreground">{customer.name}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">Business Type:</span> <span className="text-foreground">{customer.businessType || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">Call Handling Tier:</span> <span className="text-foreground">{customer.callHandlingTier || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">Phone:</span> <span className="text-foreground">{customer.tel || customer.mobile || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">Email:</span> <span className="text-foreground">{customer.email || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-primary">Website:</span>{' '}
                      {customer.website ? (
                        <a href={customer.website.startsWith('http') ? customer.website : `https://${customer.website}`} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">{customer.website}</a>
                      ) : <span className="text-foreground">N/A</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Navigation (now second, collapsible) */}
          {isEditing ? (
            <div className="bg-gradient-to-r from-primary/10 to-primary-variant/10 border border-primary/20 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowEditQuickNav(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-primary/5 transition-colors"
                aria-expanded={showEditQuickNav}
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={`h-4 w-4 text-primary transition-transform duration-300 ${showEditQuickNav ? 'rotate-0' : '-rotate-90'}`}
                  />
                  <h4 className="font-semibold text-sm text-primary">Quick Navigation Tags</h4>
                  <span className="text-xs text-muted-foreground">({editedScriptTags.length})</span>
                </div>
                {showEditQuickNav && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Button type="button" variant="outline" size="sm" onClick={addScriptTag}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Tag
                    </Button>
                  </span>
                )}
              </button>
              <div
                className={`grid transition-all duration-300 ease-out ${
                  showEditQuickNav ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pb-3 pt-1 border-t border-primary/10 space-y-2">
                    {editedScriptTags.map((tag, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          placeholder="Tag name"
                          value={tag.name}
                          onChange={(e) => updateScriptTag(index, 'name', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Search text"
                          value={tag.searchText}
                          onChange={(e) => updateScriptTag(index, 'searchText', e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeScriptTag(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            customer && (
              <div className="bg-gradient-to-r from-primary/10 to-primary-variant/10 border border-primary/20 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowQuickNav(v => !v)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-primary/5 transition-colors"
                  aria-expanded={showQuickNav}
                >
                  <ChevronDown
                    className={`h-4 w-4 text-primary transition-transform duration-300 ${showQuickNav ? 'rotate-0' : '-rotate-90'}`}
                  />
                  <h4 className="font-semibold text-sm text-primary">Quick Navigation</h4>
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    showQuickNav ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                  <div className="px-4 pb-3 pt-1 border-t border-primary/10">
                    {/* Location Map & Notes Buttons */}
                    {customer.locations && customer.locations.length > 0 && (
                      <div className="mb-3 space-y-2">
                        {/* Row 1: Map buttons */}
                        <div className="flex flex-wrap gap-1.5">
                          {customer.locations.map((location, index) => {
                            const locationUrl = buildLocationMapUrl(location);
                            const locationName = location.name || `Location ${index + 1}`;
                            return locationUrl ? (
                              <Button
                                key={`map-${location.id || index}`}
                                variant="outline"
                                size="sm"
                                className="border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                                onClick={() => openMapInNewTab(locationUrl, locationName)}
                              >
                                <MapPin className="h-3 w-3 mr-1" />
                                Map: {locationName}
                              </Button>
                            ) : null;
                          })}
                        </div>
                        {/* Row 2: Directions buttons */}
                        {customer.locations.some(l => l.notes && l.notes.trim()) && (
                          <div className="flex flex-wrap gap-1.5">
                            {customer.locations.map((location, index) => {
                              if (!location.notes || !location.notes.trim()) return null;
                              const locationName = location.name || `Location ${index + 1}`;
                              const isSelected = selectedLocationIndex === index;
                              return (
                                <button
                                  key={`note-${location.id || index}`}
                                  onClick={() => setSelectedLocationIndex(index)}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                                    isSelected
                                      ? 'bg-accent text-accent-foreground border-accent'
                                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                                  }`}
                                >
                                  <Navigation className="h-3 w-3" />
                                  Directions: {locationName}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {/* Directions popup dialog */}
                        <Dialog open={selectedLocationIndex !== null && !!customer.locations[selectedLocationIndex ?? 0]?.notes?.trim()} onOpenChange={(open) => { if (!open) setSelectedLocationIndex(null); }}>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2 text-primary">
                                <Navigation className="h-4 w-4" />
                                {selectedLocationIndex !== null ? (customer.locations[selectedLocationIndex]?.name || `Location ${selectedLocationIndex + 1}`) : ''} — Directions
                              </DialogTitle>
                              <DialogDescription className="sr-only">Location directions and notes</DialogDescription>
                            </DialogHeader>
                            <div className="max-h-[60vh] overflow-y-auto">
                              <p className="text-sm text-foreground whitespace-pre-line">
                                {selectedLocationIndex !== null ? customer.locations[selectedLocationIndex]?.notes : ''}
                              </p>
                            </div>
                            <div className="flex justify-end pt-2 border-t">
                              <Button variant="outline" size="sm" onClick={() => setSelectedLocationIndex(null)}>
                                Close
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}

                    {customer.scriptTags && customer.scriptTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {customer.scriptTags.map((tag, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            className="border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                            onClick={() => {
                              const scriptElement = document.querySelector('.rich-text-content');
                              if (scriptElement && tag.searchText) {
                                const walker = document.createTreeWalker(
                                  scriptElement,
                                  NodeFilter.SHOW_TEXT,
                                  null
                                );
                                let node;
                                while (node = walker.nextNode()) {
                                  if (node.textContent?.toLowerCase().includes(tag.searchText.toLowerCase())) {
                                    const element = node.parentElement;
                                    if (element) {
                                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      element.style.backgroundColor = 'hsl(var(--primary) / 0.2)';
                                      setTimeout(() => {
                                        element.style.backgroundColor = '';
                                      }, 2000);
                                    }
                                    break;
                                  }
                                }
                              }
                            }}
                          >
                            {tag.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            )
          )}

        </div>


        {/* Tabs: Script | Contact Out of Office */}
        {(() => {
          const visibleContacts = (customer.contacts || []).filter(c => !c.hidden);
          const hasContacts = visibleContacts.length > 0;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const activeOOOCount = visibleContacts.filter(c => {
            if (!c.oooReason && !c.oooFromDate && !c.oooUntilDate) return false;
            return c.oooUntilDate ? new Date(c.oooUntilDate) >= today : true;
          }).length;

          return (
            <Tabs defaultValue="script" className="flex flex-col mt-2">
              <TabsList className="flex-shrink-0 w-full justify-start">
                <TabsTrigger value="script" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Customer Script
                </TabsTrigger>
                {hasContacts && (
                  <TabsTrigger value="contacts" className="gap-2">
                    <Users className="h-4 w-4" />
                    Contacts
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                      {visibleContacts.length}
                    </span>
                  </TabsTrigger>
                )}
                {hasContacts && (
                  <TabsTrigger value="ooo" className="gap-2">
                    <CalendarOff className="h-4 w-4" />
                    Contact Out of Office
                    {activeOOOCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                        {activeOOOCount}
                      </span>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>

              {/* SCRIPT TAB */}
              <TabsContent value="script" className="flex flex-col mt-3 data-[state=inactive]:hidden">
                <div className="flex flex-col space-y-3">
                  {isEditing ? (
                    <div ref={editorRef} className="space-y-3 scroll-mt-4">
                      <RichTextEditor
                        value={editedScript}
                        onChange={setEditedScript}
                        placeholder="Enter the customer script..."
                        className="min-h-96"
                      />
                    </div>
                  ) : (
                    customer.script ? (
                      <div className="w-full border rounded-lg">
                        <div className="bg-background p-6">
                          <style dangerouslySetInnerHTML={{
                            __html: `
                              .rich-text-content {
                                font-family: ui-sans-serif, system-ui, sans-serif;
                                line-height: 1.4;
                              }
                              .rich-text-content h1,
                              .rich-text-content h2,
                              .rich-text-content h3,
                              .rich-text-content h4,
                              .rich-text-content h5,
                              .rich-text-content h6 {
                                margin-top: 0.75em;
                                margin-bottom: 0.25em;
                                font-weight: 600;
                                color: hsl(var(--foreground));
                              }
                              .rich-text-content h1:first-child,
                              .rich-text-content h2:first-child,
                              .rich-text-content h3:first-child,
                              .rich-text-content h4:first-child,
                              .rich-text-content h5:first-child,
                              .rich-text-content h6:first-child,
                              .rich-text-content p:first-child {
                                margin-top: 0;
                              }
                              .rich-text-content p {
                                margin-bottom: 0.25em;
                                color: hsl(var(--foreground));
                              }
                              .rich-text-content strong {
                                font-weight: 600;
                              }
                              .rich-text-content ul {
                                margin-bottom: 0.5em;
                                padding-left: 1.5em;
                                list-style-type: disc;
                              }
                              .rich-text-content ol {
                                margin-bottom: 0.5em;
                                padding-left: 1.5em;
                                list-style-type: decimal;
                              }
                              .rich-text-content li {
                                margin-bottom: 0.1em;
                                display: list-item;
                              }
                              .rich-text-content li[data-list="bullet"] {
                                list-style-type: disc;
                              }
                              .rich-text-content li[data-list="ordered"] {
                                list-style-type: decimal;
                              }
                              .rich-text-content .ql-indent-1 {
                                padding-left: 1.5em;
                              }
                              .rich-text-content .ql-indent-2 {
                                padding-left: 3em;
                              }
                              .rich-text-content a {
                                color: hsl(var(--primary));
                                text-decoration: underline;
                              }
                              .rich-text-content table {
                                width: 100%;
                                border-collapse: collapse;
                                margin: 0.75em 0;
                                font-size: 0.95em;
                                table-layout: auto;
                              }
                              .rich-text-content thead {
                                background-color: hsl(var(--muted));
                              }
                              .rich-text-content th,
                              .rich-text-content td {
                                border: 1px solid hsl(var(--border));
                                padding: 0.5em 0.75em;
                                text-align: left;
                                vertical-align: top;
                                color: hsl(var(--foreground));
                              }
                              .rich-text-content th {
                                font-weight: 600;
                                background-color: hsl(var(--muted));
                              }
                              .rich-text-content tbody tr:nth-child(even) {
                                background-color: hsl(var(--muted) / 0.3);
                              }
                              .rich-text-content table p {
                                margin: 0;
                              }
                            `
                          }} />
                          {(() => {
                            secureLog.debug('Rendering customer script content');
                            const sanitizedScript = sanitizeHtml(customer.script);
                            return (
                              <div
                                className="prose prose-sm max-w-none rich-text-content"
                                dangerouslySetInnerHTML={{ __html: sanitizedScript }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-muted/30 border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                        <p className="text-muted-foreground">
                          No script has been configured for this customer yet.
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Click Edit to add a script for this customer.
                        </p>
                      </div>
                    )
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  {!isEditing && (
                    <Button variant="outline" onClick={onClose}>
                      Close
                    </Button>
                  )}
                </div>
              </TabsContent>

              {/* CONTACTS TAB */}
              {hasContacts && (
                <TabsContent value="contacts" className="flex flex-col mt-3 data-[state=inactive]:hidden">
                  <div className="bg-card border border-border p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-primary flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Customer Contacts
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {visibleContacts.length} {visibleContacts.length === 1 ? 'contact' : 'contacts'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {visibleContacts.map((c) => {
                        const fullName = `${c.firstName || ''} ${c.surname || ''}`.trim() || 'Contact';
                        return (
                          <div key={c.id} className="p-3 rounded-md bg-muted/40 border border-border/50">
                            <div className="flex flex-wrap items-baseline gap-x-2">
                              <span className="text-sm font-semibold text-foreground">{fullName}</span>
                              {c.position && (
                                <span className="text-xs text-muted-foreground">· {c.position}</span>
                              )}
                            </div>
                            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
                              <div className="flex items-center gap-1.5 text-foreground">
                                <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
                                {c.mobile ? (
                                  <a href={`tel:${c.mobile}`} className="text-primary hover:underline truncate">{c.mobile}</a>
                                ) : (
                                  <span className="text-muted-foreground">No phone</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-foreground">
                                <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                                {c.email ? (
                                  <a href={`mailto:${c.email}`} className="text-primary hover:underline truncate">{c.email}</a>
                                ) : (
                                  <span className="text-muted-foreground">No email</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>
              )}

              {/* CONTACT OUT OF OFFICE TAB */}
              {hasContacts && (
                <TabsContent value="ooo" className="flex flex-col mt-3 data-[state=inactive]:hidden">
                  <div className="bg-card border border-border p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-primary flex items-center gap-2">
                        <CalendarOff className="h-4 w-4" />
                        Contact Out of Office
                      </h3>
                      {activeOOOCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {activeOOOCount} active
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {visibleContacts.map((c) => {
                        const hasOOO = !!(c.oooReason || c.oooFromDate || c.oooUntilDate);
                        const fromStr = c.oooFromDate ? format(new Date(c.oooFromDate), "dd/MM/yyyy") : null;
                        const untilStr = c.oooUntilDate ? format(new Date(c.oooUntilDate), "dd/MM/yyyy") : null;
                        const stillActive = c.oooUntilDate
                          ? new Date(c.oooUntilDate) >= new Date(new Date().setHours(0, 0, 0, 0))
                          : hasOOO;
                        return (
                          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-md bg-muted/40">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-foreground truncate">
                                {`${c.firstName || ''} ${c.surname || ''}`.trim() || 'Contact'}
                                {c.position && <span className="text-muted-foreground font-normal"> · {c.position}</span>}
                              </div>
                              {hasOOO ? (
                                <div className={`text-xs mt-0.5 ${stillActive ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  <span className="font-medium">OOO:</span> {c.oooReason || '—'}
                                  {(fromStr || untilStr) && (
                                    <span> ({fromStr || '?'} – {untilStr || '?'})</span>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground mt-0.5">No Out of Office set</div>
                              )}
                            </div>
                            {canEditContactOOO && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setOooContact(c)}
                              >
                                <CalendarOff className="h-3 w-3 mr-1" />
                                {hasOOO ? 'Edit OOO' : 'Set OOO'}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          );
        })()}
      </DialogContent>
    </Dialog>

    <ContactOOODialog
      isOpen={!!oooContact}
      onClose={() => setOooContact(null)}
      customerId={customer.id}
      customerName={customer.name}
      contact={oooContact}
    />
    </>
  );
}