export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_permission_grants: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          permission_id: string
          role: string
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id: string
          role: string
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_id?: string
          role?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_permission_grants_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_permissions: {
        Row: {
          created_at: string
          description: string | null
          feature: string
          icon: string | null
          id: string
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature: string
          icon?: string | null
          id?: string
          section: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          feature?: string
          icon?: string | null
          id?: string
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      auth_failed_attempts: {
        Row: {
          attempted_at: string
          email_lower: string
          id: string
        }
        Insert: {
          attempted_at?: string
          email_lower: string
          id?: string
        }
        Update: {
          attempted_at?: string
          email_lower?: string
          id?: string
        }
        Relationships: []
      }
      banner_rotation_settings: {
        Row: {
          created_at: string
          id: string
          manual_index: number | null
          manual_set_at: string | null
          rotation_hour: number
          singleton: boolean
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          manual_index?: number | null
          manual_set_at?: string | null
          rotation_hour?: number
          singleton?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          manual_index?: number | null
          manual_set_at?: string | null
          rotation_hour?: number
          singleton?: boolean
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          active: boolean | null
          base_call_allowance: number | null
          created_at: string | null
          customer_id: string
          monthly_charge: number | null
          name: string
          package_name: string | null
          rate_per_call: number | null
          rate_per_minute: number | null
          rate_sms: number | null
          rate_transfer_landline: number | null
          rate_transfer_mobile: number | null
          telephone: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          base_call_allowance?: number | null
          created_at?: string | null
          customer_id?: string
          monthly_charge?: number | null
          name: string
          package_name?: string | null
          rate_per_call?: number | null
          rate_per_minute?: number | null
          rate_sms?: number | null
          rate_transfer_landline?: number | null
          rate_transfer_mobile?: number | null
          telephone?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          base_call_allowance?: number | null
          created_at?: string | null
          customer_id?: string
          monthly_charge?: number | null
          name?: string
          package_name?: string | null
          rate_per_call?: number | null
          rate_per_minute?: number | null
          rate_sms?: number | null
          rate_transfer_landline?: number | null
          rate_transfer_mobile?: number | null
          telephone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      billing_data_audit: {
        Row: {
          accessed_at: string | null
          accessed_by: string
          action: string
          customer_id: string | null
          id: string
          ip_address: unknown
          table_name: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string | null
          accessed_by: string
          action: string
          customer_id?: string | null
          id?: string
          ip_address?: unknown
          table_name: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string | null
          accessed_by?: string
          action?: string
          customer_id?: string | null
          id?: string
          ip_address?: unknown
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      billing_invoices: {
        Row: {
          base_calls_allowed: number | null
          base_charge: number | null
          billing_period: string
          calls_made: number | null
          created_on: string | null
          customer_id: string | null
          extra_calls: number | null
          extra_charges: number | null
          extra_minutes: number | null
          invoice_id: string
          total_invoice: number | null
          total_minutes: number | null
          total_with_vat: number | null
          updated_at: string | null
          vat_rate: number | null
        }
        Insert: {
          base_calls_allowed?: number | null
          base_charge?: number | null
          billing_period: string
          calls_made?: number | null
          created_on?: string | null
          customer_id?: string | null
          extra_calls?: number | null
          extra_charges?: number | null
          extra_minutes?: number | null
          invoice_id?: string
          total_invoice?: number | null
          total_minutes?: number | null
          total_with_vat?: number | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Update: {
          base_calls_allowed?: number | null
          base_charge?: number | null
          billing_period?: string
          calls_made?: number | null
          created_on?: string | null
          customer_id?: string | null
          extra_calls?: number | null
          extra_charges?: number | null
          extra_minutes?: number | null
          invoice_id?: string
          total_invoice?: number | null
          total_minutes?: number | null
          total_with_vat?: number | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      billing_line_items: {
        Row: {
          billing_period_id: string
          call_id: string
          charge_overage_pence: number
          charge_per_call_pence: number
          created_at: string
          duration_seconds: number
          id: string
          is_overage: boolean
          overage_minutes: number
          overage_per_minute_pence: number
          per_call_rate_pence: number
          std_included_seconds: number
          total_charge_pence: number
        }
        Insert: {
          billing_period_id: string
          call_id: string
          charge_overage_pence?: number
          charge_per_call_pence: number
          created_at?: string
          duration_seconds: number
          id?: string
          is_overage?: boolean
          overage_minutes?: number
          overage_per_minute_pence: number
          per_call_rate_pence: number
          std_included_seconds: number
          total_charge_pence: number
        }
        Update: {
          billing_period_id?: string
          call_id?: string
          charge_overage_pence?: number
          charge_per_call_pence?: number
          created_at?: string
          duration_seconds?: number
          id?: string
          is_overage?: boolean
          overage_minutes?: number
          overage_per_minute_pence?: number
          per_call_rate_pence?: number
          std_included_seconds?: number
          total_charge_pence?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_line_items_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_items_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["call_id"]
          },
        ]
      }
      billing_periods: {
        Row: {
          base_charge_pence: number
          created_at: string
          customer_id: string
          id: string
          included_calls: number
          overage_calls: number
          overage_charge_pence: number
          period_end: string
          period_label: string
          period_start: string
          status: string
          total_calls: number
          total_charge_pence: number
          total_seconds: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          base_charge_pence?: number
          created_at?: string
          customer_id: string
          id?: string
          included_calls?: number
          overage_calls?: number
          overage_charge_pence?: number
          period_end: string
          period_label: string
          period_start: string
          status?: string
          total_calls?: number
          total_charge_pence?: number
          total_seconds?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          base_charge_pence?: number
          created_at?: string
          customer_id?: string
          id?: string
          included_calls?: number
          overage_calls?: number
          overage_charge_pence?: number
          period_end?: string
          period_label?: string
          period_start?: string
          status?: string
          total_calls?: number
          total_charge_pence?: number
          total_seconds?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_periods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      billing_settings: {
        Row: {
          created_at: string | null
          default_call_rate: number | null
          default_package: string | null
          id: string
          updated_at: string | null
          vat_rate: number
        }
        Insert: {
          created_at?: string | null
          default_call_rate?: number | null
          default_package?: string | null
          id?: string
          updated_at?: string | null
          vat_rate?: number
        }
        Update: {
          created_at?: string | null
          default_call_rate?: number | null
          default_package?: string | null
          id?: string
          updated_at?: string | null
          vat_rate?: number
        }
        Relationships: []
      }
      call_logs: {
        Row: {
          agent: string | null
          batch_id: string | null
          billing_period: string | null
          call_ended_at: string | null
          call_id: string
          call_started_at: string | null
          call_type: string | null
          caller_number: string | null
          channel_type: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          date: string | null
          ddi: string | null
          direction: string | null
          duration: string | null
          duration_seconds: number | null
          import_batch_id: string | null
          is_sms: boolean | null
          notes: string | null
          raw_source_row: Json | null
          result: string | null
          status: string | null
          time: string | null
        }
        Insert: {
          agent?: string | null
          batch_id?: string | null
          billing_period?: string | null
          call_ended_at?: string | null
          call_id?: string
          call_started_at?: string | null
          call_type?: string | null
          caller_number?: string | null
          channel_type?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          ddi?: string | null
          direction?: string | null
          duration?: string | null
          duration_seconds?: number | null
          import_batch_id?: string | null
          is_sms?: boolean | null
          notes?: string | null
          raw_source_row?: Json | null
          result?: string | null
          status?: string | null
          time?: string | null
        }
        Update: {
          agent?: string | null
          batch_id?: string | null
          billing_period?: string | null
          call_ended_at?: string | null
          call_id?: string
          call_started_at?: string | null
          call_type?: string | null
          caller_number?: string | null
          channel_type?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          ddi?: string | null
          direction?: string | null
          duration?: string | null
          duration_seconds?: number | null
          import_batch_id?: string | null
          is_sms?: boolean | null
          notes?: string | null
          raw_source_row?: Json | null
          result?: string | null
          status?: string | null
          time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "call_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      chat_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          expires_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          message_id: string
          room_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          expires_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          message_id: string
          room_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          expires_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          message_id?: string
          room_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_attachments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_deletion_audit: {
        Row: {
          attachment_count: number
          created_at: string
          deleted_at: string
          deleted_by: string
          deleted_by_email: string | null
          id: string
          message_content: string | null
          message_id: string
          message_sender_id: string | null
          room_id: string | null
        }
        Insert: {
          attachment_count?: number
          created_at?: string
          deleted_at?: string
          deleted_by: string
          deleted_by_email?: string | null
          id?: string
          message_content?: string | null
          message_id: string
          message_sender_id?: string | null
          room_id?: string | null
        }
        Update: {
          attachment_count?: number
          created_at?: string
          deleted_at?: string
          deleted_by?: string
          deleted_by_email?: string | null
          id?: string
          message_content?: string | null
          message_id?: string
          message_sender_id?: string | null
          room_id?: string | null
        }
        Relationships: []
      }
      chat_message_deliveries: {
        Row: {
          delivered_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          delivered_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          delivered_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          room_id: string
          sender_id: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          room_id: string
          sender_id: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          room_id?: string
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_members: {
        Row: {
          id: string
          joined_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_private: boolean
          name: string | null
          type: Database["public"]["Enums"]["chat_room_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_private?: boolean
          name?: string | null
          type?: Database["public"]["Enums"]["chat_room_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_private?: boolean
          name?: string | null
          type?: Database["public"]["Enums"]["chat_room_type"]
          updated_at?: string
        }
        Relationships: []
      }
      checklist_instances: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          contact_names: string[]
          created_at: string
          customer_id: string | null
          description: string | null
          due_time: string | null
          id: string
          is_internal: boolean
          is_overdue: boolean
          occurrence_index: number
          occurrence_label: string | null
          priority: Database["public"]["Enums"]["checklist_priority"]
          reminder_sent_at: string | null
          shift_instance_id: string | null
          skipped_reason: string | null
          status: Database["public"]["Enums"]["checklist_instance_status"]
          system_user_id: string | null
          task_date: string
          template_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          contact_names?: string[]
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_time?: string | null
          id?: string
          is_internal?: boolean
          is_overdue?: boolean
          occurrence_index?: number
          occurrence_label?: string | null
          priority?: Database["public"]["Enums"]["checklist_priority"]
          reminder_sent_at?: string | null
          shift_instance_id?: string | null
          skipped_reason?: string | null
          status?: Database["public"]["Enums"]["checklist_instance_status"]
          system_user_id?: string | null
          task_date: string
          template_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          contact_names?: string[]
          created_at?: string
          customer_id?: string | null
          description?: string | null
          due_time?: string | null
          id?: string
          is_internal?: boolean
          is_overdue?: boolean
          occurrence_index?: number
          occurrence_label?: string | null
          priority?: Database["public"]["Enums"]["checklist_priority"]
          reminder_sent_at?: string | null
          shift_instance_id?: string | null
          skipped_reason?: string | null
          status?: Database["public"]["Enums"]["checklist_instance_status"]
          system_user_id?: string | null
          task_date?: string
          template_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_instances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_instances_system_user_id_fkey"
            columns: ["system_user_id"]
            isOneToOne: false
            referencedRelation: "system_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          instance_id: string
          new_status:
            | Database["public"]["Enums"]["checklist_instance_status"]
            | null
          notes: string | null
          old_status:
            | Database["public"]["Enums"]["checklist_instance_status"]
            | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          instance_id: string
          new_status?:
            | Database["public"]["Enums"]["checklist_instance_status"]
            | null
          notes?: string | null
          old_status?:
            | Database["public"]["Enums"]["checklist_instance_status"]
            | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          instance_id?: string
          new_status?:
            | Database["public"]["Enums"]["checklist_instance_status"]
            | null
          notes?: string | null
          old_status?:
            | Database["public"]["Enums"]["checklist_instance_status"]
            | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "checklist_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          assigned_department: string | null
          assigned_role: string | null
          assigned_user_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          custom_times: Json
          customer_id: string | null
          days_of_week: number[]
          description: string | null
          frequency_type: Database["public"]["Enums"]["checklist_frequency"]
          id: string
          is_active: boolean
          is_internal: boolean
          min_contact_names: number
          priority: Database["public"]["Enums"]["checklist_priority"]
          reminder_offset_minutes: number | null
          require_contact_names: boolean
          shift_scope: Database["public"]["Enums"]["checklist_shift_scope"]
          shift_template_ids: string[]
          template_name: string
          updated_at: string
        }
        Insert: {
          assigned_department?: string | null
          assigned_role?: string | null
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          custom_times?: Json
          customer_id?: string | null
          days_of_week?: number[]
          description?: string | null
          frequency_type?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          is_internal?: boolean
          min_contact_names?: number
          priority?: Database["public"]["Enums"]["checklist_priority"]
          reminder_offset_minutes?: number | null
          require_contact_names?: boolean
          shift_scope?: Database["public"]["Enums"]["checklist_shift_scope"]
          shift_template_ids?: string[]
          template_name: string
          updated_at?: string
        }
        Update: {
          assigned_department?: string | null
          assigned_role?: string | null
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          custom_times?: Json
          customer_id?: string | null
          days_of_week?: number[]
          description?: string | null
          frequency_type?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          is_internal?: boolean
          min_contact_names?: number
          priority?: Database["public"]["Enums"]["checklist_priority"]
          reminder_offset_minutes?: number | null
          require_contact_names?: boolean
          shift_scope?: Database["public"]["Enums"]["checklist_shift_scope"]
          shift_template_ids?: string[]
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "system_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      comprehensive_users: {
        Row: {
          annual_leave_entitlement: number | null
          auth_user_id: string | null
          city: string | null
          contract_type: string | null
          country: string | null
          created_at: string
          department: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_relationship: string | null
          employee_id: string | null
          id: string
          is_staff_member: boolean | null
          is_system_user: boolean | null
          line_manager_id: string | null
          name: string
          phone_number: string | null
          position: string | null
          postal_code: string | null
          role: string
          start_date: string | null
          status: string
          updated_at: string
          working_hours_per_week: number | null
        }
        Insert: {
          annual_leave_entitlement?: number | null
          auth_user_id?: string | null
          city?: string | null
          contract_type?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          id?: string
          is_staff_member?: boolean | null
          is_system_user?: boolean | null
          line_manager_id?: string | null
          name: string
          phone_number?: string | null
          position?: string | null
          postal_code?: string | null
          role?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          working_hours_per_week?: number | null
        }
        Update: {
          annual_leave_entitlement?: number | null
          auth_user_id?: string | null
          city?: string | null
          contract_type?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          id?: string
          is_staff_member?: boolean | null
          is_system_user?: boolean | null
          line_manager_id?: string | null
          name?: string
          phone_number?: string | null
          position?: string | null
          postal_code?: string | null
          role?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          working_hours_per_week?: number | null
        }
        Relationships: []
      }
      customer_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_mapping_presets: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          form_template_id: string | null
          id: string
          is_default: boolean
          mapping: Json
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          form_template_id?: string | null
          id?: string
          is_default?: boolean
          mapping: Json
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          form_template_id?: string | null
          id?: string
          is_default?: boolean
          mapping?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_mapping_presets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_mapping_presets_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_mapping_versions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          form_template_id: string | null
          id: string
          mapping: Json
          note: string | null
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          form_template_id?: string | null
          id?: string
          mapping: Json
          note?: string | null
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          form_template_id?: string | null
          id?: string
          mapping?: Json
          note?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_mapping_versions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_mapping_versions_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_pricing: {
        Row: {
          created_at: string
          customer_id: string
          effective_from: string
          id: string
          notes: string | null
          overage_per_minute_pence: number
          per_call_rate_pence: number
          std_included_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          effective_from: string
          id?: string
          notes?: string | null
          overage_per_minute_pence: number
          per_call_rate_pence: number
          std_included_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          effective_from?: string
          id?: string
          notes?: string | null
          overage_per_minute_pence?: number
          per_call_rate_pence?: number
          std_included_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_pricing_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "billing_customers"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      customer_script_audit: {
        Row: {
          action: string
          contact_label: string | null
          created_at: string
          customer_id: string
          id: string
          new_script: string | null
          new_tags: Json | null
          old_script: string | null
          old_tags: Json | null
          ooo_from: string | null
          ooo_reason: string | null
          ooo_until: string | null
          user_id: string
        }
        Insert: {
          action: string
          contact_label?: string | null
          created_at?: string
          customer_id: string
          id?: string
          new_script?: string | null
          new_tags?: Json | null
          old_script?: string | null
          old_tags?: Json | null
          ooo_from?: string | null
          ooo_reason?: string | null
          ooo_until?: string | null
          user_id: string
        }
        Update: {
          action?: string
          contact_label?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          new_script?: string | null
          new_tags?: Json | null
          old_script?: string | null
          old_tags?: Json | null
          ooo_from?: string | null
          ooo_reason?: string | null
          ooo_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          account_id: string | null
          additional_services: Json | null
          address: string | null
          address_line1: string | null
          address_line2: string | null
          ai_calls_allocated: number | null
          ai_monthly_fee: number | null
          ai_package: string | null
          ai_price: number | null
          ai_setup_fee: number | null
          billing_day: string | null
          billing_options: string | null
          billing_status: Json | null
          business_type: string | null
          call_answering_plan: string | null
          call_base_allowance: number | null
          call_billing_unit: string | null
          call_handling_tier: string | null
          call_included_minutes: number | null
          call_monthly_charge: number | null
          call_package_name: string | null
          call_rate_per_call: number | null
          call_rate_per_minute: number | null
          call_rate_sms: number | null
          call_rate_transfer_landline: number | null
          call_rate_transfer_mobile: number | null
          calls_per_month: string | null
          cb_included_minutes: number | null
          cb_overage_rate: number | null
          cb_package: string | null
          cb_price: number | null
          city: string | null
          cl_included_minutes: number | null
          cl_overage_rate: number | null
          cl_package: string | null
          cl_price: number | null
          contact: string | null
          contacts: Json | null
          created_at: string
          direct_dial_number: boolean
          dt_package: string | null
          dt_price: number | null
          dt_price_per_minute: number | null
          email: string | null
          filters: string | null
          has_inbound_call_script: boolean
          id: string
          lead_metadata: Json | null
          locations: Json | null
          message_selection: string | null
          mobile: string | null
          name: string
          outcome_format: string | null
          outcome_how: string | null
          outcome_when: string | null
          packages: Json | null
          phone: string | null
          postcode: string | null
          script: string | null
          script_field_mappings: Json
          script_tags: Json | null
          services: Json | null
          status: string
          system_icon: string | null
          system_link: string | null
          tel: string | null
          updated_at: string
          user_id: string
          va_hourly_overage_rate: number | null
          va_package: string | null
          va_packaged_hours: number | null
          va_price: number | null
          vat_rate: number | null
          virtual_assistant_plan: string | null
          vr_included_minutes: number | null
          vr_overage_rate: number | null
          vr_package: string | null
          vr_price: number | null
          website: string | null
        }
        Insert: {
          account_id?: string | null
          additional_services?: Json | null
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          ai_calls_allocated?: number | null
          ai_monthly_fee?: number | null
          ai_package?: string | null
          ai_price?: number | null
          ai_setup_fee?: number | null
          billing_day?: string | null
          billing_options?: string | null
          billing_status?: Json | null
          business_type?: string | null
          call_answering_plan?: string | null
          call_base_allowance?: number | null
          call_billing_unit?: string | null
          call_handling_tier?: string | null
          call_included_minutes?: number | null
          call_monthly_charge?: number | null
          call_package_name?: string | null
          call_rate_per_call?: number | null
          call_rate_per_minute?: number | null
          call_rate_sms?: number | null
          call_rate_transfer_landline?: number | null
          call_rate_transfer_mobile?: number | null
          calls_per_month?: string | null
          cb_included_minutes?: number | null
          cb_overage_rate?: number | null
          cb_package?: string | null
          cb_price?: number | null
          city?: string | null
          cl_included_minutes?: number | null
          cl_overage_rate?: number | null
          cl_package?: string | null
          cl_price?: number | null
          contact?: string | null
          contacts?: Json | null
          created_at?: string
          direct_dial_number?: boolean
          dt_package?: string | null
          dt_price?: number | null
          dt_price_per_minute?: number | null
          email?: string | null
          filters?: string | null
          has_inbound_call_script?: boolean
          id?: string
          lead_metadata?: Json | null
          locations?: Json | null
          message_selection?: string | null
          mobile?: string | null
          name: string
          outcome_format?: string | null
          outcome_how?: string | null
          outcome_when?: string | null
          packages?: Json | null
          phone?: string | null
          postcode?: string | null
          script?: string | null
          script_field_mappings?: Json
          script_tags?: Json | null
          services?: Json | null
          status?: string
          system_icon?: string | null
          system_link?: string | null
          tel?: string | null
          updated_at?: string
          user_id: string
          va_hourly_overage_rate?: number | null
          va_package?: string | null
          va_packaged_hours?: number | null
          va_price?: number | null
          vat_rate?: number | null
          virtual_assistant_plan?: string | null
          vr_included_minutes?: number | null
          vr_overage_rate?: number | null
          vr_package?: string | null
          vr_price?: number | null
          website?: string | null
        }
        Update: {
          account_id?: string | null
          additional_services?: Json | null
          address?: string | null
          address_line1?: string | null
          address_line2?: string | null
          ai_calls_allocated?: number | null
          ai_monthly_fee?: number | null
          ai_package?: string | null
          ai_price?: number | null
          ai_setup_fee?: number | null
          billing_day?: string | null
          billing_options?: string | null
          billing_status?: Json | null
          business_type?: string | null
          call_answering_plan?: string | null
          call_base_allowance?: number | null
          call_billing_unit?: string | null
          call_handling_tier?: string | null
          call_included_minutes?: number | null
          call_monthly_charge?: number | null
          call_package_name?: string | null
          call_rate_per_call?: number | null
          call_rate_per_minute?: number | null
          call_rate_sms?: number | null
          call_rate_transfer_landline?: number | null
          call_rate_transfer_mobile?: number | null
          calls_per_month?: string | null
          cb_included_minutes?: number | null
          cb_overage_rate?: number | null
          cb_package?: string | null
          cb_price?: number | null
          city?: string | null
          cl_included_minutes?: number | null
          cl_overage_rate?: number | null
          cl_package?: string | null
          cl_price?: number | null
          contact?: string | null
          contacts?: Json | null
          created_at?: string
          direct_dial_number?: boolean
          dt_package?: string | null
          dt_price?: number | null
          dt_price_per_minute?: number | null
          email?: string | null
          filters?: string | null
          has_inbound_call_script?: boolean
          id?: string
          lead_metadata?: Json | null
          locations?: Json | null
          message_selection?: string | null
          mobile?: string | null
          name?: string
          outcome_format?: string | null
          outcome_how?: string | null
          outcome_when?: string | null
          packages?: Json | null
          phone?: string | null
          postcode?: string | null
          script?: string | null
          script_field_mappings?: Json
          script_tags?: Json | null
          services?: Json | null
          status?: string
          system_icon?: string | null
          system_link?: string | null
          tel?: string | null
          updated_at?: string
          user_id?: string
          va_hourly_overage_rate?: number | null
          va_package?: string | null
          va_packaged_hours?: number | null
          va_price?: number | null
          vat_rate?: number | null
          virtual_assistant_plan?: string | null
          vr_included_minutes?: number | null
          vr_overage_rate?: number | null
          vr_package?: string | null
          vr_price?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_banners: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_shares: {
        Row: {
          created_at: string
          document_id: string
          document_type: string
          expires_at: string | null
          id: string
          is_active: boolean
          password_hash: string | null
          share_token: string
          shared_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          document_type: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          password_hash?: string | null
          share_token: string
          shared_by: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          document_type?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          password_hash?: string | null
          share_token?: string
          shared_by?: string
          updated_at?: string
        }
        Relationships: []
      }
      duplicate_detection_settings: {
        Row: {
          address_similarity_threshold: number
          created_at: string
          enforcement: string
          id: string
          match_address: boolean
          match_email: boolean
          match_phone: boolean
          name_similarity_threshold: number
          singleton: boolean
          updated_at: string
        }
        Insert: {
          address_similarity_threshold?: number
          created_at?: string
          enforcement?: string
          id?: string
          match_address?: boolean
          match_email?: boolean
          match_phone?: boolean
          name_similarity_threshold?: number
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          address_similarity_threshold?: number
          created_at?: string
          enforcement?: string
          id?: string
          match_address?: boolean
          match_email?: boolean
          match_phone?: boolean
          name_similarity_threshold?: number
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      email_intake_rules: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          enabled: boolean
          id: string
          match_type: string
          match_value: string
          sort_order: number
          task_priority: string | null
          task_status: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          enabled?: boolean
          id?: string
          match_type: string
          match_value: string
          sort_order?: number
          task_priority?: string | null
          task_status?: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          enabled?: boolean
          id?: string
          match_type?: string
          match_value?: string
          sort_order?: number
          task_priority?: string | null
          task_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_intake_rules_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "system_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_intake_rules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_intake_settings: {
        Row: {
          assignee_group: string[]
          created_at: string
          default_status: string
          gmail_poll_enabled: boolean
          gmail_query: string
          id: boolean
          last_assigned_user_id: string | null
          updated_at: string
        }
        Insert: {
          assignee_group?: string[]
          created_at?: string
          default_status?: string
          gmail_poll_enabled?: boolean
          gmail_query?: string
          id?: boolean
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Update: {
          assignee_group?: string[]
          created_at?: string
          default_status?: string
          gmail_poll_enabled?: boolean
          gmail_query?: string
          id?: boolean
          last_assigned_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_template_content: {
        Row: {
          body_text: string
          category: string | null
          created_at: string
          display_label: string | null
          id: string
          signature_text: string | null
          subject: string
          template_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_text: string
          category?: string | null
          created_at?: string
          display_label?: string | null
          id?: string
          signature_text?: string | null
          subject: string
          template_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_text?: string
          category?: string | null
          created_at?: string
          display_label?: string | null
          id?: string
          signature_text?: string | null
          subject?: string
          template_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_financial_data: {
        Row: {
          created_at: string
          encrypted_bank_account: string | null
          encrypted_bank_sort_code: string | null
          encrypted_ni_number: string | null
          encrypted_salary: string | null
          encryption_version: number | null
          id: string
          last_accessed_at: string | null
          last_accessed_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_bank_account?: string | null
          encrypted_bank_sort_code?: string | null
          encrypted_ni_number?: string | null
          encrypted_salary?: string | null
          encryption_version?: number | null
          id?: string
          last_accessed_at?: string | null
          last_accessed_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_bank_account?: string | null
          encrypted_bank_sort_code?: string | null
          encrypted_ni_number?: string | null
          encrypted_salary?: string | null
          encryption_version?: number | null
          id?: string
          last_accessed_at?: string | null
          last_accessed_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_sensitive_data: {
        Row: {
          access_count: number | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          full_address: string | null
          id: string
          last_accessed_at: string | null
          last_accessed_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_count?: number | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_address?: string | null
          id?: string
          last_accessed_at?: string | null
          last_accessed_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_count?: number | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_address?: string | null
          id?: string
          last_accessed_at?: string | null
          last_accessed_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_data_audit_enhanced: {
        Row: {
          action: string
          created_at: string
          data_category: string
          fields_accessed: string[] | null
          id: string
          ip_address: unknown
          risk_level: string | null
          session_id: string | null
          target_user_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          data_category?: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: unknown
          risk_level?: string | null
          session_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          data_category?: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: unknown
          risk_level?: string | null
          session_id?: string | null
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      financial_emergency_access: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          expires_at: string
          id: string
          is_active: boolean | null
          reason: string
          target_user_id: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          is_active?: boolean | null
          reason: string
          target_user_id: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean | null
          reason?: string
          target_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          completed_at: string | null
          customer_id: string
          data: Json
          form_template_id: string
          id: string
          responses: Json
          sent_at: string
          status: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          customer_id: string
          data?: Json
          form_template_id: string
          id?: string
          responses?: Json
          sent_at?: string
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          customer_id?: string
          data?: Json
          form_template_id?: string
          id?: string
          responses?: Json
          sent_at?: string
          status?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          brand_color: string
          created_at: string
          created_by: string
          description: string
          elements: Json
          field_mappings: Json
          form_type: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          brand_color?: string
          created_at?: string
          created_by: string
          description?: string
          elements?: Json
          field_mappings?: Json
          form_type?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          brand_color?: string
          created_at?: string
          created_by?: string
          description?: string
          elements?: Json
          field_mappings?: Json
          form_type?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      holiday_entitlements: {
        Row: {
          annual_leave_entitlement: number
          annual_leave_used: number
          carried_over: number
          christmas_closure_days: number
          created_at: string
          id: string
          personal_days_entitlement: number
          personal_days_used: number
          public_holidays: number
          sick_leave_entitlement: number
          sick_leave_used: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          annual_leave_entitlement?: number
          annual_leave_used?: number
          carried_over?: number
          christmas_closure_days?: number
          created_at?: string
          id?: string
          personal_days_entitlement?: number
          personal_days_used?: number
          public_holidays?: number
          sick_leave_entitlement?: number
          sick_leave_used?: number
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          annual_leave_entitlement?: number
          annual_leave_used?: number
          carried_over?: number
          christmas_closure_days?: number
          created_at?: string
          id?: string
          personal_days_entitlement?: number
          personal_days_used?: number
          public_holidays?: number
          sick_leave_entitlement?: number
          sick_leave_used?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      holiday_requests: {
        Row: {
          absence_type: Database["public"]["Enums"]["absence_type"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          decline_reason: string | null
          end_date: string
          google_calendar_event_id: string | null
          id: string
          is_unpaid: boolean
          notes: string | null
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          system_user_id: string | null
          total_days: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          absence_type?: Database["public"]["Enums"]["absence_type"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decline_reason?: string | null
          end_date: string
          google_calendar_event_id?: string | null
          id?: string
          is_unpaid?: boolean
          notes?: string | null
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          system_user_id?: string | null
          total_days?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          absence_type?: Database["public"]["Enums"]["absence_type"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decline_reason?: string | null
          end_date?: string
          google_calendar_event_id?: string | null
          id?: string
          is_unpaid?: boolean
          notes?: string | null
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          system_user_id?: string | null
          total_days?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      holiday_requests_archive: {
        Row: {
          absence_type: Database["public"]["Enums"]["absence_type"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          decline_reason: string | null
          end_date: string
          google_calendar_event_id: string | null
          id: string
          is_unpaid: boolean
          notes: string | null
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          system_user_id: string | null
          total_days: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          absence_type?: Database["public"]["Enums"]["absence_type"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decline_reason?: string | null
          end_date: string
          google_calendar_event_id?: string | null
          id?: string
          is_unpaid?: boolean
          notes?: string | null
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          system_user_id?: string | null
          total_days?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          absence_type?: Database["public"]["Enums"]["absence_type"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          decline_reason?: string | null
          end_date?: string
          google_calendar_event_id?: string | null
          id?: string
          is_unpaid?: boolean
          notes?: string | null
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          system_user_id?: string | null
          total_days?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          batch_id: string
          billing_period: string | null
          error_count: number | null
          processed_count: number | null
          source: string
          status: string | null
          total_records: number | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          batch_id?: string
          billing_period?: string | null
          error_count?: number | null
          processed_count?: number | null
          source: string
          status?: string | null
          total_records?: number | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          batch_id?: string
          billing_period?: string | null
          error_count?: number | null
          processed_count?: number | null
          source?: string
          status?: string | null
          total_records?: number | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      inbound_email_log: {
        Row: {
          assigned_to: string | null
          attachment_count: number
          attachment_names: string[]
          attempt_count: number
          created_at: string
          customer_id: string | null
          error_message: string | null
          from_email: string
          from_name: string | null
          id: string
          last_attempt_at: string | null
          matched_rule_id: string | null
          message_id: string | null
          raw_payload: Json | null
          received_at: string
          status: string
          subject: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attachment_count?: number
          attachment_names?: string[]
          attempt_count?: number
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          from_email: string
          from_name?: string | null
          id?: string
          last_attempt_at?: string | null
          matched_rule_id?: string | null
          message_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          status?: string
          subject?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attachment_count?: number
          attachment_names?: string[]
          attempt_count?: number
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          from_email?: string
          from_name?: string | null
          id?: string
          last_attempt_at?: string | null
          matched_rule_id?: string | null
          message_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          status?: string
          subject?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_log_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "email_intake_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_billing_periods: {
        Row: {
          call_base_charge: number
          call_overage_charge: number
          customer_id: string
          generated_at: string
          id: string
          included_calls: number
          included_va_seconds: number
          overage_calls: number
          overage_minutes: number
          overage_va_seconds: number
          period_end: string
          period_label: string
          period_start: string
          status: string
          subtotal: number
          total: number
          total_call_seconds: number
          total_calls: number
          total_va_seconds: number
          updated_at: string
          va_base_charge: number
          va_overage_charge: number
          va_task_charge: number
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          call_base_charge?: number
          call_overage_charge?: number
          customer_id: string
          generated_at?: string
          id?: string
          included_calls?: number
          included_va_seconds?: number
          overage_calls?: number
          overage_minutes?: number
          overage_va_seconds?: number
          period_end: string
          period_label: string
          period_start: string
          status?: string
          subtotal?: number
          total?: number
          total_call_seconds?: number
          total_calls?: number
          total_va_seconds?: number
          updated_at?: string
          va_base_charge?: number
          va_overage_charge?: number
          va_task_charge?: number
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          call_base_charge?: number
          call_overage_charge?: number
          customer_id?: string
          generated_at?: string
          id?: string
          included_calls?: number
          included_va_seconds?: number
          overage_calls?: number
          overage_minutes?: number
          overage_va_seconds?: number
          period_end?: string
          period_label?: string
          period_start?: string
          status?: string
          subtotal?: number
          total?: number
          total_call_seconds?: number
          total_calls?: number
          total_va_seconds?: number
          updated_at?: string
          va_base_charge?: number
          va_overage_charge?: number
          va_task_charge?: number
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "internal_billing_periods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          call_base_charge: number
          call_overage_charge: number
          call_package_name: string | null
          created_at: string
          customer_id: string
          customer_name: string | null
          id: string
          invoice_number: string
          notes: string | null
          period_id: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          va_base_charge: number
          va_overage_charge: number
          va_package_name: string | null
          va_task_charge: number
          vat_amount: number
          vat_rate: number
          xero_invoice_id: string | null
          xero_last_error: string | null
          xero_reference: string | null
          xero_sent_at: string | null
          xero_status: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          call_base_charge?: number
          call_overage_charge?: number
          call_package_name?: string | null
          created_at?: string
          customer_id: string
          customer_name?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          period_id: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          va_base_charge?: number
          va_overage_charge?: number
          va_package_name?: string | null
          va_task_charge?: number
          vat_amount?: number
          vat_rate?: number
          xero_invoice_id?: string | null
          xero_last_error?: string | null
          xero_reference?: string | null
          xero_sent_at?: string | null
          xero_status?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          call_base_charge?: number
          call_overage_charge?: number
          call_package_name?: string | null
          created_at?: string
          customer_id?: string
          customer_name?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          period_id?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          va_base_charge?: number
          va_overage_charge?: number
          va_package_name?: string | null
          va_task_charge?: number
          vat_amount?: number
          vat_rate?: number
          xero_invoice_id?: string | null
          xero_last_error?: string | null
          xero_reference?: string | null
          xero_sent_at?: string | null
          xero_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_invoices_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: true
            referencedRelation: "internal_billing_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_call_lines: {
        Row: {
          call_id: string | null
          charge: number
          created_at: string
          description: string | null
          duration_seconds: number
          id: string
          invoice_id: string
          is_overage: boolean
        }
        Insert: {
          call_id?: string | null
          charge?: number
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          invoice_id: string
          is_overage?: boolean
        }
        Update: {
          call_id?: string | null
          charge?: number
          created_at?: string
          description?: string | null
          duration_seconds?: number
          id?: string
          invoice_id?: string
          is_overage?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "invoice_call_lines_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["call_id"]
          },
          {
            foreignKeyName: "invoice_call_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "internal_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_dt_lines: {
        Row: {
          charge: number
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          minutes: number
          rate_per_minute: number
          task_id: string | null
        }
        Insert: {
          charge?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          minutes?: number
          rate_per_minute?: number
          task_id?: string | null
        }
        Update: {
          charge?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          minutes?: number
          rate_per_minute?: number
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_dt_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "internal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_dt_lines_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_va_lines: {
        Row: {
          billable_seconds: number
          charge: number
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          line_type: string
          rate: number
          task_id: string | null
        }
        Insert: {
          billable_seconds?: number
          charge?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          line_type?: string
          rate?: number
          task_id?: string | null
        }
        Update: {
          billable_seconds?: number
          charge?: number
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          line_type?: string
          rate?: number
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_va_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "internal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_va_lines_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_quota_defaults: {
        Row: {
          applied_at: string | null
          bank_holidays: number
          base_annual: number
          christmas_closure_days: number
          created_at: string
          updated_at: string
          year: number
        }
        Insert: {
          applied_at?: string | null
          bank_holidays?: number
          base_annual?: number
          christmas_closure_days?: number
          created_at?: string
          updated_at?: string
          year: number
        }
        Update: {
          applied_at?: string | null
          bank_holidays?: number
          base_annual?: number
          christmas_closure_days?: number
          created_at?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      news_items: {
        Row: {
          category: string
          client_id: string
          created_at: string
          created_at_iso: string
          date: string
          description: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
          valid_until: string
        }
        Insert: {
          category: string
          client_id: string
          created_at?: string
          created_at_iso: string
          date: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
          valid_until: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          created_at_iso?: string
          date?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
          valid_until?: string
        }
        Relationships: []
      }
      noticeboard: {
        Row: {
          content: string
          created_at: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_event_types: {
        Row: {
          category: string
          created_at: string
          description: string | null
          email_default: boolean
          in_app_default: boolean
          key: string
          label: string
          push_default: boolean
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          email_default?: boolean
          in_app_default?: boolean
          key: string
          label: string
          push_default?: boolean
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          email_default?: boolean
          in_app_default?: boolean
          key?: string
          label?: string
          push_default?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email: boolean
          event_type: string
          id: string
          in_app: boolean
          push: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: boolean
          event_type: string
          id?: string
          in_app?: boolean
          push?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: boolean
          event_type?: string
          id?: string
          in_app?: boolean
          push?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_event_type_fkey"
            columns: ["event_type"]
            isOneToOne: false
            referencedRelation: "notification_event_types"
            referencedColumns: ["key"]
          },
        ]
      }
      permission_grant_audit: {
        Row: {
          actor_name_snapshot: string | null
          actor_role_snapshot: string | null
          actor_status_snapshot: string | null
          actor_user_id: string | null
          created_at: string
          feature_snapshot: string | null
          id: string
          new_granted: boolean | null
          new_scope: string | null
          outcome: string
          outcome_code: string
          outcome_message: string | null
          permission_id: string | null
          previous_granted: boolean | null
          previous_scope: string | null
          requested_granted: boolean | null
          requested_scope: string | null
          section_snapshot: string | null
          target_role: string | null
        }
        Insert: {
          actor_name_snapshot?: string | null
          actor_role_snapshot?: string | null
          actor_status_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          feature_snapshot?: string | null
          id?: string
          new_granted?: boolean | null
          new_scope?: string | null
          outcome: string
          outcome_code: string
          outcome_message?: string | null
          permission_id?: string | null
          previous_granted?: boolean | null
          previous_scope?: string | null
          requested_granted?: boolean | null
          requested_scope?: string | null
          section_snapshot?: string | null
          target_role?: string | null
        }
        Update: {
          actor_name_snapshot?: string | null
          actor_role_snapshot?: string | null
          actor_status_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          feature_snapshot?: string | null
          id?: string
          new_granted?: boolean | null
          new_scope?: string | null
          outcome?: string
          outcome_code?: string
          outcome_message?: string | null
          permission_id?: string | null
          previous_granted?: boolean | null
          previous_scope?: string | null
          requested_granted?: boolean | null
          requested_scope?: string | null
          section_snapshot?: string | null
          target_role?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          comments: Json | null
          created_at: string
          created_by: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_internal: boolean | null
          priority: string
          service_category: string
          source: string | null
          status: string
          time_spent: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          comments?: Json | null
          created_at?: string
          created_by: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_internal?: boolean | null
          priority?: string
          service_category?: string
          source?: string | null
          status?: string
          time_spent?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          comments?: Json | null
          created_at?: string
          created_by?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_internal?: boolean | null
          priority?: string
          service_category?: string
          source?: string | null
          status?: string
          time_spent?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_invoices: {
        Row: {
          client_address: string | null
          client_name: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          due_at: string
          id: string
          invoice_number: string
          issued_at: string
          last_emailed_at: string | null
          line_items: Json
          notes: string | null
          package_name: string
          package_price: number
          pdf_url: string | null
          proposal_token_id: string | null
          reminders_sent_at: Json
          service_type: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          client_address?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          due_at?: string
          id?: string
          invoice_number: string
          issued_at?: string
          last_emailed_at?: string | null
          line_items?: Json
          notes?: string | null
          package_name: string
          package_price?: number
          pdf_url?: string | null
          proposal_token_id?: string | null
          reminders_sent_at?: Json
          service_type: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          client_address?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          due_at?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          last_emailed_at?: string | null
          line_items?: Json
          notes?: string | null
          package_name?: string
          package_price?: number
          pdf_url?: string | null
          proposal_token_id?: string | null
          reminders_sent_at?: Json
          service_type?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: []
      }
      proposal_tokens: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          customer_id: string
          customer_snapshot: Json | null
          expires_at: string
          id: string
          packages_snapshot: Json | null
          proposal_data: Json | null
          proposal_record: Json | null
          selected_package: Json | null
          service_type: string | null
          status: string | null
          token: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          customer_snapshot?: Json | null
          expires_at: string
          id?: string
          packages_snapshot?: Json | null
          proposal_data?: Json | null
          proposal_record?: Json | null
          selected_package?: Json | null
          service_type?: string | null
          status?: string | null
          token: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          customer_snapshot?: Json | null
          expires_at?: string
          id?: string
          packages_snapshot?: Json | null
          proposal_data?: Json | null
          proposal_record?: Json | null
          selected_package?: Json | null
          service_type?: string | null
          status?: string | null
          token?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_tokens_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recurring_invoice_schedules: {
        Row: {
          active: boolean
          additional_lines: boolean
          additional_lines_fee: number
          client_address: string | null
          client_name: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          day_of_month: number
          frequency: string
          id: string
          last_run_at: string | null
          next_run_at: string
          notes: string | null
          package_name: string
          package_price: number
          service_type: string
          updated_at: string
          vat_rate: number
          weekend_cover: boolean
          weekend_cover_fee: number
        }
        Insert: {
          active?: boolean
          additional_lines?: boolean
          additional_lines_fee?: number
          client_address?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          day_of_month?: number
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          notes?: string | null
          package_name: string
          package_price?: number
          service_type: string
          updated_at?: string
          vat_rate?: number
          weekend_cover?: boolean
          weekend_cover_fee?: number
        }
        Update: {
          active?: boolean
          additional_lines?: boolean
          additional_lines_fee?: number
          client_address?: string | null
          client_name?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          day_of_month?: number
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string
          notes?: string | null
          package_name?: string
          package_price?: number
          service_type?: string
          updated_at?: string
          vat_rate?: number
          weekend_cover?: boolean
          weekend_cover_fee?: number
        }
        Relationships: []
      }
      scheduler_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
          updated_by: string
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      script_import_audit: {
        Row: {
          applied_mode: string
          created_at: string
          customer_id: string
          customer_updates: Json
          id: string
          new_script: string | null
          ocr_avg_confidence: number | null
          ocr_used: boolean
          old_script: string | null
          pages_processed: number | null
          quick_ref_rows: Json
          source_name: string | null
          source_size: number | null
          source_text_preview: string | null
          source_type: string
          submission_id: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          applied_mode?: string
          created_at?: string
          customer_id: string
          customer_updates?: Json
          id?: string
          new_script?: string | null
          ocr_avg_confidence?: number | null
          ocr_used?: boolean
          old_script?: string | null
          pages_processed?: number | null
          quick_ref_rows?: Json
          source_name?: string | null
          source_size?: number | null
          source_text_preview?: string | null
          source_type: string
          submission_id?: string | null
          template_id?: string | null
          user_id?: string
        }
        Update: {
          applied_mode?: string
          created_at?: string
          customer_id?: string
          customer_updates?: Json
          id?: string
          new_script?: string | null
          ocr_avg_confidence?: number | null
          ocr_used?: boolean
          old_script?: string | null
          pages_processed?: number | null
          quick_ref_rows?: Json
          source_name?: string | null
          source_size?: number | null
          source_text_preview?: string | null
          source_type?: string
          submission_id?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sensitive_data_access_log: {
        Row: {
          accessed_at: string
          accessed_by: string
          action: string
          id: string
          ip_address: unknown
          table_name: string
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          action: string
          id?: string
          ip_address?: unknown
          table_name: string
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          action?: string
          id?: string
          ip_address?: unknown
          table_name?: string
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      sensitive_data_audit: {
        Row: {
          accessed_at: string
          accessed_field: string | null
          accessed_table: string
          action: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accessed_at?: string
          accessed_field?: string | null
          accessed_table: string
          action: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accessed_at?: string
          accessed_field?: string | null
          accessed_table?: string
          action?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shift_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          id: string
          notes: string | null
          shift_instance_id: string
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          id?: string
          notes?: string | null
          shift_instance_id: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          shift_instance_id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_shift_instance_id_fkey"
            columns: ["shift_instance_id"]
            isOneToOne: false
            referencedRelation: "shift_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string
          details: Json | null
          id: string
          performed_by: string
          shift_instance_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          details?: Json | null
          id?: string
          performed_by: string
          shift_instance_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string
          shift_instance_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_audit_log_shift_instance_id_fkey"
            columns: ["shift_instance_id"]
            isOneToOne: false
            referencedRelation: "shift_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_instances: {
        Row: {
          color_code: string | null
          created_at: string
          end_time: string
          headcount_assigned: number | null
          headcount_needed: number | null
          id: string
          notes: string | null
          required_staff: number
          role_name: string | null
          shift_date: string
          start_time: string
          status: Database["public"]["Enums"]["shift_status"]
          template_id: string
          updated_at: string
        }
        Insert: {
          color_code?: string | null
          created_at?: string
          end_time: string
          headcount_assigned?: number | null
          headcount_needed?: number | null
          id?: string
          notes?: string | null
          required_staff?: number
          role_name?: string | null
          shift_date: string
          start_time: string
          status?: Database["public"]["Enums"]["shift_status"]
          template_id: string
          updated_at?: string
        }
        Update: {
          color_code?: string | null
          created_at?: string
          end_time?: string
          headcount_assigned?: number | null
          headcount_needed?: number | null
          id?: string
          notes?: string | null
          required_staff?: number
          role_name?: string | null
          shift_date?: string
          start_time?: string
          status?: Database["public"]["Enums"]["shift_status"]
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          end_time: string
          id: string
          name: string
          recurrence_pattern: Json | null
          required_staff: number
          start_time: string
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          end_time: string
          id?: string
          name: string
          recurrence_pattern?: Json | null
          required_staff?: number
          start_time: string
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          end_time?: string
          id?: string
          name?: string
          recurrence_pattern?: Json | null
          required_staff?: number
          start_time?: string
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
        }
        Relationships: []
      }
      staff_data_access_audit: {
        Row: {
          accessed_at: string
          accessed_by: string
          action: string
          data_type: string
          fields_accessed: string[] | null
          id: string
          target_user_id: string | null
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          action?: string
          data_type: string
          fields_accessed?: string[] | null
          id?: string
          target_user_id?: string | null
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          action?: string
          data_type?: string
          fields_accessed?: string[] | null
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      staff_details: {
        Row: {
          annual_leave_entitlement: number | null
          city: string | null
          contract_type: string | null
          country: string | null
          created_at: string
          department: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_relationship: string | null
          employee_id: string | null
          id: string
          line_manager_id: string | null
          name: string | null
          phone_number: string | null
          position: string | null
          postal_code: string | null
          role: string | null
          start_date: string | null
          status: string | null
          updated_at: string
          user_id: string
          working_hours_per_week: number | null
        }
        Insert: {
          annual_leave_entitlement?: number | null
          city?: string | null
          contract_type?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          id?: string
          line_manager_id?: string | null
          name?: string | null
          phone_number?: string | null
          position?: string | null
          postal_code?: string | null
          role?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
          working_hours_per_week?: number | null
        }
        Update: {
          annual_leave_entitlement?: number | null
          city?: string | null
          contract_type?: string | null
          country?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          id?: string
          line_manager_id?: string | null
          name?: string | null
          phone_number?: string | null
          position?: string | null
          postal_code?: string | null
          role?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
          working_hours_per_week?: number | null
        }
        Relationships: []
      }
      status_timing_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          status: string
          timestamp: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          status: string
          timestamp?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          status?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_users: {
        Row: {
          annual_leave_entitlement: number | null
          contract_type: string | null
          created_at: string
          department: string | null
          email: string
          employee_id: string | null
          id: string
          line_manager_id: string | null
          name: string
          phone_number: string | null
          position: string | null
          role: string
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
          working_hours_per_week: number | null
        }
        Insert: {
          annual_leave_entitlement?: number | null
          contract_type?: string | null
          created_at?: string
          department?: string | null
          email: string
          employee_id?: string | null
          id?: string
          line_manager_id?: string | null
          name: string
          phone_number?: string | null
          position?: string | null
          role?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
          working_hours_per_week?: number | null
        }
        Update: {
          annual_leave_entitlement?: number | null
          contract_type?: string | null
          created_at?: string
          department?: string | null
          email?: string
          employee_id?: string | null
          id?: string
          line_manager_id?: string | null
          name?: string
          phone_number?: string | null
          position?: string | null
          role?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          working_hours_per_week?: number | null
        }
        Relationships: []
      }
      system_users_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          performed_by: string
          target_user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by: string
          target_user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string
          target_user_id?: string
        }
        Relationships: []
      }
      task_attachments: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          related_id: string | null
          task_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          related_id?: string | null
          task_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          related_id?: string | null
          task_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          assignee_id: string | null
          completed: boolean
          created_at: string
          customer_id: string | null
          id: string
          is_internal: boolean | null
          mentioned_users: string[] | null
          notes: string | null
          priority: string | null
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          is_internal?: boolean | null
          mentioned_users?: string[] | null
          notes?: string | null
          priority?: string | null
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          completed?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          is_internal?: boolean | null
          mentioned_users?: string[] | null
          notes?: string | null
          priority?: string | null
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          sidebar_groups_state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sidebar_groups_state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sidebar_groups_state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_skills: {
        Row: {
          created_at: string
          id: string
          level: Database["public"]["Enums"]["skill_level"]
          skill_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          skill_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          skill_name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_status: {
        Row: {
          created_at: string
          custom_message: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_message?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_message?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_statuses: {
        Row: {
          auto_reset_at: string | null
          created_at: string
          id: string
          last_heartbeat_at: string
          status: string
          status_emoji: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_reset_at?: string | null
          created_at?: string
          id?: string
          last_heartbeat_at?: string
          status?: string
          status_emoji?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_reset_at?: string | null
          created_at?: string
          id?: string
          last_heartbeat_at?: string
          status?: string
          status_emoji?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_suspension_audit: {
        Row: {
          action: string
          actor_name_snapshot: string | null
          actor_role_snapshot: string | null
          actor_status_snapshot: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          from_state: Database["public"]["Enums"]["suspension_state"] | null
          id: string
          reservation_id: string | null
          to_state: Database["public"]["Enums"]["suspension_state"] | null
          user_id: string
        }
        Insert: {
          action: string
          actor_name_snapshot?: string | null
          actor_role_snapshot?: string | null
          actor_status_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          from_state?: Database["public"]["Enums"]["suspension_state"] | null
          id?: string
          reservation_id?: string | null
          to_state?: Database["public"]["Enums"]["suspension_state"] | null
          user_id: string
        }
        Update: {
          action?: string
          actor_name_snapshot?: string | null
          actor_role_snapshot?: string | null
          actor_status_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          from_state?: Database["public"]["Enums"]["suspension_state"] | null
          id?: string
          reservation_id?: string | null
          to_state?: Database["public"]["Enums"]["suspension_state"] | null
          user_id?: string
        }
        Relationships: []
      }
      user_suspension_reservation: {
        Row: {
          actor_name_snapshot: string | null
          actor_role_snapshot: string
          actor_status_snapshot: string
          actor_user_id: string
          attempt_count: number
          completed_at: string | null
          created_at: string
          executing_at: string | null
          failure_reason: string | null
          id: string
          lease_expires_at: string
          operation: Database["public"]["Enums"]["suspension_operation"]
          reason: string | null
          status: Database["public"]["Enums"]["suspension_reservation_status"]
          target_role_snapshot: string | null
          target_state_before: Database["public"]["Enums"]["suspension_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_name_snapshot?: string | null
          actor_role_snapshot: string
          actor_status_snapshot: string
          actor_user_id: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          executing_at?: string | null
          failure_reason?: string | null
          id?: string
          lease_expires_at: string
          operation: Database["public"]["Enums"]["suspension_operation"]
          reason?: string | null
          status?: Database["public"]["Enums"]["suspension_reservation_status"]
          target_role_snapshot?: string | null
          target_state_before: Database["public"]["Enums"]["suspension_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_name_snapshot?: string | null
          actor_role_snapshot?: string
          actor_status_snapshot?: string
          actor_user_id?: string
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          executing_at?: string | null
          failure_reason?: string | null
          id?: string
          lease_expires_at?: string
          operation?: Database["public"]["Enums"]["suspension_operation"]
          reason?: string | null
          status?: Database["public"]["Enums"]["suspension_reservation_status"]
          target_role_snapshot?: string | null
          target_state_before?: Database["public"]["Enums"]["suspension_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_suspension_state: {
        Row: {
          active_reservation_id: string | null
          actor_user_id: string | null
          created_at: string
          last_reconciled_at: string | null
          reason: string | null
          state: Database["public"]["Enums"]["suspension_state"]
          state_entered_at: string
          suspend_until: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          active_reservation_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          last_reconciled_at?: string | null
          reason?: string | null
          state?: Database["public"]["Enums"]["suspension_state"]
          state_entered_at?: string
          suspend_until?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          active_reservation_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          last_reconciled_at?: string | null
          reason?: string | null
          state?: Database["public"]["Enums"]["suspension_state"]
          state_entered_at?: string
          suspend_until?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_suspension_state_active_reservation_id_fkey"
            columns: ["active_reservation_id"]
            isOneToOne: false
            referencedRelation: "user_suspension_reservation"
            referencedColumns: ["id"]
          },
        ]
      }
      xero_connection: {
        Row: {
          access_token: string
          connected_by: string | null
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          tenant_id: string
          tenant_name: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          tenant_id: string
          tenant_name?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          tenant_id?: string
          tenant_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_customer_secure: {
        Args: {
          p_account_id?: string
          p_additional_services?: Json
          p_address_line1?: string
          p_address_line2?: string
          p_ai_calls_allocated?: number
          p_ai_monthly_fee?: number
          p_ai_package?: string
          p_ai_setup_fee?: number
          p_billing_day?: string
          p_billing_options?: string
          p_billing_status?: Json
          p_business_type?: string
          p_call_answering_plan?: string
          p_call_handling_tier?: string
          p_calls_per_month?: string
          p_city?: string
          p_cl_included_minutes?: number
          p_cl_overage_rate?: number
          p_cl_package?: string
          p_cl_price?: number
          p_contact?: string
          p_contacts?: Json
          p_dt_package?: string
          p_dt_price_per_minute?: number
          p_email?: string
          p_filters?: string
          p_lead_metadata?: Json
          p_locations?: Json
          p_message_selection?: string
          p_mobile?: string
          p_name: string
          p_outcome_format?: string
          p_outcome_how?: string
          p_outcome_when?: string
          p_packages?: Json
          p_phone?: string
          p_postcode?: string
          p_script?: string
          p_script_tags?: Json
          p_services?: Json
          p_skip_duplicate_check?: boolean
          p_status?: string
          p_system_icon?: string
          p_system_link?: string
          p_tel?: string
          p_va_hourly_overage_rate?: number
          p_va_package?: string
          p_va_packaged_hours?: number
          p_va_price?: number
          p_virtual_assistant_plan?: string
          p_vr_included_minutes?: number
          p_vr_overage_rate?: number
          p_vr_package?: string
          p_vr_price?: number
          p_website?: string
        }
        Returns: string
      }
      admin_create_system_user: {
        Args: {
          p_email: string
          p_name: string
          p_role: string
          p_status: string
          p_user_id: string
        }
        Returns: string
      }
      admin_delete_system_user: { Args: { p_id: string }; Returns: undefined }
      admin_reinstate_user: {
        Args: { p_reason?: string; p_target_user_id: string }
        Returns: {
          message: string
          outcome: string
        }[]
      }
      admin_suspend_user: {
        Args: {
          p_reason: string
          p_suspend_until?: string
          p_target_user_id: string
        }
        Returns: {
          message: string
          outcome: string
        }[]
      }
      admin_update_system_user: {
        Args: {
          p_account_number?: string
          p_annual_leave_days?: number
          p_bank_address?: string
          p_bank_name?: string
          p_carried_over_days?: number
          p_christmas_closure_days?: number
          p_current_address?: string
          p_current_post_code?: string
          p_date_of_birth?: string
          p_department?: string
          p_disability?: string
          p_disability_category?: string
          p_email?: string
          p_emergency_address?: string
          p_emergency_name?: string
          p_emergency_phone?: string
          p_emergency_relationship?: string
          p_ethnicity?: string
          p_gender?: string
          p_home_phone?: string
          p_id: string
          p_job_title?: string
          p_marital_status?: string
          p_mobile_phone?: string
          p_name?: string
          p_national_insurance?: string
          p_nationality?: string
          p_permanent_address?: string
          p_permanent_post_code?: string
          p_personal_days?: number
          p_public_holidays?: number
          p_role?: string
          p_sick_leave_days?: number
          p_sort_code?: string
          p_start_date?: string
          p_status?: string
          p_title?: string
        }
        Returns: undefined
      }
      append_todo_note: {
        Args: { p_author_name?: string; p_body: string; p_task_id: string }
        Returns: string
      }
      apply_leave_quota_defaults: {
        Args: { p_year: number }
        Returns: undefined
      }
      approve_holiday_request_secure:
        | { Args: { p_request_id: string }; Returns: Json }
        | {
            Args: {
              p_convert_to_unpaid?: boolean
              p_override?: boolean
              p_request_id: string
            }
            Returns: Json
          }
      build_task_assignment_message: {
        Args: { p_assigner: string; p_task_id: string }
        Returns: string
      }
      calculate_working_days: {
        Args: { end_date: string; start_date: string }
        Returns: number
      }
      can_access_sensitive_financial_data: { Args: never; Returns: boolean }
      can_access_task: { Args: { p_task_id: string }; Returns: boolean }
      can_manage_user_suspension: { Args: never; Returns: boolean }
      cancel_holiday_request_secure: {
        Args: { request_id: string }
        Returns: boolean
      }
      check_login_allowed: {
        Args: { p_email: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      checklist_compute_due_times: {
        Args: {
          p_custom_times: Json
          p_frequency: Database["public"]["Enums"]["checklist_frequency"]
          p_shift_end: string
          p_shift_start: string
        }
        Returns: {
          due_time: string
          idx: number
          label: string
        }[]
      }
      cleanup_expired_chat_attachments: { Args: never; Returns: number }
      clear_chat_room: { Args: { p_room_id: string }; Returns: undefined }
      clear_failed_logins: { Args: { p_email: string }; Returns: undefined }
      clear_holiday_approval_notifications: {
        Args: { p_request_id: string }
        Returns: number
      }
      complete_checklist_instance: {
        Args: { p_id: string; p_notes?: string }
        Returns: undefined
      }
      complete_reservation: {
        Args: {
          p_failure_reason?: string
          p_reservation_id: string
          p_success: boolean
        }
        Returns: {
          message: string
          outcome: string
        }[]
      }
      count_effective_active_super_admins: { Args: never; Returns: number }
      create_direct_message_room: {
        Args: { target_user_id: string }
        Returns: string
      }
      create_holiday_request_secure: {
        Args: {
          p_absence_type: string
          p_end_date: string
          p_reason?: string
          p_start_date: string
          p_target_user_id?: string
        }
        Returns: string
      }
      create_private_channel: {
        Args: { p_member_ids: string[]; p_name: string }
        Returns: string
      }
      create_task_notification:
        | {
            Args: {
              p_message: string
              p_recipient_id: string
              p_task_id: string
              p_type?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_message: string
              p_recipient_id: string
              p_related_id?: string
              p_task_id: string
              p_type?: string
            }
            Returns: Json
          }
      current_user_has_permission: {
        Args: { _feature: string; _section: string }
        Returns: boolean
      }
      decline_holiday_request_secure: {
        Args: {
          approver_id?: string
          p_decline_reason: string
          request_id: string
        }
        Returns: string
      }
      delete_chat_message: { Args: { _message_id: string }; Returns: boolean }
      delete_chat_room: { Args: { p_room_id: string }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_required_team_chat_memberships: { Args: never; Returns: undefined }
      ensure_required_team_chat_rooms: { Args: never; Returns: undefined }
      expire_stale_reservations: {
        Args: { p_batch_size?: number }
        Returns: {
          expired_count: number
        }[]
      }
      find_customer_duplicates: {
        Args: {
          p_address: string
          p_email: string
          p_exclude_id: string
          p_mobile: string
          p_name: string
          p_phone: string
        }
        Returns: {
          id: string
          name: string
          reasons: string[]
          score: number
        }[]
      }
      flag_suspension_incident: {
        Args: { p_reason: string; p_user_id: string }
        Returns: {
          message: string
          outcome: string
        }[]
      }
      generate_billing_for_period: {
        Args: { p_customer_id?: string; p_period: string }
        Returns: undefined
      }
      generate_checklist_for_all_users: {
        Args: { p_date?: string }
        Returns: number
      }
      generate_checklist_for_user: {
        Args: { p_date?: string; p_user_id: string }
        Returns: number
      }
      generate_checklist_for_user_internal: {
        Args: { p_date?: string; p_user_id: string }
        Returns: number
      }
      generate_due_recurring_invoices: {
        Args: never
        Returns: {
          invoice_id: string
          invoice_number: string
          schedule_id: string
        }[]
      }
      generate_internal_invoice_for_period: {
        Args: { p_customer_id: string; p_period_label: string }
        Returns: string
      }
      generate_internal_invoices_for_period: {
        Args: { p_period_label: string }
        Returns: number
      }
      generate_shift_instances: {
        Args: {
          end_date_param: string
          start_date_param: string
          template_id_param: string
        }
        Returns: number
      }
      get_active_staff_minimal: {
        Args: never
        Returns: {
          id: string
          name: string
          role: string
        }[]
      }
      get_active_users_for_admin: {
        Args: never
        Returns: {
          id: string
          name: string
          role: string
          user_id: string
        }[]
      }
      get_all_basic_user_profiles: {
        Args: never
        Returns: {
          annual_leave_entitlement: number
          auth_user_id: string
          city: string
          contract_type: string
          country: string
          created_at: string
          department: string
          email: string
          employee_id: string
          id: string
          is_staff_member: boolean
          is_system_user: boolean
          job_position: string
          name: string
          phone_number: string
          role: string
          start_date: string
          status: string
          updated_at: string
          working_hours_per_week: number
        }[]
      }
      get_all_customers_secure: {
        Args: never
        Returns: {
          account_id: string | null
          additional_services: Json | null
          address: string | null
          address_line1: string | null
          address_line2: string | null
          ai_calls_allocated: number | null
          ai_monthly_fee: number | null
          ai_package: string | null
          ai_price: number | null
          ai_setup_fee: number | null
          billing_day: string | null
          billing_options: string | null
          billing_status: Json | null
          business_type: string | null
          call_answering_plan: string | null
          call_base_allowance: number | null
          call_billing_unit: string | null
          call_handling_tier: string | null
          call_included_minutes: number | null
          call_monthly_charge: number | null
          call_package_name: string | null
          call_rate_per_call: number | null
          call_rate_per_minute: number | null
          call_rate_sms: number | null
          call_rate_transfer_landline: number | null
          call_rate_transfer_mobile: number | null
          calls_per_month: string | null
          cb_included_minutes: number | null
          cb_overage_rate: number | null
          cb_package: string | null
          cb_price: number | null
          city: string | null
          cl_included_minutes: number | null
          cl_overage_rate: number | null
          cl_package: string | null
          cl_price: number | null
          contact: string | null
          contacts: Json | null
          created_at: string
          direct_dial_number: boolean
          dt_package: string | null
          dt_price: number | null
          dt_price_per_minute: number | null
          email: string | null
          filters: string | null
          has_inbound_call_script: boolean
          id: string
          lead_metadata: Json | null
          locations: Json | null
          message_selection: string | null
          mobile: string | null
          name: string
          outcome_format: string | null
          outcome_how: string | null
          outcome_when: string | null
          packages: Json | null
          phone: string | null
          postcode: string | null
          script: string | null
          script_field_mappings: Json
          script_tags: Json | null
          services: Json | null
          status: string
          system_icon: string | null
          system_link: string | null
          tel: string | null
          updated_at: string
          user_id: string
          va_hourly_overage_rate: number | null
          va_package: string | null
          va_packaged_hours: number | null
          va_price: number | null
          vat_rate: number | null
          virtual_assistant_plan: string | null
          vr_included_minutes: number | null
          vr_overage_rate: number | null
          vr_package: string | null
          vr_price: number | null
          website: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_all_system_users_for_management_secure: {
        Args: never
        Returns: {
          address_masked: string
          annual_leave_days: number
          carried_over_days: number
          christmas_closure_days: number
          date_of_birth: string
          department: string
          email: string
          home_phone_masked: string
          id: string
          job_title: string
          mobile_phone_masked: string
          name: string
          personal_days: number
          public_holidays: number
          role: string
          sick_leave_days: number
          start_date: string
          status: string
          user_id: string
        }[]
      }
      get_all_system_users_minimal: {
        Args: never
        Returns: {
          id: string
          name: string
          role: string
          status: string
          user_id: string
        }[]
      }
      get_assignable_comprehensive_users: {
        Args: never
        Returns: {
          department: string
          id: string
          job_position: string
          name: string
          role: string
          status: string
        }[]
      }
      get_basic_user_profile: {
        Args: never
        Returns: {
          annual_leave_entitlement: number
          auth_user_id: string
          city: string
          contract_type: string
          country: string
          created_at: string
          department: string
          email: string
          employee_id: string
          id: string
          is_staff_member: boolean
          is_system_user: boolean
          job_position: string
          name: string
          phone_number: string
          role: string
          start_date: string
          status: string
          updated_at: string
          working_hours_per_week: number
        }[]
      }
      get_channel_members: {
        Args: { p_room_id: string }
        Returns: {
          name: string
          user_id: string
        }[]
      }
      get_current_user_role: { Args: never; Returns: string }
      get_dm_candidates: {
        Args: never
        Returns: {
          id: string
          name: string
          role: string
          status: string
        }[]
      }
      get_email_send_log_admin: {
        Args: { p_limit?: number; p_template?: string }
        Returns: {
          created_at: string
          error_message: string
          message_id: string
          recipient_email: string
          status: string
          template_name: string
        }[]
      }
      get_employee_basic_info_secure: {
        Args: never
        Returns: {
          auth_user_id: string
          created_at: string
          department: string
          email: string
          id: string
          is_system_user: boolean
          job_position: string
          name: string
          phone_number: string
          role: string
          status: string
          updated_at: string
        }[]
      }
      get_employee_sensitive_data_secure: {
        Args: { access_reason: string; target_user_id: string }
        Returns: {
          created_at: string
          date_of_birth: string
          emergency_contact_name: string
          emergency_contact_phone: string
          emergency_contact_relationship: string
          full_address: string
          updated_at: string
          user_id: string
        }[]
      }
      get_holiday_admin_overview: {
        Args: { p_year?: number }
        Returns: {
          annual_leave_entitlement: number
          annual_leave_used: number
          auth_user_id: string
          bank_holidays: number
          carried_over: number
          christmas_closure: number
          department: string
          email: string
          name: string
          pending_requests: number
          personal_days_entitlement: number
          personal_days_used: number
          role: string
          sick_leave_entitlement: number
          sick_leave_used: number
          system_user_id: string
        }[]
      }
      get_my_basic_staff_info: {
        Args: never
        Returns: {
          city: string
          contract_type: string
          country: string
          created_at: string
          department: string
          emergency_contact_name: string
          emergency_contact_phone: string
          emergency_contact_relationship: string
          employee_id: string
          id: string
          phone_number: string
          staff_position: string
          updated_at: string
          user_id: string
          working_hours_per_week: number
        }[]
      }
      get_my_holiday_overview: {
        Args: { p_year?: number }
        Returns: {
          annual_leave_entitlement: number
          annual_leave_used: number
          carried_over: number
          entitlement_id: string
          personal_days_entitlement: number
          personal_days_used: number
          requests: Json
          sick_leave_entitlement: number
          sick_leave_used: number
        }[]
      }
      get_my_holiday_requests_strict: {
        Args: never
        Returns: {
          absence_type: Database["public"]["Enums"]["absence_type"]
          approved_at: string | null
          approved_by: string | null
          created_at: string
          decline_reason: string | null
          end_date: string
          google_calendar_event_id: string | null
          id: string
          is_unpaid: boolean
          notes: string | null
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          system_user_id: string | null
          total_days: number | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "holiday_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_permissions: {
        Args: never
        Returns: {
          feature: string
          granted: boolean
          scope: string
          section: string
        }[]
      }
      get_my_suspension_status: {
        Args: never
        Returns: {
          effective_status: string
          is_suspended: boolean
          reason: string
          state: Database["public"]["Enums"]["suspension_state"]
          state_entered_at: string
          suspend_until: string
        }[]
      }
      get_my_system_user_id: { Args: never; Returns: string }
      get_notification_channels: {
        Args: { p_event_type: string; p_recipient_id: string }
        Returns: {
          email: boolean
          in_app: boolean
          push: boolean
          recipient_email: string
        }[]
      }
      get_permissions_matrix_secure: {
        Args: never
        Returns: {
          description: string
          feature: string
          granted: boolean
          icon: string
          id: string
          role: string
          scope: string
          section: string
        }[]
      }
      get_remaining_leave_days: {
        Args: { user_uuid: string }
        Returns: {
          annual_leave_remaining: number
          personal_days_remaining: number
          sick_leave_remaining: number
        }[]
      }
      get_staff_basic_info_secure: {
        Args: never
        Returns: {
          department: string
          email: string
          id: string
          name: string
          role: string
          status: string
        }[]
      }
      get_staff_data_secure_with_audit: {
        Args: { access_reason: string }
        Returns: {
          annual_leave_entitlement: number | null
          city: string | null
          contract_type: string | null
          country: string | null
          created_at: string
          department: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_relationship: string | null
          employee_id: string | null
          id: string
          line_manager_id: string | null
          name: string | null
          phone_number: string | null
          position: string | null
          postal_code: string | null
          role: string | null
          start_date: string | null
          status: string | null
          updated_at: string
          user_id: string
          working_hours_per_week: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "staff_details"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_system_user_holiday_breakdown: {
        Args: never
        Returns: {
          annual_leave_days: number
          bank_holidays: number
          base_entitlement: number
          christmas_closure: number
          christmas_closure_days: number
          personal_days_remaining: number
          personal_remaining: number
          personal_taken: number
          public_holidays: number
          sick_leave_remaining: number
        }[]
      }
      get_system_user_name_secure: {
        Args: { system_user_id: string }
        Returns: {
          name: string
        }[]
      }
      get_user_display_name: {
        Args: { target_user_id: string }
        Returns: string
      }
      get_user_suspension_history: {
        Args: { p_target_user_id: string }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          from_state: Database["public"]["Enums"]["suspension_state"]
          id: string
          reason: string
          suspend_until: string
          to_state: Database["public"]["Enums"]["suspension_state"]
        }[]
      }
      get_user_suspension_overview: {
        Args: never
        Returns: {
          actor_name: string
          actor_user_id: string
          effective_status: string
          is_suspended: boolean
          reason: string
          state: Database["public"]["Enums"]["suspension_state"]
          state_entered_at: string
          suspend_until: string
          user_id: string
        }[]
      }
      get_users_on_holiday_today: {
        Args: never
        Returns: {
          absence_type: string
          end_date: string
          is_unpaid: boolean
          name: string
          request_id: string
          start_date: string
          system_user_id: string
          user_id: string
        }[]
      }
      get_xero_connection_metadata: {
        Args: never
        Returns: {
          connected_at: string
          expires_at: string
          id: string
          tenant_id: string
          tenant_name: string
          updated_at: string
        }[]
      }
      has_billing_access: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_user_status: { Args: never; Returns: undefined }
      is_admin_or_higher: { Args: never; Returns: boolean }
      is_admin_strictly: { Args: never; Returns: boolean }
      is_chat_room_member: { Args: { p_room_id: string }; Returns: boolean }
      is_locked_admin_permission: {
        Args: { p_feature: string; p_section: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      log_sensitive_data_access: {
        Args: { action: string; employee_id: string }
        Returns: undefined
      }
      mark_overdue_checklist: { Args: never; Returns: number }
      mark_reservation_executing: {
        Args: { p_reservation_id: string }
        Returns: {
          message: string
          outcome: string
        }[]
      }
      mark_self_offline: { Args: never; Returns: undefined }
      mark_stale_users_offline: { Args: never; Returns: number }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_address: { Args: { p: string }; Returns: string }
      normalize_customer_name: { Args: { p: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      notify_task_assignment: {
        Args: {
          p_assignee_id: string
          p_message: string
          p_task_id: string
          p_type?: string
        }
        Returns: Json
      }
      pick_next_email_assignee: { Args: never; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_expired_suspensions: {
        Args: { p_user_id?: string }
        Returns: {
          reconciled_count: number
        }[]
      }
      record_failed_login: { Args: { p_email: string }; Returns: undefined }
      recover_suspension_incident: {
        Args: {
          p_reason?: string
          p_target_state: Database["public"]["Enums"]["suspension_state"]
          p_user_id: string
        }
        Returns: {
          message: string
          outcome: string
        }[]
      }
      regenerate_all_user_checklists_today: { Args: never; Returns: number }
      rename_channel: {
        Args: { p_name: string; p_room_id: string }
        Returns: undefined
      }
      reserve_user_suspension: {
        Args: {
          p_lease_seconds?: number
          p_operation: Database["public"]["Enums"]["suspension_operation"]
          p_reason: string
          p_target_user_id: string
        }
        Returns: {
          message: string
          outcome: string
          reservation_id: string
        }[]
      }
      resolve_auth_user_id: { Args: { p_id: string }; Returns: string }
      save_checklist_instance_note: {
        Args: { p_id: string; p_notes: string }
        Returns: string
      }
      send_checklist_reminders: { Args: never; Returns: number }
      set_todo_completed: {
        Args: { p_completed: boolean; p_id: string }
        Returns: {
          assignee_id: string | null
          completed: boolean
          created_at: string
          customer_id: string | null
          id: string
          is_internal: boolean | null
          mentioned_users: string[] | null
          notes: string | null
          priority: string | null
          text: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "todos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      skip_checklist_instance: {
        Args: { p_id: string; p_reason: string; p_status?: string }
        Returns: undefined
      }
      update_basic_user_info: {
        Args: { new_phone_number?: string; user_uuid: string }
        Returns: undefined
      }
      update_channel_members: {
        Args: { p_member_ids: string[]; p_room_id: string }
        Returns: undefined
      }
      update_customer_contact_ooo: {
        Args: {
          p_contact_id: string
          p_customer_id: string
          p_from: string
          p_reason: string
          p_until: string
        }
        Returns: Json
      }
      update_customer_lead_metadata: {
        Args: { p_id: string; p_lead_metadata?: Json; p_status?: string }
        Returns: boolean
      }
      update_customer_script: {
        Args: { p_id: string; p_script?: string; p_script_tags?: Json }
        Returns: undefined
      }
      update_customer_secure: {
        Args: {
          p_account_id?: string
          p_additional_services?: Json
          p_address_line1?: string
          p_address_line2?: string
          p_ai_calls_allocated?: number
          p_ai_monthly_fee?: number
          p_ai_package?: string
          p_ai_setup_fee?: number
          p_billing_day?: string
          p_billing_options?: string
          p_billing_status?: Json
          p_business_type?: string
          p_call_answering_plan?: string
          p_call_handling_tier?: string
          p_calls_per_month?: string
          p_city?: string
          p_cl_included_minutes?: number
          p_cl_overage_rate?: number
          p_cl_package?: string
          p_cl_price?: number
          p_clear_account?: boolean
          p_contact?: string
          p_contacts?: Json
          p_dt_package?: string
          p_dt_price_per_minute?: number
          p_email?: string
          p_filters?: string
          p_id: string
          p_lead_metadata?: Json
          p_locations?: Json
          p_message_selection?: string
          p_mobile?: string
          p_name?: string
          p_outcome_format?: string
          p_outcome_how?: string
          p_outcome_when?: string
          p_packages?: Json
          p_phone?: string
          p_postcode?: string
          p_script?: string
          p_script_tags?: Json
          p_services?: Json
          p_status?: string
          p_system_icon?: string
          p_system_link?: string
          p_tel?: string
          p_va_hourly_overage_rate?: number
          p_va_package?: string
          p_va_packaged_hours?: number
          p_va_price?: number
          p_virtual_assistant_plan?: string
          p_vr_included_minutes?: number
          p_vr_overage_rate?: number
          p_vr_package?: string
          p_vr_price?: number
          p_website?: string
        }
        Returns: undefined
      }
      update_permission_grant: {
        Args: {
          p_granted: boolean
          p_permission_id: string
          p_role: string
          p_scope: string
        }
        Returns: {
          audit_id: string
          new_granted: boolean
          new_scope: string
          outcome: string
          outcome_code: string
          outcome_message: string
          previous_granted: boolean
          previous_scope: string
        }[]
      }
      update_todo_note_body: {
        Args: { p_body: string; p_note_created_at: string; p_task_id: string }
        Returns: string
      }
      upsert_leave_quota_defaults: {
        Args: {
          p_bank_holidays?: number
          p_base_annual?: number
          p_christmas_closure_days?: number
          p_year: number
        }
        Returns: undefined
      }
      verify_dashboard_permissions: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          status: string
        }[]
      }
    }
    Enums: {
      absence_type:
        | "annual_leave"
        | "sick_leave"
        | "maternity_leave"
        | "paternity_leave"
        | "compassionate_leave"
        | "study_leave"
        | "unpaid_leave"
        | "public_holiday"
      assignment_status: "assigned" | "open" | "at_risk" | "cancelled"
      audit_action:
        | "created"
        | "assigned"
        | "unassigned"
        | "modified"
        | "cancelled"
        | "swapped"
      chat_room_type: "general" | "dm"
      checklist_frequency:
        | "once"
        | "twice"
        | "three_times"
        | "hourly"
        | "two_hourly"
        | "morning"
        | "afternoon"
        | "end_of_shift"
        | "custom"
      checklist_instance_status:
        | "not_started"
        | "completed"
        | "overdue"
        | "skipped"
        | "not_applicable"
      checklist_priority: "low" | "medium" | "high" | "critical"
      checklist_shift_scope:
        | "all"
        | "morning"
        | "afternoon"
        | "evening"
        | "weekend"
        | "custom"
      profile_status: "Active" | "On Leave" | "Inactive" | "Suspended"
      request_status: "pending" | "approved" | "declined" | "cancelled"
      shift_status: "draft" | "active" | "cancelled" | "completed"
      skill_level: "required" | "preferred" | "nice_to_have"
      suspension_operation: "suspend" | "unsuspend"
      suspension_reservation_status:
        | "pending"
        | "executing"
        | "completed"
        | "failed"
        | "expired"
      suspension_state:
        | "active"
        | "suspend_pending"
        | "suspended"
        | "unsuspend_pending"
        | "incident"
      user_role: "Operator" | "Supervisor" | "Admin" | "Super-Admin" | "HR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      absence_type: [
        "annual_leave",
        "sick_leave",
        "maternity_leave",
        "paternity_leave",
        "compassionate_leave",
        "study_leave",
        "unpaid_leave",
        "public_holiday",
      ],
      assignment_status: ["assigned", "open", "at_risk", "cancelled"],
      audit_action: [
        "created",
        "assigned",
        "unassigned",
        "modified",
        "cancelled",
        "swapped",
      ],
      chat_room_type: ["general", "dm"],
      checklist_frequency: [
        "once",
        "twice",
        "three_times",
        "hourly",
        "two_hourly",
        "morning",
        "afternoon",
        "end_of_shift",
        "custom",
      ],
      checklist_instance_status: [
        "not_started",
        "completed",
        "overdue",
        "skipped",
        "not_applicable",
      ],
      checklist_priority: ["low", "medium", "high", "critical"],
      checklist_shift_scope: [
        "all",
        "morning",
        "afternoon",
        "evening",
        "weekend",
        "custom",
      ],
      profile_status: ["Active", "On Leave", "Inactive", "Suspended"],
      request_status: ["pending", "approved", "declined", "cancelled"],
      shift_status: ["draft", "active", "cancelled", "completed"],
      skill_level: ["required", "preferred", "nice_to_have"],
      suspension_operation: ["suspend", "unsuspend"],
      suspension_reservation_status: [
        "pending",
        "executing",
        "completed",
        "failed",
        "expired",
      ],
      suspension_state: [
        "active",
        "suspend_pending",
        "suspended",
        "unsuspend_pending",
        "incident",
      ],
      user_role: ["Operator", "Supervisor", "Admin", "Super-Admin", "HR"],
    },
  },
} as const
