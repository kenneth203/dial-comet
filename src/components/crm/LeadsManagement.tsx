import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Plus, Search, Filter, Edit, Trash2, 
  TrendingUp, AlertCircle, CheckCircle, Clock, ArrowRight,
  Globe, Users, Mail as MailIcon, Phone, CalendarDays, Handshake, HelpCircle, Search as SearchIcon, Megaphone
} from "lucide-react";
import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube, FaTiktok, FaWhatsapp, FaGoogle } from "react-icons/fa6";

import { toast } from "@/hooks/use-toast";
import { useCustomers, type Customer } from "@/context/CustomersContext";
import { CustomerDetailsForm } from "@/components/customers/CustomerDetailsForm";
import { ImportLeadFromEmailDialog } from "@/components/crm/ImportLeadFromEmailDialog";
import { SendProposalDialog } from "@/components/crm/SendProposalDialog";
import { SendQuestionnaireDialog } from "@/components/crm/SendQuestionnaireDialog";
import { SendIntroductionDialog } from "@/components/crm/SendIntroductionDialog";
import { Mail, Send, FileText, MailPlus } from "lucide-react";
import { formatGBP } from "@/lib/currency";
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";

type LeadPipelineStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
type LeadSource = 'website' | 'referral' | 'social_media' | 'email_campaign' | 'cold_call' | 'event' | 'networking_bni' | 'networking_fsb' | 'networking_other';

