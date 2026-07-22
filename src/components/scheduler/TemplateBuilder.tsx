import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface ShiftTemplate {
  id: string;
  name: string;
  description?: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  effective_start: string;
  effective_end?: string;
  headcount: number;
  role_name: string;
  color_code: string;
  status: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const SHIFT_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
];

export function TemplateBuilder() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Partial<ShiftTemplate> | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('shift_templates')
        .select('*')
        .order('name');

      if (error) throw error;
      setTemplates((data || []) as any);
    } catch (error: any) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!editingTemplate || !user) {
      toast.error('Please ensure you are logged in and all fields are filled');
      return;
    }

    // Validate required fields
    if (!editingTemplate.name?.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!editingTemplate.role_name) {
      toast.error('Role is required');
      return;
    }
    if (!editingTemplate.start_time) {
      toast.error('Start time is required');
      return;
    }
    if (!editingTemplate.end_time) {
      toast.error('End time is required');
      return;
    }
    if (!editingTemplate.days_of_week || editingTemplate.days_of_week.length === 0) {
      toast.error('At least one day must be selected');
      return;
    }
    if (!editingTemplate.effective_start) {
      toast.error('Start date is required');
      return;
    }
    if (!editingTemplate.color_code) {
      toast.error('Color is required');
      return;
    }

    try {
      const templateData = {
        name: editingTemplate.name.trim(),
        description: editingTemplate.description?.trim() || null,
        start_time: editingTemplate.start_time,
        end_time: editingTemplate.end_time,
        days_of_week: editingTemplate.days_of_week,
        effective_start: editingTemplate.effective_start,
        effective_end: editingTemplate.effective_end || null,
        headcount: editingTemplate.headcount || 1,
        role_name: editingTemplate.role_name,
        color_code: editingTemplate.color_code,
        created_by: user.id,
        status: 'active' as const,
        // Add required fields with defaults
        skip_holidays: true,
        auto_assign: false,
        auto_assign_delay_minutes: 15,
        recurrence_type: 'weekly'
      };

      if (editingTemplate.id) {
        const { error } = await (supabase
          .from('shift_templates') as any)
          .update(templateData)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast.success('Template updated successfully');
      } else {
        const { error } = await (supabase
          .from('shift_templates') as any)
          .insert(templateData);
        if (error) throw error;
        toast.success('Template created successfully');
      }

      setEditingTemplate(null);
      loadTemplates();
    } catch (error: any) {
      console.error('Error saving template:', error);
      toast.error(`Failed to save template: ${error.message || 'Unknown error'}`);
    }
  };

  const generateShifts = async (templateId: string) => {
    try {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // Generate for next month
      
      const { data, error } = await (supabase as any)
        .rpc('generate_shift_instances', {
          template_id_param: templateId,
          start_date_param: new Date().toISOString().split('T')[0],
          end_date_param: endDate.toISOString().split('T')[0]
        });

      if (error) throw error;
      toast.success(`Generated ${data} shift instances`);
    } catch (error: any) {
      console.error('Error generating shifts:', error);
      toast.error('Failed to generate shifts');
    }
  };

  const deleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('shift_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      toast.success('Template deleted');
      loadTemplates();
    } catch (error: any) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleDayToggle = (day: number, checked: boolean) => {
    if (!editingTemplate) return;
    
    const newDays = checked 
      ? [...(editingTemplate.days_of_week || []), day]
      : (editingTemplate.days_of_week || []).filter(d => d !== day);
    
    setEditingTemplate({ ...editingTemplate, days_of_week: newDays });
  };

  return (
    <div className="space-y-6">
      {/* Template Form */}
      {editingTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingTemplate.id ? 'Edit Template' : 'Create New Template'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={editingTemplate.name || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  placeholder="e.g., Early Shift, Supervisor Coverage"
                />
              </div>
              
              <div>
                <Label htmlFor="role">Role</Label>
                <Select
                  value={editingTemplate.role_name || ''}
                  onValueChange={(value) => setEditingTemplate({ ...editingTemplate, role_name: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Early">Early</SelectItem>
                    <SelectItem value="Supervisor">Supervisor</SelectItem>
                    <SelectItem value="Late">Late</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editingTemplate.description || ''}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="start_time">Start Time</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={editingTemplate.start_time || '09:00'}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, start_time: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="end_time">End Time</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={editingTemplate.end_time || '17:00'}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, end_time: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="headcount">Staff Needed</Label>
                <Input
                  id="headcount"
                  type="number"
                  min="1"
                  value={editingTemplate.headcount || 1}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, headcount: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label>Days of Week</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {DAYS_OF_WEEK.map((day) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={(editingTemplate.days_of_week || []).includes(day.value)}
                      onCheckedChange={(checked) => handleDayToggle(day.value, checked as boolean)}
                    />
                    <Label htmlFor={`day-${day.value}`} className="text-sm">
                      {day.label.slice(0, 3)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="effective_start">Start Date</Label>
                <Input
                  id="effective_start"
                  type="date"
                  value={editingTemplate.effective_start || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, effective_start: e.target.value })}
                />
              </div>
              
              <div>
                <Label htmlFor="effective_end">End Date (Optional)</Label>
                <Input
                  id="effective_end"
                  type="date"
                  value={editingTemplate.effective_end || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, effective_end: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Color</Label>
              <div className="flex gap-2 mt-2">
                {SHIFT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    className={`w-8 h-8 rounded-full border-2 ${
                      editingTemplate.color_code === color.value ? 'border-foreground' : 'border-muted'
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setEditingTemplate({ ...editingTemplate, color_code: color.value })}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveTemplate}>
                <Save className="w-4 h-4 mr-2" />
                Save Template
              </Button>
              <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Shift Templates</CardTitle>
            <Button onClick={() => setEditingTemplate({
              name: '',
              role_name: 'General',
              start_time: '09:00',
              end_time: '17:00',
              headcount: 1,
              days_of_week: [],
              effective_start: new Date().toISOString().split('T')[0],
              color_code: '#3b82f6'
            })}>
              <Plus className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No templates created yet. Create your first template to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((template) => (
                <div key={template.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: template.color_code }}
                        />
                        <h3 className="font-medium">{template.name}</h3>
                        <Badge variant="outline">{template.role_name}</Badge>
                        <Badge variant="secondary">
                          {template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        {template.description && <p>{template.description}</p>}
                        <p>
                          Days: {template.days_of_week.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label.slice(0, 3)).join(', ')} • 
                          Staff needed: {template.headcount}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateShifts(template.id)}
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        Generate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTemplate(template)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteTemplate(template.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}