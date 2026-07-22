import { useState } from "react";
import { VAPackageProposalDialog } from "./VAPackageProposalDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Search, 
  FileText, 
  Edit, 
  Eye, 
  Download, 
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Users,
  Calendar,
  PoundSterling,
  Trash2,
  Palette,
  MousePointer,
  BarChart3,
  MessageSquare,
  Zap,
  Globe,
  PenTool,
  Layout,
  Share2,
  Phone,
  Link
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatGBP } from "@/lib/currency";

type ContractStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'expired' | 'cancelled';
type ContractType = 'virtual_assistant' | 'call_handling' | 'receptionist' | 'admin_support' | 'custom';

interface Contract {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  type: ContractType;
  status: ContractStatus;
  value: number;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  signedAt?: Date;
  templateUsed: string;
}

interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  category: ContractType;
  fields: string[];
  isActive: boolean;
}

interface Proposal {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  content: ProposalBlock[];
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'declined';
  createdAt: Date;
  sentAt?: Date;
  viewedAt?: Date;
  signedAt?: Date;
  analytics: ProposalAnalytics;
  salesRoomUrl: string;
  totalValue: number;
}

interface ProposalBlock {
  id: string;
  type: 'text' | 'heading' | 'image' | 'video' | 'button' | 'form' | 'signature' | 'pricing';
  content: any;
  settings: any;
}

interface ProposalAnalytics {
  views: number;
  timeSpent: number;
  clicksOnCTA: number;
  downloadCount: number;
  engagementScore: number;
  lastViewed?: Date;
}