export function LeadsManagement() {
  const { leads, addCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const { isSuperAdmin, isSupervisor } = usePermissions();
  const canConvertLeads = isSuperAdmin || isSupervisor;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadPipelineStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingLead, setEditingLead] = useState<Customer | null>(null);
  const [sendingProposalLead, setSendingProposalLead] = useState<Customer | null>(null);
  const [sendingQuestionnaireLead, setSendingQuestionnaireLead] = useState<Customer | null>(null);
  const [sendingIntroLead, setSendingIntroLead] = useState<Customer | null>(null);

  const getMetadata = (lead: Customer) => lead.leadMetadata || {};

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'contacted': return 'bg-yellow-100 text-yellow-800';
      case 'qualified': return 'bg-purple-100 text-purple-800';
      case 'proposal': return 'bg-orange-100 text-orange-800';
      case 'negotiation': return 'bg-cyan-100 text-cyan-800';
      case 'won': return 'bg-green-100 text-green-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSourceIcon = (source: string, label?: string) => {
    const text = `${source || ''} ${label || ''}`.toLowerCase();
    // Brand-specific matches (check label first)
    if (/facebook|fb\b/.test(text)) return <FaFacebook className="h-4 w-4 text-[#1877F2]" />;
    if (/instagram|insta\b/.test(text)) return <FaInstagram className="h-4 w-4 text-[#E4405F]" />;
    if (/linkedin/.test(text)) return <FaLinkedin className="h-4 w-4 text-[#0A66C2]" />;
    if (/tiktok/.test(text)) return <FaTiktok className="h-4 w-4 text-foreground" />;
    if (/youtube/.test(text)) return <FaYoutube className="h-4 w-4 text-[#FF0000]" />;
    if (/whatsapp/.test(text)) return <FaWhatsapp className="h-4 w-4 text-[#25D366]" />;
    if (/twitter|\bx\b/.test(text)) return <FaXTwitter className="h-4 w-4 text-foreground" />;
    if (/goo?gle?/.test(text)) return <FaGoogle className="h-4 w-4 text-[#4285F4]" />;
    if (/bni/.test(text)) return <Handshake className="h-4 w-4 text-[#C8102E]" />;
    if (/fsb/.test(text)) return <Handshake className="h-4 w-4 text-[#003D7A]" />;
    if (/network/.test(text)) return <Handshake className="h-4 w-4 text-primary" />;
    // Generic source fallbacks
    switch (source) {
      case 'website': return <Globe className="h-4 w-4 text-primary" />;
      case 'referral': return <Users className="h-4 w-4 text-primary" />;
      case 'social_media': return <Megaphone className="h-4 w-4 text-primary" />;
      case 'email_campaign': return <MailIcon className="h-4 w-4 text-primary" />;
      case 'cold_call': return <Phone className="h-4 w-4 text-primary" />;
      case 'event': return <CalendarDays className="h-4 w-4 text-primary" />;
      case 'networking_bni': case 'networking_fsb': case 'networking_other':
        return <Handshake className="h-4 w-4 text-primary" />;
      default: return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };


  const filteredLeads = leads.filter(lead => {
    const meta = getMetadata(lead);
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.contact || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || meta.pipelineStatus === statusFilter;
    const matchesSource = sourceFilter === 'all' || meta.source === sourceFilter;
    
    return matchesSearch && matchesStatus && matchesSource;
  });

  const handleAddLead = async (customerData: Omit<Customer, 'id'>) => {
    await addCustomer({
      ...customerData,
      status: 'Lead',
      leadMetadata: customerData.leadMetadata || {
        source: 'website',
        pipelineStatus: 'new',
        value: 0,
        notes: '',
        lastContact: null,
      },
    });
    toast({ title: "Lead Added", description: "New lead has been added to the directory." });
    setShowAddDialog(false);
    return true;
  };

  const handleUpdateLead = async (customerData: Omit<Customer, 'id'>) => {
    if (!editingLead) return;
    const success = await updateCustomer(editingLead.id, customerData);
    if (success) {
      toast({ title: "Lead Updated" });
      setEditingLead(null);
    }
    return success;
  };

  const handleDeleteLead = async (id: string) => {
    await deleteCustomer(id);
    toast({ title: "Lead Deleted" });
  };

  const handleConvertToCustomer = async (lead: Customer) => {
    await updateCustomer(lead.id, {
      status: 'Active',
      leadMetadata: { ...getMetadata(lead), pipelineStatus: 'won' },
    });
    toast({ title: "Lead Converted", description: `${lead.name} is now an active customer.` });
  };

  const getStatusStats = () => {
    return leads.reduce((acc, lead) => {
      const status = getMetadata(lead).pipelineStatus || 'new';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  };

  const statusStats = getStatusStats();


  return (
    <div className="space-y-6">
      {/* Lead Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">New Leads</p>
                <p className="text-2xl font-bold">{statusStats.new || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium">In Progress</p>
                <p className="text-2xl font-bold">
                  {(statusStats.contacted || 0) + (statusStats.qualified || 0) + (statusStats.proposal || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Won</p>
                <p className="text-2xl font-bold">{statusStats.won || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium">Total Value</p>
                <p className="text-2xl font-bold">
                  {formatGBP(leads.reduce((sum, lead) => sum + (getMetadata(lead).value || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lead Management Tools */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Lead Management
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {canConvertLeads && (
                <Button variant="outline" asChild>
                  <Link to="/crm/convert-leads">
                    <ArrowRight className="h-4 w-4 mr-2" />Convert Leads
                  </Link>
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Mail className="h-4 w-4 mr-2" />Import from Email
              </Button>
              <Button onClick={() => setShowAddDialog(true)}><Plus className="h-4 w-4 mr-2" />Add Lead</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-2" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="proposal">Proposal</SelectItem>
                <SelectItem value="negotiation">Negotiation</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="social_media">Social Media</SelectItem>
                <SelectItem value="email_campaign">Email Campaign</SelectItem>
                <SelectItem value="cold_call">Cold Call</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="networking_bni">Networking (BNI)</SelectItem>
                <SelectItem value="networking_fsb">Networking (FSB)</SelectItem>
                <SelectItem value="networking_other">Networking (Other)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Leads Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Last Contact</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No leads found. Click "Add Lead" to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads.map((lead) => {
                    const meta = getMetadata(lead);
                    return (
                      <TableRow key={lead.id}>
                        <TableCell>
                          {(() => {
                            const primary = (lead.contacts || []).find(c => !c.hidden);
                            const personName = primary
                              ? `${primary.firstName || ''} ${primary.surname || ''}`.trim()
                              : (lead.contact || '').trim();
                            const personEmail = primary?.email || lead.email || '';
                            return (
                              <div>
                                <div className="font-medium">{personName || '—'}</div>
                                <div className="text-sm text-muted-foreground">{personEmail}</div>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>{lead.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center">{getSourceIcon(meta.source || '', meta.heardAboutUs)}</span>
                            <div>
                              <span className="capitalize">{meta.heardAboutUs || (meta.source || '').replace('_', ' ') || '—'}</span>
                              {meta.enquiryYear && (
                                <span className="text-xs text-muted-foreground ml-1">({meta.enquiryYear})</span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(meta.pipelineStatus || 'new')}>
                            {(meta.pipelineStatus || 'new').replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatGBP((meta.value || 0))}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {meta.lastContact ? new Date(meta.lastContact).toLocaleDateString('en-GB') : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSendingIntroLead(lead)}
                              title="Send introduction email"
                            >
                              <MailPlus className="h-4 w-4 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSendingProposalLead(lead)}
                              title="Email proposal to customer"
                            >
                              <Send className="h-4 w-4 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSendingQuestionnaireLead(lead)}
                              title="Email questionnaire to customer"
                            >
                              <FileText className="h-4 w-4 text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingLead(lead)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleConvertToCustomer(lead)} title="Convert to Customer">
                              <ArrowRight className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteLead(lead.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ImportLeadFromEmailDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
      />

      <SendProposalDialog
        lead={sendingProposalLead}
        isOpen={!!sendingProposalLead}
        onClose={() => setSendingProposalLead(null)}
      />

      <SendQuestionnaireDialog
        lead={sendingQuestionnaireLead}
        isOpen={!!sendingQuestionnaireLead}
        onClose={() => setSendingQuestionnaireLead(null)}
      />

      <SendIntroductionDialog
        lead={sendingIntroLead}
        isOpen={!!sendingIntroLead}
        onClose={() => setSendingIntroLead(null)}
      />




      {/* Add Lead Form */}
      <CustomerDetailsForm
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSubmit={handleAddLead}
        title="Add New Lead"
        visibleTabs={['details', 'billing', 'contacts', 'forms']}
        defaultStatus="Lead"
      />

      {/* Edit Lead Form */}
      <CustomerDetailsForm
        isOpen={!!editingLead}
        onClose={() => setEditingLead(null)}
        onSubmit={handleUpdateLead}
        initialData={editingLead || undefined}
        title="Edit Lead"
        visibleTabs={['details', 'billing', 'contacts', 'forms']}
        defaultStatus="Lead"
      />
    </div>
  );
}
