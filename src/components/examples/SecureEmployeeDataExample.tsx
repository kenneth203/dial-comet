import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, User, Users, AlertTriangle } from 'lucide-react';
import { useSecureEmployeeData, type SensitiveEmployeeData, type BasicEmployeeInfo } from '@/hooks/useSecureEmployeeData';

/**
 * Example component demonstrating secure employee data access patterns
 * This shows the correct way to access different levels of employee data:
 * 1. Safe profile data (for current user)
 * 2. Sensitive employee data (HR/Admin only with justification)
 * 3. Basic employee lists (HR/Admin only for dropdowns)
 */
export function SecureEmployeeDataExample() {
  const {
    isLoading,
    myProfile,
    loadMyProfile,
    updateMyProfile,
    getEmployeeSensitiveData,
    getBasicEmployeeList,
    checkHRAccess
  } = useSecureEmployeeData();

  const [accessReason, setAccessReason] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [sensitiveData, setSensitiveData] = useState<SensitiveEmployeeData | null>(null);
  const [employeeList, setEmployeeList] = useState<BasicEmployeeInfo[]>([]);
  const [hasHRAccess, setHasHRAccess] = useState<boolean | null>(null);
  const [profileUpdates, setProfileUpdates] = useState({
    phone_number: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: ''
  });

  // Check if current user has HR access
  const handleCheckHRAccess = async () => {
    const hasAccess = await checkHRAccess();
    setHasHRAccess(hasAccess);
  };

  // Load employee list (HR/Admin only)
  const handleLoadEmployeeList = async () => {
    const employees = await getBasicEmployeeList();
    setEmployeeList(employees);
  };

  // Access sensitive employee data (HR/Admin only)
  const handleAccessSensitiveData = async () => {
    if (!selectedEmployeeId || !accessReason) return;
    
    const data = await getEmployeeSensitiveData(selectedEmployeeId, accessReason);
    setSensitiveData(data);
  };

  // Update current user's profile
  const handleUpdateProfile = async () => {
    const updates = Object.fromEntries(
      Object.entries(profileUpdates).filter(([_, value]) => value.trim() !== '')
    );
    
    if (Object.keys(updates).length === 0) return;
    
    await updateMyProfile(updates);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <Shield className="mx-auto h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Secure Employee Data Access Example</h1>
        <p className="text-muted-foreground">
          Demonstrates proper security patterns for employee data access
        </p>
      </div>

      {/* Current User's Safe Profile Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            My Safe Profile Data (Always Accessible)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {myProfile ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <p className="text-sm font-medium">{myProfile.name}</p>
              </div>
              <div>
                <Label>Email</Label>
                <p className="text-sm">{myProfile.email}</p>
              </div>
              <div>
                <Label>Role</Label>
                <Badge variant="secondary">{myProfile.role}</Badge>
              </div>
              <div>
                <Label>Department</Label>
                <p className="text-sm">{myProfile.department || 'Not specified'}</p>
              </div>
              <div>
                <Label>Status</Label>
                <Badge variant={myProfile.status === 'Active' ? 'default' : 'destructive'}>
                  {myProfile.status}
                </Badge>
              </div>
              <div>
                <Label>Phone</Label>
                <p className="text-sm">{myProfile.phone_number || 'Not provided'}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No profile data available</p>
          )}
          
          <Button onClick={loadMyProfile} disabled={isLoading} variant="outline">
            Reload My Profile
          </Button>
        </CardContent>
      </Card>

      {/* Update Profile (Safe Fields Only) */}
      <Card>
        <CardHeader>
          <CardTitle>Update My Profile (Safe Fields Only)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Users can only update basic, non-sensitive information about themselves.
              Sensitive data like salary, address, DOB requires HR access.
            </AlertDescription>
          </Alert>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                value={profileUpdates.phone_number}
                onChange={(e) => setProfileUpdates(prev => ({
                  ...prev,
                  phone_number: e.target.value
                }))}
                placeholder="Enter phone number"
              />
            </div>
            <div>
              <Label htmlFor="emergency-name">Emergency Contact Name</Label>
              <Input
                id="emergency-name"
                value={profileUpdates.emergency_contact_name}
                onChange={(e) => setProfileUpdates(prev => ({
                  ...prev,
                  emergency_contact_name: e.target.value
                }))}
                placeholder="Emergency contact name"
              />
            </div>
            <div>
              <Label htmlFor="emergency-phone">Emergency Contact Phone</Label>
              <Input
                id="emergency-phone"
                value={profileUpdates.emergency_contact_phone}
                onChange={(e) => setProfileUpdates(prev => ({
                  ...prev,
                  emergency_contact_phone: e.target.value
                }))}
                placeholder="Emergency contact phone"
              />
            </div>
            <div>
              <Label htmlFor="emergency-relationship">Emergency Contact Relationship</Label>
              <Input
                id="emergency-relationship"
                value={profileUpdates.emergency_contact_relationship}
                onChange={(e) => setProfileUpdates(prev => ({
                  ...prev,
                  emergency_contact_relationship: e.target.value
                }))}
                placeholder="Relationship (e.g., Spouse, Parent)"
              />
            </div>
          </div>
          
          <Button onClick={handleUpdateProfile} disabled={isLoading}>
            Update My Profile
          </Button>
        </CardContent>
      </Card>

      {/* HR Access Check */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            HR/Admin Access Check
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleCheckHRAccess} disabled={isLoading} variant="outline">
              Check HR Access
            </Button>
            {hasHRAccess !== null && (
              <Badge variant={hasHRAccess ? 'default' : 'destructive'}>
                {hasHRAccess ? 'HR Access Granted' : 'No HR Access'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Basic Employee List (HR/Admin Only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Basic Employee List (HR/Admin Only)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This function is restricted to HR/Admin roles. It returns only basic, 
              non-sensitive information for dropdown lists and employee selection.
            </AlertDescription>
          </Alert>
          
          <Button onClick={handleLoadEmployeeList} disabled={isLoading} variant="outline">
            Load Employee List
          </Button>
          
          {employeeList.length > 0 && (
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Employee List ({employeeList.length} employees)</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {employeeList.map((emp) => (
                  <div key={emp.id} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span>{emp.name} ({emp.email})</span>
                    <Badge variant="outline">{emp.role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sensitive Data Access (HR/Admin Only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Sensitive Employee Data Access (HR/Admin Only)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Access to sensitive employee data requires HR/Admin role, detailed justification,
              and creates permanent audit logs. This includes: DOB, addresses, salary info, etc.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="employee-select">Select Employee</Label>
              <select
                id="employee-select"
                className="w-full p-2 border rounded"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
              >
                <option value="">Select an employee...</option>
                {employeeList.map((emp) => (
                  <option key={emp.auth_user_id} value={emp.auth_user_id}>
                    {emp.name} - {emp.role}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <Label htmlFor="access-reason">Access Reason (Required - Min 20 characters)</Label>
              <Textarea
                id="access-reason"
                value={accessReason}
                onChange={(e) => setAccessReason(e.target.value)}
                placeholder="Provide detailed justification for accessing sensitive employee data (minimum 20 characters). This will be logged for audit purposes."
                rows={3}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Characters: {accessReason.length}/20 minimum
              </p>
            </div>
            
            <Button 
              onClick={handleAccessSensitiveData} 
              disabled={isLoading || !selectedEmployeeId || accessReason.length < 20}
              variant="destructive"
            >
              Access Sensitive Data (Audit Logged)
            </Button>
          </div>
          
          {sensitiveData && (
            <div className="border-2 border-destructive rounded-lg p-4 bg-destructive/5">
              <h4 className="font-medium mb-2 text-destructive">
                Sensitive Data - Access Level: {sensitiveData.access_level}
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><strong>Name:</strong> {sensitiveData.name}</div>
                <div><strong>Email:</strong> {sensitiveData.email}</div>
                <div><strong>DOB:</strong> {sensitiveData.date_of_birth || 'Not available'}</div>
                <div><strong>Phone:</strong> {sensitiveData.phone_number || 'Not available'}</div>
                <div><strong>Address:</strong> {sensitiveData.address_line1 || 'Not available'}</div>
                <div><strong>City:</strong> {sensitiveData.city || 'Not available'}</div>
                <div><strong>Emergency Contact:</strong> {sensitiveData.emergency_contact_name || 'Not available'}</div>
                <div><strong>Emergency Phone:</strong> {sensitiveData.emergency_contact_phone || 'Not available'}</div>
              </div>
              <Alert className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This access has been logged for audit purposes. Misuse of sensitive data is a security violation.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}