export function ContractsManagement() {
  const [contracts, setContracts] = useState<Contract[]>([
    {
      id: '1',
      title: 'Virtual Assistant Services Agreement',
      clientName: 'Tech Corp Ltd',
      clientEmail: 'john@techcorp.com',
      type: 'virtual_assistant',
      status: 'signed',
      value: 2400,
      startDate: new Date(2024, 1, 1),
      endDate: new Date(2024, 12, 31),
      createdAt: new Date(2024, 0, 15),
      signedAt: new Date(2024, 0, 20),
      templateUsed: 'Standard VA Agreement'
    },
    {
      id: '2',
      title: 'Call Handling Service Contract',
      clientName: 'Marketing Plus',
      clientEmail: 'sarah@marketing-plus.co.uk',
      type: 'call_handling',
      status: 'sent',
      value: 1800,
      startDate: new Date(2024, 1, 15),
      endDate: new Date(2025, 1, 15),
      createdAt: new Date(2024, 0, 10),
      templateUsed: 'Call Handling Standard'
    }
  ]);

  const [templates, setTemplates] = useState<ContractTemplate[]>([
    {
      id: '1',
      name: 'Standard VA Agreement',
      description: 'Comprehensive virtual assistant services agreement with standard terms',
      category: 'virtual_assistant',
      fields: ['client_name', 'service_description', 'hourly_rate', 'payment_terms', 'duration'],
      isActive: true
    },
    {
      id: '2',
      name: 'Call Handling Standard',
      description: 'Professional call handling and reception services contract',
      category: 'call_handling',
      fields: ['client_name', 'service_hours', 'monthly_fee', 'call_volume', 'additional_services'],
      isActive: true
    }
  ]);

  const [proposals, setProposals] = useState<Proposal[]>([
    {
      id: '1',
      title: 'Virtual Assistant Services Proposal',
      clientName: 'Tech Corp Ltd',
      clientEmail: 'john@techcorp.com',
      content: [],
      status: 'sent',
      createdAt: new Date(2024, 0, 15),
      sentAt: new Date(2024, 0, 16),
      viewedAt: new Date(2024, 0, 17),
      analytics: {
        views: 12,
        timeSpent: 850,
        clicksOnCTA: 3,
        downloadCount: 2,
        engagementScore: 85,
        lastViewed: new Date(2024, 0, 20)
      },
      salesRoomUrl: 'https://yourcrm.com/proposals/tech-corp-va-services',
      totalValue: 2400
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContractStatus | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [showProposalEditor, setShowProposalEditor] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [showProposalPreview, setShowProposalPreview] = useState(false);
  const [showContractPreview, setShowContractPreview] = useState(false);
  const [showVAProposal, setShowVAProposal] = useState(false);
  const [previewingContract, setPreviewingContract] = useState<Contract | null>(null);

  const getStatusColor = (status: ContractStatus) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'viewed': return 'bg-yellow-100 text-yellow-800';
      case 'signed': return 'bg-green-100 text-green-800';
      case 'expired': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: ContractStatus) => {
    switch (status) {
      case 'draft': return <Edit className="h-4 w-4" />;
      case 'sent': return <Send className="h-4 w-4" />;
      case 'viewed': return <Eye className="h-4 w-4" />;
      case 'signed': return <CheckCircle className="h-4 w-4" />;
      case 'expired': return <AlertTriangle className="h-4 w-4" />;
      case 'cancelled': return <Clock className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const filteredContracts = contracts.filter(contract => {
    const matchesSearch = 
      contract.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contract.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getContractStats = () => {
    return {
      total: contracts.length,
      signed: contracts.filter(c => c.status === 'signed').length,
      pending: contracts.filter(c => ['sent', 'viewed'].includes(c.status)).length,
      totalValue: contracts.filter(c => c.status === 'signed').reduce((sum, c) => sum + c.value, 0)
    };
  };

  const stats = getContractStats();

  const handleCreateContract = (formData: FormData) => {
    if (!selectedTemplate) {
      toast({
        title: "Template Required",
        description: "Please select a template to create a contract.",
        variant: "destructive",
      });
      return;
    }

    const template = templates.find(t => t.id === selectedTemplate);
    if (!template) return;

    const newContract: Contract = {
      id: Date.now().toString(),
      title: formData.get('title') as string || `${template.name} Contract`,
      clientName: formData.get('clientName') as string,
      clientEmail: formData.get('clientEmail') as string,
      type: template.category,
      status: 'draft',
      value: parseInt(formData.get('value') as string) || 0,
      startDate: new Date(formData.get('startDate') as string),
      endDate: new Date(formData.get('endDate') as string),
      createdAt: new Date(),
      templateUsed: template.name
    };

    setContracts(prev => [...prev, newContract]);
    toast({
      title: "Contract Created",
      description: "New contract has been created successfully.",
    });
    setShowCreateDialog(false);
    setSelectedTemplate('');
  };

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
  };

  const handleUpdateContract = (formData: FormData) => {
    if (!editingContract) return;

    const updatedContract: Contract = {
      ...editingContract,
      title: formData.get('title') as string,
      clientName: formData.get('clientName') as string,
      clientEmail: formData.get('clientEmail') as string,
      status: formData.get('status') as ContractStatus,
      value: parseInt(formData.get('value') as string) || 0,
      startDate: new Date(formData.get('startDate') as string),
      endDate: new Date(formData.get('endDate') as string),
    };

    setContracts(prev => prev.map(contract => 
      contract.id === editingContract.id ? updatedContract : contract
    ));
    
    toast({
      title: "Contract Updated",
      description: "Contract has been updated successfully.",
    });
    setEditingContract(null);
  };

  const handleDeleteContract = (contractId: string) => {
    setContracts(prev => prev.filter(contract => contract.id !== contractId));
    toast({
      title: "Contract Deleted",
      description: "Contract has been deleted successfully.",
    });
  };

  const handlePreviewContract = (contract: Contract) => {
    setPreviewingContract(contract);
    setShowContractPreview(true);
  };

  const handleCreateTemplate = () => {
    toast({
      title: "Template Created",
      description: "New contract template has been created successfully.",
    });
    setShowTemplateDialog(false);
  };

  return (
    <div className="space-y-6">
      {/* Contract Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Total Contracts</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">Signed</p>
                <p className="text-2xl font-bold">{stats.signed}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium">Pending</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <PoundSterling className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium">Contract Value</p>
                <p className="text-2xl font-bold">{formatGBP(stats.totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract Management */}
      <Tabs defaultValue="contracts" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Contract Management
                </CardTitle>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Create New Contract</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      handleCreateContract(formData);
                    }}>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="template">Contract Template</Label>
                          <Select value={selectedTemplate} onValueChange={setSelectedTemplate} required>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a template" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.filter(t => t.isActive).map(template => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="title">Contract Title</Label>
                          <Input id="title" name="title" placeholder="Enter contract title" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="clientName">Client Name</Label>
                          <Input id="clientName" name="clientName" placeholder="Enter client name" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="clientEmail">Client Email</Label>
                          <Input id="clientEmail" name="clientEmail" type="email" placeholder="client@company.com" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="startDate">Start Date</Label>
                            <Input id="startDate" name="startDate" type="date" required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="endDate">End Date</Label>
                            <Input id="endDate" name="endDate" type="date" required />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="value">Contract Value (£)</Label>
                          <Input id="value" name="value" type="number" placeholder="2400" required />
                        </div>
                        <Button type="submit" className="w-full">
                          Create Contract
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search contracts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value: ContractStatus | 'all') => setStatusFilter(value)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="viewed">Viewed</SelectItem>
                    <SelectItem value="signed">Signed</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Contracts Table */}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContracts.map((contract) => (
                      <TableRow key={contract.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{contract.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {contract.templateUsed}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{contract.clientName}</div>
                            <div className="text-sm text-muted-foreground">
                              {contract.clientEmail}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(contract.status)}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(contract.status)}
                              {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
                            </div>
                          </Badge>
                        </TableCell>
                        <TableCell>{formatGBP(contract.value)}</TableCell>
                        <TableCell>{contract.startDate.toLocaleDateString('en-GB')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handlePreviewContract(contract)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEditContract(contract)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDeleteContract(contract.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {contract.status === 'draft' && (
                              <Button variant="ghost" size="sm">
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Tabs defaultValue="interactive-proposals" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="interactive-proposals">Interactive Proposals</TabsTrigger>
              <TabsTrigger value="contract-templates">Contract Templates</TabsTrigger>
            </TabsList>

            {/* Interactive Proposals */}
            <TabsContent value="interactive-proposals" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Interactive Proposals
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => setShowProposalEditor(true)}
                      >
                        <PenTool className="h-4 w-4 mr-2" />
                        Create Proposal
                      </Button>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        New Template
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Proposal Analytics Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-blue-800">Total Proposals</p>
                            <p className="text-2xl font-bold text-blue-900">{proposals.length}</p>
                          </div>
                          <Eye className="h-8 w-8 text-blue-600" />
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-800">Signed</p>
                            <p className="text-2xl font-bold text-green-900">
                              {proposals.filter(p => p.status === 'signed').length}
                            </p>
                          </div>
                          <CheckCircle className="h-8 w-8 text-green-600" />
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-purple-800">Avg Engagement</p>
                            <p className="text-2xl font-bold text-purple-900">
                              {Math.round(proposals.reduce((acc, p) => acc + p.analytics.engagementScore, 0) / proposals.length)}%
                            </p>
                          </div>
                          <BarChart3 className="h-8 w-8 text-purple-600" />
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-orange-800">Total Value</p>
                            <p className="text-2xl font-bold text-orange-900">
                              {formatGBP(proposals.reduce((acc, p) => acc + p.totalValue, 0))}
                            </p>
                          </div>
                          <PoundSterling className="h-8 w-8 text-orange-600" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Active Proposals List */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Active Proposals</h3>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Proposal</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Engagement</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Sales Room</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {proposals.map((proposal) => (
                            <TableRow key={proposal.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{proposal.title}</div>
                                  <div className="text-sm text-muted-foreground">
                                    Created {proposal.createdAt.toLocaleDateString('en-GB')}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{proposal.clientName}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {proposal.clientEmail}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={
                                  proposal.status === 'signed' ? 'bg-green-100 text-green-800' :
                                  proposal.status === 'viewed' ? 'bg-blue-100 text-blue-800' :
                                  proposal.status === 'sent' ? 'bg-yellow-100 text-yellow-800' :
                                  proposal.status === 'declined' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }>
                                  {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium">{proposal.analytics.engagementScore}%</div>
                                  <div className="text-xs text-muted-foreground">
                                    {proposal.analytics.views} views
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{formatGBP(proposal.totalValue)}</TableCell>
                              <TableCell>
                                <a 
                                  href={proposal.salesRoomUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                                >
                                  <Globe className="h-3 w-3 mr-1" />
                                  Visit
                                </a>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                      setEditingProposal(proposal);
                                      setShowProposalEditor(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm">
                                    <BarChart3 className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm">
                                    <Share2 className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm">
                                    <MessageSquare className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Contract Templates */}
            <TabsContent value="contract-templates" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Contract Templates
                    </CardTitle>
                    <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Template
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle>Create New Template</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="templateName">Template Name</Label>
                            <Input id="templateName" placeholder="Enter template name" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="templateDescription">Description</Label>
                            <Textarea id="templateDescription" placeholder="Describe the template purpose..." />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="templateCategory">Category</Label>
                            <Select>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="virtual_assistant">Virtual Assistant</SelectItem>
                                <SelectItem value="call_handling">Call Handling</SelectItem>
                                <SelectItem value="receptionist">Receptionist</SelectItem>
                                <SelectItem value="admin_support">Admin Support</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={handleCreateTemplate} className="w-full">
                            Create Template
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templates.map((template) => (
                      <Card key={template.id} className="border-2 hover:border-primary/20 transition-colors">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <CardTitle>{template.name}</CardTitle>
                            <Badge variant={template.isActive ? 'default' : 'secondary'}>
                              {template.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize">
                                {template.category.replace('_', ' ')}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-sm font-medium mb-2">Fields:</p>
                              <div className="flex flex-wrap gap-1">
                                {template.fields.slice(0, 3).map((field, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {field.replace('_', ' ')}
                                  </Badge>
                                ))}
                                {template.fields.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{template.fields.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 pt-2">
                              {template.name === 'Standard VA Agreement' && (
                                <Button 
                                  size="sm" 
                                  className="w-full"
                                  onClick={() => setShowVAProposal(true)}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  Generate Proposal
                                </Button>
                              )}
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="flex-1">
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" className="flex-1">
                                  <Eye className="h-3 w-3 mr-1" />
                                  Preview
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Edit Contract Dialog */}
      <Dialog open={editingContract !== null} onOpenChange={() => setEditingContract(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Contract</DialogTitle>
          </DialogHeader>
          {editingContract && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleUpdateContract(formData);
            }}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Contract Title</Label>
                  <Input 
                    id="edit-title" 
                    name="title" 
                    defaultValue={editingContract.title}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-clientName">Client Name</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="edit-clientName" 
                      name="clientName" 
                      defaultValue={editingContract.clientName}
                      required 
                      className="flex-1"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        // Navigate to customers page - you can implement this based on your routing
                        toast({
                          title: "Navigate to Customers",
                          description: "This would navigate to the customers section to manage client details.",
                        });
                      }}
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-clientEmail">Client Email</Label>
                  <Input 
                    id="edit-clientEmail" 
                    name="clientEmail" 
                    type="email" 
                    defaultValue={editingContract.clientEmail}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select name="status" defaultValue={editingContract.status}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="viewed">Viewed</SelectItem>
                      <SelectItem value="signed">Signed</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-startDate">Start Date</Label>
                    <Input 
                      id="edit-startDate" 
                      name="startDate" 
                      type="date" 
                      defaultValue={editingContract.startDate.toISOString().split('T')[0]}
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-endDate">End Date</Label>
                    <Input 
                      id="edit-endDate" 
                      name="endDate" 
                      type="date" 
                      defaultValue={editingContract.endDate.toISOString().split('T')[0]}
                      required 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-value">Contract Value (£)</Label>
                  <Input 
                    id="edit-value" 
                    name="value" 
                    type="number" 
                    defaultValue={editingContract.value}
                    required 
                  />
                </div>
                <Button type="submit" className="w-full">
                  Update Contract
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Contract Preview Dialog */}
      <Dialog open={showContractPreview} onOpenChange={setShowContractPreview}>
        <DialogContent className="max-w-5xl h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Contract Preview
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 p-6 pt-4 overflow-y-auto">
            {previewingContract && (
              <div className="max-w-4xl mx-auto space-y-0 bg-white">
                {/* Top Navigation Tabs */}
                <div className="flex justify-center mb-8">
                  <div className="flex border-b">
                    <div className="px-8 py-3 text-center">
                      <span className="text-muted-foreground">Proposal</span>
                    </div>
                    <div className="px-8 py-3 text-center border-b-2 border-red-500">
                      <span className="font-semibold text-red-600">Contract</span>
                    </div>
                    <div className="px-8 py-3 text-center">
                      <span className="text-muted-foreground">Invoice</span>
                    </div>
                  </div>
                </div>

                {/* Header Section */}
                <div className="text-center mb-12">
                  <div className="mb-6">
                    <span className="text-red-500 text-lg font-light italic">Virtual</span>
                  </div>
                  <h1 className="text-4xl font-bold text-blue-900 mb-2">
                    Your Office is ready!
                  </h1>
                  <p className="text-gray-600 text-sm tracking-wider uppercase mb-8">
                    CONVENIENT AND HASSLE FREE
                  </p>
                  <p className="text-gray-700 font-medium">
                    UK-BASED VIRTUAL ASSISTANT AND CALL ANSWERING SERVICES
                  </p>
                </div>

                {/* Contract Title Section */}
                <div className="text-center mb-12">
                  <h2 className="text-3xl font-bold text-blue-900 mb-2">
                    Our <span className="text-red-600">Service Agreement</span>
                  </h2>
                </div>

                {/* Client Information Card */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-8 mb-8 border border-blue-200">
                  <h3 className="text-xl font-bold text-blue-900 mb-6 text-center">Client Information</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="text-center">
                      <p className="font-medium text-blue-800 mb-1">Client Name</p>
                      <p className="text-lg font-semibold text-blue-900">{previewingContract.clientName}</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-blue-800 mb-1">Email Address</p>
                      <p className="text-lg font-semibold text-blue-900">{previewingContract.clientEmail}</p>
                    </div>
                  </div>
                </div>

                {/* Our Services Section */}
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-blue-900 mb-8">
                    Our <span className="text-red-600">Selected Package</span>
                  </h3>
                </div>

                {/* Service Package Card */}
                <div className="max-w-md mx-auto mb-12">
                  <div className="bg-white border-2 border-blue-200 rounded-lg shadow-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 text-center">
                      <h4 className="text-xl font-bold mb-2">
                        {previewingContract.type.replace('_', ' ').toUpperCase()} PACKAGE
                      </h4>
                      <p className="text-blue-100 text-sm">Selected Service Plan</p>
                    </div>
                    
                    <div className="p-8 text-center">
                      {/* Service Details */}
                      <div className="mb-6">
                        <p className="text-sm text-gray-600 mb-2">Template Used:</p>
                        <p className="font-medium text-gray-800">{previewingContract.templateUsed}</p>
                      </div>
                      
                      <div className="mb-6">
                        <p className="text-sm text-gray-600 mb-2">Service Period:</p>
                        <p className="font-medium text-gray-800">
                          {previewingContract.startDate.toLocaleDateString('en-GB')} - {previewingContract.endDate.toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      
                      <div className="mb-6">
                        <p className="text-sm text-gray-600 mb-2">Contract Status:</p>
                        <Badge className={`${getStatusColor(previewingContract.status)} text-sm`}>
                          {previewingContract.status.charAt(0).toUpperCase() + previewingContract.status.slice(1)}
                        </Badge>
                      </div>

                      {/* Our service will cover you daily section */}
                      <div className="border-t pt-6 mb-6">
                        <p className="text-sm text-gray-700 mb-2">Our service will cover you daily.</p>
                        <p className="text-xs text-gray-600">Monday through Friday from 08h00 - 18h00</p>
                        <p className="text-xs text-gray-600">Saturday from 09h00 - 17h00</p>
                      </div>

                      {/* Price */}
                      <div className="text-center">
                        <div className="text-4xl font-bold text-blue-800 mb-4">
                          {formatGBP(previewingContract.value)}
                        </div>
                        <Button className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-8 py-2 rounded-md">
                          Selected
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* VA Team Logo Section */}
                <div className="text-center mb-12">
                  <div className="inline-flex items-center justify-center w-32 h-16 bg-gradient-to-r from-blue-600 via-blue-500 to-red-500 rounded-lg mb-4">
                    <span className="text-white font-bold text-lg">VA</span>
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-gray-800">The VA Team</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      MAKING THE VIRTUALLY IMPOSSIBLE, POSSIBLE... VIRTUALLY!
                    </p>
                  </div>
                </div>

                {/* Contract Terms Section */}
                <div className="bg-gray-50 rounded-lg p-8 mb-8">
                  <h3 className="text-xl font-semibold text-blue-900 mb-6 text-center">Contract Terms & Conditions</h3>
                  <div className="space-y-4 text-sm max-w-3xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-blue-800 mb-2">1. Service Delivery</h4>
                        <p className="text-gray-700">
                          Professional virtual assistant and call answering services as specified in the selected package, 
                          delivered with the highest standards of professionalism.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-blue-800 mb-2">2. Payment Terms</h4>
                        <p className="text-gray-700">
                          Payment is due within 30 days of invoice date. Monthly charges apply as per selected package. 
                          Additional services charged separately.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-blue-800 mb-2">3. Service Hours</h4>
                        <p className="text-gray-700">
                          Standard service hours: Monday-Friday 08:00-18:00, Saturday 09:00-17:00. 
                          Out-of-hours services available upon request.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-blue-800 mb-2">4. Contract Duration</h4>
                        <p className="text-gray-700">
                          This contract is effective from {previewingContract.startDate.toLocaleDateString('en-GB')} until {previewingContract.endDate.toLocaleDateString('en-GB')}. 
                          Renewal terms available upon expiry.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signature Section */}
                {previewingContract.status === 'signed' && previewingContract.signedAt ? (
                  <div className="bg-green-50 border-2 border-green-200 rounded-lg p-8 text-center">
                    <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-green-800 mb-2">Contract Signed Successfully</h3>
                    <p className="text-green-700">
                      Signed on: {previewingContract.signedAt.toLocaleDateString('en-GB')}
                    </p>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center">
                    <PenTool className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Awaiting Digital Signature</h3>
                    <p className="text-blue-700 text-sm">
                      Contract pending client signature
                    </p>
                  </div>
                )}

                {/* Footer */}
                <div className="text-center pt-8 border-t mt-8">
                  <p className="text-xs text-gray-500">
                    Contract ID: {previewingContract.id} | Generated: {previewingContract.createdAt.toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Interactive Proposal Editor */}
      <Dialog open={showProposalEditor} onOpenChange={setShowProposalEditor}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {editingProposal ? 'Edit Interactive Proposal' : 'Create Interactive Proposal'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Toolbox */}
            <div className="w-64 bg-muted/30 p-4 rounded-lg space-y-4 overflow-y-auto">
              <div>
                <h3 className="font-semibold mb-3">Content Blocks</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => console.log('Add heading')}
                  >
                    <Layout className="h-4 w-4 mr-2" />
                    Heading
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => console.log('Add text')}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Text Block
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => console.log('Add image')}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Image
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => console.log('Add video')}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Video
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Interactive Elements</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start bg-blue-50 border-blue-200 hover:bg-blue-100"
                    onClick={() => console.log('Add CTA button')}
                  >
                    <MousePointer className="h-4 w-4 mr-2" />
                    CTA Button
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start bg-green-50 border-green-200 hover:bg-green-100"
                    onClick={() => console.log('Add form')}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Contact Form
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start bg-purple-50 border-purple-200 hover:bg-purple-100"
                    onClick={() => console.log('Add signature')}
                  >
                    <PenTool className="h-4 w-4 mr-2" />
                    Signature Field
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start bg-orange-50 border-orange-200 hover:bg-orange-100"
                    onClick={() => console.log('Add pricing')}
                  >
                    <PoundSterling className="h-4 w-4 mr-2" />
                    Pricing Table
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Collaboration</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => console.log('Add comment')}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Add Comment
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => console.log('Track analytics')}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics
                  </Button>
                </div>
              </div>
            </div>

            {/* Editor Canvas */}
            <div className="flex-1 bg-white border rounded-lg p-6 overflow-y-auto">
              <div className="space-y-6">
                {/* Proposal Header */}
                <div className="space-y-4">
                  <Input 
                    placeholder="Proposal Title"
                    className="text-2xl font-bold border-none shadow-none p-0"
                    defaultValue={editingProposal?.title}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input 
                      placeholder="Client Name"
                      defaultValue={editingProposal?.clientName}
                    />
                    <Input 
                      type="email"
                      placeholder="Client Email"
                      defaultValue={editingProposal?.clientEmail}
                    />
                  </div>
                </div>

                {/* Sample Proposal Content */}
                <div className="space-y-6 border-t pt-6">
                  <div className="bg-gradient-to-r from-primary/10 to-purple-100 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-3">Executive Summary</h2>
                    <p className="text-muted-foreground">
                      Our comprehensive virtual assistant services will transform your business operations, 
                      allowing you to focus on growth while we handle the administrative details.
                    </p>
                  </div>

                  <div className="bg-muted/30 p-6 rounded-lg">
                    <h2 className="text-xl font-semibold mb-4">Our Services</h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-md">
                        <h3 className="font-medium">Call Handling</h3>
                        <p className="text-sm text-muted-foreground">Professional phone support</p>
                      </div>
                      <div className="bg-white p-4 rounded-md">
                        <h3 className="font-medium">Admin Support</h3>
                        <p className="text-sm text-muted-foreground">Complete administrative assistance</p>
                      </div>
                    </div>
                  </div>

                  {/* Interactive CTA Button Demo */}
                  <div className="bg-blue-50 border-2 border-dashed border-blue-200 p-6 rounded-lg text-center">
                    <Button className="bg-primary hover:bg-primary/90 text-white px-8 py-3">
                      <MousePointer className="h-4 w-4 mr-2" />
                      Accept This Proposal
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      Interactive button - clients can click to accept instantly
                    </p>
                  </div>

                  {/* Pricing Table Demo */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h2 className="text-xl font-semibold mb-4">Investment & Pricing</h2>
                    <div className="bg-white rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Virtual Assistant Services</TableCell>
                            <TableCell>12 months</TableCell>
                            <TableCell className="text-right font-medium">£2,400</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Setup Fee</TableCell>
                            <TableCell>One-time</TableCell>
                            <TableCell className="text-right font-medium">£200</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Digital Signature Demo */}
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h2 className="text-xl font-semibold mb-4">Digital Signature</h2>
                    <div className="bg-white border-2 border-dashed border-purple-200 p-8 rounded-md text-center">
                      <PenTool className="h-12 w-12 mx-auto mb-3 text-purple-600" />
                      <p className="text-muted-foreground mb-4">
                        Clients can sign digitally right in the proposal
                      </p>
                      <Button variant="outline" size="sm">
                        <PenTool className="h-4 w-4 mr-2" />
                        Click to Sign
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Properties Panel */}
            <div className="w-64 bg-muted/30 p-4 rounded-lg space-y-4 overflow-y-auto">
              <div>
                <h3 className="font-semibold mb-3">Proposal Settings</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Template Name</Label>
                    <Input placeholder="Save as template..." />
                  </div>
                  <div>
                    <Label className="text-xs">Brand Colors</Label>
                    <div className="flex gap-2 mt-1">
                      <div className="w-8 h-8 bg-primary rounded-md border cursor-pointer"></div>
                      <div className="w-8 h-8 bg-secondary rounded-md border cursor-pointer"></div>
                      <div className="w-8 h-8 bg-accent rounded-md border cursor-pointer"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Analytics Preview</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Views:</span>
                    <span className="font-medium">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Engagement:</span>
                    <span className="font-medium">0%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CTA Clicks:</span>
                    <span className="font-medium">0</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Actions</h3>
                <div className="space-y-2">
                  <Button size="sm" className="w-full" onClick={() => setShowProposalPreview(true)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  <Button size="sm" variant="outline" className="w-full">
                    <Share2 className="h-4 w-4 mr-2" />
                    Generate Link
                  </Button>
                  <Button size="sm" variant="outline" className="w-full">
                    <Send className="h-4 w-4 mr-2" />
                    Send to Client
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowProposalEditor(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              toast({
                title: "Proposal Saved",
                description: "Your interactive proposal has been saved successfully.",
              });
              setShowProposalEditor(false);
              setEditingProposal(null);
            }}>
              Save Proposal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Proposal Preview Dialog */}
      <Dialog open={showProposalPreview} onOpenChange={setShowProposalPreview}>
        <DialogContent className="max-w-4xl h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Proposal Preview - Client View
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 p-6 pt-4 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-8">
              {/* Client Header */}
              <div className="text-center border-b pb-8">
                <h1 className="text-3xl font-bold mb-4">Virtual Assistant Services Proposal</h1>
                <div className="text-muted-foreground">
                  <p>Prepared for: <span className="font-medium">Tech Corp Ltd</span></p>
                  <p>Date: {new Date().toLocaleDateString('en-GB')}</p>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="bg-gradient-to-r from-primary/10 to-purple-100 p-8 rounded-lg">
                <h2 className="text-2xl font-semibold mb-4">Executive Summary</h2>
                <p className="text-lg leading-relaxed">
                  Our comprehensive virtual assistant services will transform your business operations, 
                  allowing you to focus on growth while we handle the administrative details. With our 
                  proven track record and dedicated support, you'll experience increased productivity 
                  and reduced operational costs.
                </p>
              </div>

              {/* Services Overview */}
              <div>
                <h2 className="text-2xl font-semibold mb-6">Our Services</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white border rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Phone className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Call Handling</h3>
                        <p className="text-sm text-muted-foreground">Professional phone support</p>
                      </div>
                    </div>
                    <p className="text-sm">
                      24/7 professional call answering service with message taking, 
                      appointment scheduling, and customer support.
                    </p>
                  </div>
                  
                  <div className="bg-white border rounded-lg p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Users className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Admin Support</h3>
                        <p className="text-sm text-muted-foreground">Complete administrative assistance</p>
                      </div>
                    </div>
                    <p className="text-sm">
                      Email management, calendar coordination, data entry, 
                      and general administrative tasks to streamline your operations.
                    </p>
                  </div>
                </div>
              </div>

              {/* Interactive CTA */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 p-8 rounded-lg text-center">
                <h3 className="text-xl font-semibold mb-4">Ready to Get Started?</h3>
                <p className="text-muted-foreground mb-6">
                  Click below to accept this proposal and begin your journey to improved productivity.
                </p>
                <Button size="lg" className="bg-primary hover:bg-primary/90 text-white px-12 py-4 text-lg">
                  <MousePointer className="h-5 w-5 mr-3" />
                  Accept This Proposal
                </Button>
              </div>

              {/* Pricing Table */}
              <div>
                <h2 className="text-2xl font-semibold mb-6">Investment & Pricing</h2>
                <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Service</TableHead>
                        <TableHead className="font-semibold">Duration</TableHead>
                        <TableHead className="font-semibold text-right">Investment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Virtual Assistant Services</TableCell>
                        <TableCell>12 months</TableCell>
                        <TableCell className="text-right font-semibold text-lg">£2,400</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Setup & Onboarding</TableCell>
                        <TableCell>One-time</TableCell>
                        <TableCell className="text-right font-semibold text-lg">£200</TableCell>
                      </TableRow>
                      <TableRow className="bg-muted/30">
                        <TableCell className="font-bold">Total Investment</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right font-bold text-xl text-primary">£2,600</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Digital Signature Section */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-8">
                <h2 className="text-2xl font-semibold mb-4">Digital Signature</h2>
                <p className="text-muted-foreground mb-6">
                  By signing below, you agree to the terms and conditions outlined in this proposal.
                </p>
                <div className="bg-white border-2 border-dashed border-purple-300 p-8 rounded-lg text-center">
                  <PenTool className="h-16 w-16 mx-auto mb-4 text-purple-600" />
                  <p className="text-lg font-medium mb-4">Click to Add Your Digital Signature</p>
                  <Button size="lg" variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
                    <PenTool className="h-5 w-5 mr-3" />
                    Sign Proposal
                  </Button>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center pt-8 border-t">
                <p className="text-sm text-muted-foreground">
                  This proposal is valid for 30 days from the date above.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Questions? Contact us at proposals@yourcrm.com
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* VA Package Proposal Dialog */}
      <VAPackageProposalDialog open={showVAProposal} onOpenChange={setShowVAProposal} />
    </div>
  );
}
