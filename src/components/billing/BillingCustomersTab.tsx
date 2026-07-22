import { useState, useEffect } from "react";
import { useCustomers } from "@/context/CustomersContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";


export function BillingCustomersTab() {
  const { customers, loading } = useCustomers();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.tel.includes(searchTerm) ||
    customer.mobile.includes(searchTerm) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.businessType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewCustomer = (customerId: string) => {
    navigate(`/config/customers?customer=${customerId}`);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle>Customer Directory</CardTitle>
              <CardDescription>View customers from the main customer directory</CardDescription>
            </div>
            <Button onClick={() => navigate('/config/customers')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Manage Customers
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:max-w-sm"
            />
          </div>

          <div className="overflow-x-auto -mx-6 sm:mx-0"><div className="min-w-[640px] px-6 sm:px-0 sm:min-w-0"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Business Type</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Packages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-sm text-muted-foreground">{customer.businessType}</p>
                    </div>
                  </TableCell>
                  <TableCell>{customer.businessType || '-'}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {customer.tel && <p>Tel: {customer.tel}</p>}
                      {customer.mobile && <p>Mobile: {customer.mobile}</p>}
                      {customer.email && <p>{customer.email}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {customer.vaPackage && <p>VA: {customer.vaPackage}</p>}
                      {customer.vrPackage && <p>VR: {customer.vrPackage}</p>}
                      {customer.aiPackage && <p>AI: {customer.aiPackage}</p>}
                      {customer.dtPackage && <p>DT: {customer.dtPackage}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.status === 'Active' ? "default" : "secondary"}>
                      {customer.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewCustomer(customer.id)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {searchTerm ? 'No customers found matching your search.' : 'No customers found.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table></div></div>
        </CardContent>
      </Card>
    </div>
  );
}