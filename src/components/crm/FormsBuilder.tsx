import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2,
  Type,
  BarChart,
  CheckSquare,
  Star,
  Loader2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FormEditorCanvas } from "./FormEditorCanvas";
import { supabase } from "@/integrations/supabase/client";

type FormType = 'lead_capture' | 'questionnaire' | 'survey' | 'welcome_packet' | 'feedback' | 'booking' | 'discovery';

interface SavedForm {
  id: string;
  name: string;
  description: string;
  type: string;
  elements: any[];
  isActive: boolean;
  brandColor: string;
  createdAt: Date;
  updatedAt: Date;
}

export function FormsBuilder() {
  const [forms, setForms] = useState<SavedForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<FormType | 'all'>('all');
  const [editorMode, setEditorMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingForm, setEditingForm] = useState<SavedForm | null>(null);

  const fetchForms = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('form_templates' as any)
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        type: row.form_type,
        elements: row.elements || [],
        isActive: row.is_active,
        brandColor: row.brand_color,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
      setForms(mapped);
    } catch (err) {
      console.error('Error fetching forms:', err);
      toast({ title: "Error", description: "Failed to load forms.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const filteredForms = forms.filter(form => {
    const matchesSearch = form.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         form.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || form.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleSaveForm = async (template: any) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "You must be logged in to save forms.", variant: "destructive" });
        return;
      }

      const existingForm = forms.find(f => f.id === template.id);

      if (existingForm) {
        // Update existing
        const { error } = await supabase
          .from('form_templates' as any)
          .update({
            name: template.name,
            description: template.description,
            form_type: template.type,
            elements: template.elements,
            brand_color: template.brandColor,
            is_active: template.isActive,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', template.id);

        if (error) throw error;
        toast({ title: "Form Updated", description: `"${template.name}" has been saved.` });
      } else {
        // Create new
        const { error } = await supabase
          .from('form_templates' as any)
          .insert({
            name: template.name,
            description: template.description,
            form_type: template.type,
            elements: template.elements,
            brand_color: template.brandColor,
            is_active: template.isActive,
            created_by: user.id,
          } as any);

        if (error) throw error;
        toast({ title: "Form Created", description: `"${template.name}" has been created successfully.` });
      }

      await fetchForms();
      setEditorMode('list');
      setEditingForm(null);
    } catch (err) {
      console.error('Error saving form:', err);
      toast({ title: "Error", description: "Failed to save form.", variant: "destructive" });
    }
  };

  const handleEditForm = (form: SavedForm) => {
    setEditingForm(form);
    setEditorMode('edit');
  };

  const handleDeleteForm = async (formId: string) => {
    try {
      const { error } = await supabase
        .from('form_templates' as any)
        .delete()
        .eq('id', formId);

      if (error) throw error;
      setForms(forms.filter(f => f.id !== formId));
      toast({ title: "Form Deleted", description: "The form has been removed." });
    } catch (err) {
      console.error('Error deleting form:', err);
      toast({ title: "Error", description: "Failed to delete form.", variant: "destructive" });
    }
  };

  const getFormTypeColor = (type: string) => {
    switch (type) {
      case 'lead_capture': return 'bg-blue-100 text-blue-800';
      case 'questionnaire': return 'bg-purple-100 text-purple-800';
      case 'survey': return 'bg-green-100 text-green-800';
      case 'welcome_packet': return 'bg-yellow-100 text-yellow-800';
      case 'feedback': return 'bg-orange-100 text-orange-800';
      case 'booking': return 'bg-pink-100 text-pink-800';
      case 'discovery': return 'bg-cyan-100 text-cyan-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Show form editor when creating or editing
  if (editorMode === 'create' || editorMode === 'edit') {
    return (
      <div className="space-y-6">
        <FormEditorCanvas
          onBack={() => { setEditorMode('list'); setEditingForm(null); }}
          onSave={handleSaveForm}
          editingTemplate={editingForm ? {
            id: editingForm.id,
            name: editingForm.name,
            description: editingForm.description,
            type: editingForm.type,
            elements: editingForm.elements,
            isActive: editingForm.isActive,
            brandColor: editingForm.brandColor,
          } : null}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Type className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Total Forms</p>
                <p className="text-2xl font-bold">{forms.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Active Forms</p>
                <p className="text-2xl font-bold">{forms.filter(f => f.isActive).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Total Submissions</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Star className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Avg. Conversion</p>
                <p className="text-2xl font-bold">{forms.length > 0 ? '24%' : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forms Management */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Forms Management
            </CardTitle>
            <Button onClick={() => setEditorMode('create')}>
              <Plus className="h-4 w-4 mr-2" />
              Create Form
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search forms..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={(value: FormType | 'all') => setTypeFilter(value)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
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

          {/* Forms Grid */}
          {filteredForms.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Type className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-lg">No forms yet</p>
              <p className="text-sm mb-4">Click "Create Form" to open the form builder and design your first form.</p>
              <Button onClick={() => setEditorMode('create')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Form
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredForms.map((form) => (
                <Card key={form.id} className="border-2 hover:border-primary/20 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle>{form.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{form.description}</p>
                      </div>
                      <Badge variant={form.isActive ? 'default' : 'secondary'}>
                        {form.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge className={getFormTypeColor(form.type)}>
                          {form.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {form.elements.length} elements
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleEditForm(form)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => handleDeleteForm(form.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
