import { useState, useEffect } from "react";
import { secureLog } from "@/lib/secureLogger";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { User, Mail, Phone, MapPin, Building, Shield, Briefcase, FileText, Clock, Calculator, Calendar, CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUsers } from "@/context/UsersContext";

const userFormSchema = z.object({
  // Personal Details
  surname: z.string().min(2, "Surname must be at least 2 characters"),
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  dateOfBirth: z.string().optional(),
  currentAddress: z.string().optional(),
  currentPostCode: z.string().optional(),
  permanentAddress: z.string().optional(),
  permanentPostCode: z.string().optional(),
  homePhone: z.string().optional(),
  mobilePhone: z.string().optional(),
  nationalInsurance: z.string().optional(),
  email: z.string().email("Valid email is required"),
  
  // Monitoring Information
  gender: z.string().optional(),
  ethnicity: z.string().optional(),
  nationality: z.string().optional(),
  disability: z.string().optional(),
  disabilityCategory: z.string().optional(),
  maritalStatus: z.string().optional(),

  // Emergency Contact
  emergencyName: z.string().optional(),
  emergencyRelationship: z.string().optional(),
  emergencyAddress: z.string().optional(),
  emergencyPhone: z.string().optional(),

  // Bank Details
  bankName: z.string().optional(),
  bankAddress: z.string().optional(),
  accountNumber: z.string().optional(),
  sortCode: z.string().optional(),

  // Employment Details
  jobTitle: z.string().min(1, "Job title is required"),
  department: z.string().min(1, "Department is required"),
  startDate: z.string().optional(),
  status: z.enum(["Active", "On Leave", "Inactive"]),
  role: z.string().min(1, "Role is required"),

  // Holiday Entitlements
  annualLeaveDays: z.number().optional(),
  sickLeaveDays: z.number().optional(),
  personalDays: z.number().optional(),
  publicHolidays: z.number().optional(),
  christmasClosureDays: z.number().optional(),
  carriedOverDays: z.number().optional(),
  
  // System User Options - conditional for new users only
  userPassword: z.string().optional(),
});

type UserFormData = z.infer<typeof userFormSchema>;

const ethnicityOptions = [
  "White - British", "White - English", "White - Scottish", "White - Welsh", "White - Irish",
  "White - Other", "Mixed - White and Black Caribbean", "Mixed - White and Black African",
  "Mixed - White and Asian", "Mixed - Other", "Black - Caribbean", "Black - African",
  "Black - Other", "Asian - Indian", "Asian - Pakistani", "Asian - Bangladeshi",
  "Asian - Chinese", "Asian - Other", "Other Ethnic background"
];

const disabilityCategories = [
  "Dyslexia", "Deaf/hearing impairment", "Requires personal support",
  "Unseen Disability (e.g. diabetes and epilepsy)", "Blind/partially sighted",
  "Wheelchair user/other mobility difficulties", "Mental health disability",
  "Multiple disabilities", "Other disability", "Do not wish to disclose information"
];

interface SystemUser {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  // Personal details
  title?: string;
  date_of_birth?: string;
  current_address?: string;
  current_post_code?: string;
  permanent_address?: string;
  permanent_post_code?: string;
  home_phone?: string;
  mobile_phone?: string;
  national_insurance?: string;
  // Monitoring information
  gender?: string;
  ethnicity?: string;
  nationality?: string;
  disability?: string;
  disability_category?: string;
  marital_status?: string;
  // Emergency contact
  emergency_name?: string;
  emergency_relationship?: string;
  emergency_address?: string;
  emergency_phone?: string;
  // Bank details
  bank_name?: string;
  bank_address?: string;
  account_number?: string;
  sort_code?: string;
  // Employment details
  job_title?: string;
  department?: string;
  start_date?: string;
  // Holiday entitlements
  annual_leave_days?: number;
  sick_leave_days?: number;
  personal_days?: number;
  public_holidays?: number;
  christmas_closure_days?: number;
  carried_over_days?: number;
}

interface EnhancedUserDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  user?: SystemUser | null;
  onUserSaved?: () => void;
}

