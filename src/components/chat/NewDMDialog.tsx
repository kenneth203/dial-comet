import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { formatDisplayName, getNameInitials } from '@/lib/nameUtils';

interface DMCandidate {
  user_id: string;
  name: string;
  email?: string;
  can_message?: boolean;
}

interface NewDMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDM: (userId: string) => void;
}

export function NewDMDialog({ open, onOpenChange, onCreateDM }: NewDMDialogProps) {
  const { user: currentUser } = useAuth();
  const [candidates, setCandidates] = useState<DMCandidate[]>([]);
  const [filteredCandidates, setFilteredCandidates] = useState<DMCandidate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Load all DM candidates (both messageable and non-messageable)
  const loadCandidates = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_dm_candidates');

      if (error) throw error;

      const mapped = (data || []).map((d: any) => ({ user_id: d.id, name: d.name, email: '', can_message: true }));
      setCandidates(mapped);
      setFilteredCandidates(mapped);
    } catch (error) {
      console.error('Error loading DM candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter candidates based on search query
  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = candidates.filter(candidate =>
        candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCandidates(filtered);
    } else {
      setFilteredCandidates(candidates);
    }
  }, [searchQuery, candidates]);

  // Load candidates when dialog opens
  useEffect(() => {
    if (open) {
      loadCandidates();
      setSearchQuery('');
    }
  }, [open]);

  const handleSelectUser = (userId: string) => {
    onCreateDM(userId);
  };

  // Split candidates into messageable and non-messageable
  const messageableUsers = filteredCandidates.filter(c => c.can_message);
  const nonMessageableUsers = filteredCandidates.filter(c => !c.can_message);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Direct Message</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Users List */}
          <div className="max-h-80">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="h-80">
                <div className="space-y-4">
                  {/* People you can message */}
                  {messageableUsers.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">
                        People you can message
                      </h3>
                      <div className="space-y-1">
                        {messageableUsers.map(candidate => (
                          <Button
                            key={candidate.user_id}
                            variant="ghost"
                            className="w-full justify-start h-auto p-3"
                            onClick={() => handleSelectUser(candidate.user_id)}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {getNameInitials(candidate.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="text-left">
                                <div className="font-medium text-sm">
                                  {formatDisplayName(candidate.name)}
                                </div>
                                {candidate.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {candidate.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Staff not yet on chat */}
                  {nonMessageableUsers.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">
                        Staff not yet on chat
                      </h3>
                      <div className="space-y-1">
                        {nonMessageableUsers.map(candidate => (
                          <div
                            key={candidate.user_id || candidate.name}
                            className="flex items-center justify-between p-3 rounded-lg border border-dashed border-muted"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs bg-muted">
                                  {getNameInitials(candidate.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="text-left">
                                <div className="font-medium text-sm text-muted-foreground">
                                  {formatDisplayName(candidate.name)}
                                </div>
                                {candidate.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {candidate.email}
                                  </div>
                                )}
                              </div>
                            </div>
                            <Button variant="outline" size="sm" disabled>
                              <Mail className="h-3 w-3 mr-1" />
                              Invite
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No results */}
                  {messageableUsers.length === 0 && nonMessageableUsers.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">
                        {searchQuery ? 'No users found' : 'No users available'}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}