export function EnhancedUserDialog({ open, setOpen, user, onUserSaved }: EnhancedUserDialogProps) {
  const { updateUser, users, loadUsers } = useUsers();
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      surname: "",
      firstName: "",
      email: "",
      jobTitle: "",
      department: "",
      status: "Active",
      role: "Operator",
        annualLeaveDays: 25,
        sickLeaveDays: 10,
        personalDays: 5,
        publicHolidays: 10,
        christmasClosureDays: 5,
        carriedOverDays: 0,
    },
  });

  // Populate form when editing - prioritize fresh context data over potentially stale prop data
  useEffect(() => {
    secureLog.debug('User dialog useEffect triggered', { hasUser: !!user, open });
    if (user && open) {
      // The parent user row is refreshed immediately after saving. Prefer it over
      // the wider UsersContext, which can lag behind and reopen the dialog with
      // stale holiday entitlement values for some users.
      const userToUse = user;
      
      secureLog.debug('Loading user holiday data for dialog');
      
      const names = userToUse.name.split(' ');
      const firstName = names.slice(0, -1).join(' ') || '';
      const surname = names[names.length - 1] || '';
      
      const formData = {
        surname,
        firstName,
        dateOfBirth: userToUse.date_of_birth || "",
        currentAddress: userToUse.current_address || "",
        currentPostCode: userToUse.current_post_code || "",
        permanentAddress: userToUse.permanent_address || "",
        permanentPostCode: userToUse.permanent_post_code || "",
        homePhone: userToUse.home_phone || "",
        mobilePhone: userToUse.mobile_phone || "",
        nationalInsurance: userToUse.national_insurance || "",
        email: userToUse.email,
        gender: userToUse.gender || "",
        ethnicity: userToUse.ethnicity || "",
        nationality: userToUse.nationality || "",
        disability: userToUse.disability || "",
        disabilityCategory: userToUse.disability_category || "",
        maritalStatus: userToUse.marital_status || "",
        emergencyName: userToUse.emergency_name || "",
        emergencyRelationship: userToUse.emergency_relationship || "",
        emergencyAddress: userToUse.emergency_address || "",
        emergencyPhone: userToUse.emergency_phone || "",
        bankName: userToUse.bank_name || "",
        bankAddress: userToUse.bank_address || "",
        accountNumber: userToUse.account_number || "",
        sortCode: userToUse.sort_code || "",
        jobTitle: userToUse.job_title || "",
        department: userToUse.department || "",
        role: userToUse.role,
        status: (userToUse.status as "Active" | "On Leave" | "Inactive") || "Active",
        annualLeaveDays: userToUse.annual_leave_days ?? 25,
        sickLeaveDays: userToUse.sick_leave_days ?? 10,
        personalDays: userToUse.personal_days ?? 5,
        publicHolidays: userToUse.public_holidays ?? 10,
        christmasClosureDays: userToUse.christmas_closure_days !== undefined ? userToUse.christmas_closure_days : 5,
        carriedOverDays: userToUse.carried_over_days ?? 0,
        startDate: userToUse.start_date || "",
      };
      
      secureLog.debug('Form data being set for user dialog');
      
      form.reset(formData);
    } else {
      form.reset({
        surname: "",
        firstName: "",
        email: "",
        jobTitle: "",
        department: "",
        status: "Active",
        role: "Operator",
        annualLeaveDays: 25,
        sickLeaveDays: 10,
        personalDays: 5,
        publicHolidays: 10,
        christmasClosureDays: 5,
        carriedOverDays: 0,
      });
    }
  }, [user, users, open, form]);

  const onSubmit = async (values: UserFormData) => {
    setIsSaving(true);
    setJustSaved(false);
    try {
      const fullName = `${values.firstName} ${values.surname}`;
      // Sanitize masked/placeholder values that must not be sent as real data
      const cleanDate = (v?: string | null) => {
        if (!v) return null;
        const s = String(v).trim();
        if (!s || s === 'Protected' || s.includes('*')) return null;
        return s;
      };
      const cleanStr = (v?: string | null) => {
        if (v == null) return null;
        const s = String(v);
        if (s === 'Protected') return null;
        return s;
      };

      if (user) {
        // Update existing user using secure RPC
        const { data: updateResult, error: updateError } = await (supabase as any).rpc('admin_update_system_user', {
          p_id: user.id,
          p_name: fullName,
          p_email: values.email,
          p_role: values.role,
          p_status: values.status,
          p_title: null,
          p_date_of_birth: cleanDate(values.dateOfBirth),
          p_current_address: cleanStr(values.currentAddress),
          p_current_post_code: cleanStr(values.currentPostCode),
          p_permanent_address: cleanStr(values.permanentAddress),
          p_permanent_post_code: cleanStr(values.permanentPostCode),
          p_home_phone: cleanStr(values.homePhone),
          p_mobile_phone: cleanStr(values.mobilePhone),
          p_national_insurance: cleanStr(values.nationalInsurance),
          p_gender: cleanStr(values.gender),
          p_ethnicity: cleanStr(values.ethnicity),
          p_nationality: cleanStr(values.nationality),
          p_disability: cleanStr(values.disability),
          p_disability_category: cleanStr(values.disabilityCategory),
          p_marital_status: cleanStr(values.maritalStatus),
          p_emergency_name: cleanStr(values.emergencyName),
          p_emergency_relationship: cleanStr(values.emergencyRelationship),
          p_emergency_address: cleanStr(values.emergencyAddress),
          p_emergency_phone: cleanStr(values.emergencyPhone),
          p_bank_name: cleanStr(values.bankName),
          p_bank_address: cleanStr(values.bankAddress),
          p_account_number: cleanStr(values.accountNumber),
          p_sort_code: cleanStr(values.sortCode),
          p_job_title: values.jobTitle,
          p_department: values.department,
          p_annual_leave_days: values.annualLeaveDays,
          p_sick_leave_days: values.sickLeaveDays,
          p_personal_days: values.personalDays,
          p_public_holidays: values.publicHolidays,
          p_christmas_closure_days: values.christmasClosureDays,
          p_carried_over_days: values.carriedOverDays,
          p_start_date: cleanDate(values.startDate)
        });

        if (updateError) {
          console.error('🔥 Update error:', updateError);
          throw updateError;
        }
        
        secureLog.debug('Database update successful');
        
        await loadUsers();

        secureLog.debug('Update successful, calling onUserSaved');

        if (onUserSaved) {
          await onUserSaved();
        }

        // Show inline confirmation before closing so the user sees the save
        // landed and the next open won't reuse stale data.
        setJustSaved(true);
        toast.success("User updated successfully");
        await new Promise((r) => setTimeout(r, 900));
        setJustSaved(false);
        setOpen(false);
        return;
      } else {
        // Create new user
        if (!values.userPassword) {
          toast.error("Password is required for new users");
          return;
        }

        // Create user via secure edge function (admin API server-side)
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            email: values.email,
            password: values.userPassword,
            userData: {
              name: fullName,
              email: values.email,
              role: values.role,
              status: values.status,
              title: null,
              dateOfBirth: values.dateOfBirth || null,
              currentAddress: values.currentAddress,
              currentPostCode: values.currentPostCode,
              permanentAddress: values.permanentAddress,
              permanentPostCode: values.permanentPostCode,
              homePhone: values.homePhone,
              mobilePhone: values.mobilePhone,
              nationalInsurance: values.nationalInsurance,
              gender: values.gender,
              ethnicity: values.ethnicity,
              nationality: values.nationality,
              disability: values.disability,
              disabilityCategory: values.disabilityCategory,
              maritalStatus: values.maritalStatus,
              emergencyName: values.emergencyName,
              emergencyRelationship: values.emergencyRelationship,
              emergencyAddress: values.emergencyAddress,
              emergencyPhone: values.emergencyPhone,
              bankName: values.bankName,
              bankAddress: values.bankAddress,
              accountNumber: values.accountNumber,
              sortCode: values.sortCode,
              jobTitle: values.jobTitle,
              department: values.department,
              annualLeaveDays: values.annualLeaveDays ?? 25,
              sickLeaveDays: values.sickLeaveDays ?? 10,
              personalDays: values.personalDays ?? 5,
              publicHolidays: values.publicHolidays ?? 10,
              christmasClosureDays: values.christmasClosureDays ?? 5,
              carriedOverDays: values.carriedOverDays ?? 0,
              startDate: values.startDate || null,
            }
          }),
        });

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(result?.error || 'Failed to create user');
        }

        if (result?.error) throw new Error(result.error);
        setJustSaved(true);
        toast.success("User created successfully");
        await new Promise((r) => setTimeout(r, 900));
        setJustSaved(false);
      }

      setOpen(false);
      onUserSaved?.();
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast.error(error.message || "Failed to save user");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Prevent closing mid-save so the user can't reopen with stale data
        if (!next && (isSaving || justSaved)) return;
        setOpen(next);
      }}
    >
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        {justSaved && (
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 rounded-t-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow">
            <CheckCircle2 className="h-4 w-4" />
            Changes saved
          </div>
        )}
        {isSaving && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-md border bg-card px-4 py-2 text-sm font-medium shadow">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving changes…
            </div>
          </div>
        )}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {user ? "Edit User" : "Add New User"}
          </DialogTitle>
          <DialogDescription>
            {user ? "Edit comprehensive user information and entitlements" : "Create a new system user with complete HR details"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* Personal Details Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5" />
                Personal Details
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="surname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Surname *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name(s) *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address *</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="homePhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Home Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mobilePhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nationalInsurance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>National Insurance Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="AA123456A" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currentAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="permanentAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permanent Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currentPostCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Post Code</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="permanentPostCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permanent Post Code</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Monitoring Information Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5" />
                Monitoring Information
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ethnicity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ethnic Origin</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select ethnic origin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ethnicityOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nationality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nationality</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="disability"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Do you consider yourself to be disabled?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Yes/No" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("disability") === "Yes" && (
                  <FormField
                    control={form.control}
                    name="disabilityCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Disability Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {disabilityCategories.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="maritalStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marital Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select marital status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Single">Single</SelectItem>
                          <SelectItem value="Married">Married</SelectItem>
                          <SelectItem value="Divorced">Divorced</SelectItem>
                          <SelectItem value="Widowed">Widowed</SelectItem>
                          <SelectItem value="Separated">Separated</SelectItem>
                          <SelectItem value="Civil Partnership">Civil Partnership</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Emergency Contact Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="h-5 w-5" />
                Emergency Contact Details
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="emergencyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyRelationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telephone Number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Bank Details Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5" />
                Bank Details
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name of Bank/Building Society</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="bankAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Account Number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sortCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sort Code</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="12-34-56" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Employment Details Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Briefcase className="h-5 w-5" />
                New Post Details
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="jobTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department *</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                 <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Role *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Operator">Operator</SelectItem>
                          <SelectItem value="Supervisor">Supervisor</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                          <SelectItem value="Super-Admin">Super-Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="On Leave">On Leave</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!user && (
                  <FormField
                    control={form.control}
                    name="userPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password *</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder="Enter password for new user"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            {/* Holiday Entitlements Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5" />
                Holiday Entitlements
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="annualLeaveDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual Leave Days</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="25.0"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sickLeaveDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sick Leave Days</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="10.0"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="personalDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal Days</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="5.0"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="publicHolidays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Holidays</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="10.0"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="christmasClosureDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Christmas Closure Days</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="5.0"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="carriedOverDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Carried Over Days</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.5"
                          placeholder="0.0"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Holiday Summary Calculation */}
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm mb-2">Holiday Summary</h4>
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Base Annual Leave:</span>
                    <span className="font-mono">
                      {(form.watch("annualLeaveDays") ?? 25).toFixed(1)} days
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>+ Carried Over:</span>
                    <span className="font-mono">
                      {(form.watch("carriedOverDays") ?? 0).toFixed(1)} days
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>- Bank Holidays:</span>
                    <span className="font-mono">
                      -{(form.watch("publicHolidays") ?? 10).toFixed(1)} days
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>- Christmas Closure:</span>
                    <span className="font-mono">
                      -{(form.watch("christmasClosureDays") ?? 5).toFixed(1)} days
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between font-medium text-foreground">
                      <span>Available for Booking:</span>
                      <span className="font-mono text-primary">
                        {((form.watch("annualLeaveDays") ?? 25) + 
                         (form.watch("carriedOverDays") ?? 0) -
                         (form.watch("publicHolidays") ?? 10) -
                         (form.watch("christmasClosureDays") ?? 5)).toFixed(1)} days
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  💡 Bank holidays and Christmas closures are auto-deducted from annual leave
                </div>
              </div>
            </div>

            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSaving || justSaved}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || justSaved}
                className="min-w-[160px]"
              >
                {justSaved ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Saved
                  </>
                ) : isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  user ? "Update User" : "Create User"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}