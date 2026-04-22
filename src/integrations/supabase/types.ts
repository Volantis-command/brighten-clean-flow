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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      alert_tiers: {
        Row: {
          enabled: boolean
          event_type: string
          id: string
          tier: string
          updated_at: string | null
        }
        Insert: {
          enabled?: boolean
          event_type: string
          id?: string
          tier: string
          updated_at?: string | null
        }
        Update: {
          enabled?: boolean
          event_type?: string
          id?: string
          tier?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      booking_suggestions: {
        Row: {
          checkin_date: string | null
          checkout_date: string | null
          created_at: string | null
          created_job_id: string | null
          decided_at: string | null
          decided_by: string | null
          external_ref: string | null
          guest_name: string | null
          id: string
          property_id: string | null
          source: string
          status: string | null
          suggested_clean_date: string | null
          suggested_clean_time: string | null
        }
        Insert: {
          checkin_date?: string | null
          checkout_date?: string | null
          created_at?: string | null
          created_job_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          external_ref?: string | null
          guest_name?: string | null
          id?: string
          property_id?: string | null
          source: string
          status?: string | null
          suggested_clean_date?: string | null
          suggested_clean_time?: string | null
        }
        Update: {
          checkin_date?: string | null
          checkout_date?: string | null
          created_at?: string | null
          created_job_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          external_ref?: string | null
          guest_name?: string | null
          id?: string
          property_id?: string | null
          source?: string
          status?: string | null
          suggested_clean_date?: string | null
          suggested_clean_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_suggestions_created_job_id_fkey"
            columns: ["created_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_suggestions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          id: string
          key: string
          label: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          label?: string | null
          updated_at?: string | null
          value?: string
        }
        Update: {
          id?: string
          key?: string
          label?: string | null
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      clean_requests: {
        Row: {
          attention_areas: Json | null
          clean_type: string | null
          client_id: string
          created_at: string | null
          frequency: string | null
          id: string
          notes: string | null
          preferred_time: string | null
          property_id: string | null
          requested_date: string | null
          same_cleaner: boolean | null
          status: string | null
        }
        Insert: {
          attention_areas?: Json | null
          clean_type?: string | null
          client_id: string
          created_at?: string | null
          frequency?: string | null
          id?: string
          notes?: string | null
          preferred_time?: string | null
          property_id?: string | null
          requested_date?: string | null
          same_cleaner?: boolean | null
          status?: string | null
        }
        Update: {
          attention_areas?: Json | null
          clean_type?: string | null
          client_id?: string
          created_at?: string | null
          frequency?: string | null
          id?: string
          notes?: string | null
          preferred_time?: string | null
          property_id?: string | null
          requested_date?: string | null
          same_cleaner?: boolean | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clean_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_availability: {
        Row: {
          available: boolean
          created_at: string
          date: string
          id: string
          user_id: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          date: string
          id?: string
          user_id: string
        }
        Update: {
          available?: boolean
          created_at?: string
          date?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      cleaner_job_tokens: {
        Row: {
          created_at: string | null
          id: string
          job_id: string
          staff_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id: string
          staff_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string
          staff_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaner_job_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaner_job_tokens_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_onboarding: {
        Row: {
          abn: string | null
          abn_confirmed: boolean | null
          bank_account: string | null
          bank_bsb: string | null
          bank_name: string | null
          chemical_quiz_attempts: number | null
          chemical_quiz_passed: boolean | null
          chemical_quiz_score: number | null
          created_at: string
          date_of_birth: string | null
          digital_signature: string | null
          director_approved: boolean | null
          drivers_licence_expiry: string | null
          drivers_licence_url: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          gst_registered: boolean | null
          id: string
          id_document_type: string | null
          id_document_url: string | null
          mobile: string | null
          onboarding_complete: boolean | null
          police_check_date: string | null
          police_check_url: string | null
          profile_photo_url: string | null
          public_liability_expiry: string | null
          public_liability_url: string | null
          signed_at: string | null
          sop_acknowledged_at: string | null
          sop_chemical_acknowledged_at: string | null
          sop_conduct_acknowledged_at: string | null
          sop_consumables_acknowledged_at: string | null
          sop_linen_acknowledged_at: string | null
          sop_master_acknowledged_at: string | null
          sops_resign_due: string | null
          suburb: string | null
          uniform_received: boolean | null
          user_id: string
          vehicle_rego: string | null
          vevo_check_url: string | null
          vevo_required: boolean | null
          vevo_verified_at: string | null
        }
        Insert: {
          abn?: string | null
          abn_confirmed?: boolean | null
          bank_account?: string | null
          bank_bsb?: string | null
          bank_name?: string | null
          chemical_quiz_attempts?: number | null
          chemical_quiz_passed?: boolean | null
          chemical_quiz_score?: number | null
          created_at?: string
          date_of_birth?: string | null
          digital_signature?: string | null
          director_approved?: boolean | null
          drivers_licence_expiry?: string | null
          drivers_licence_url?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gst_registered?: boolean | null
          id?: string
          id_document_type?: string | null
          id_document_url?: string | null
          mobile?: string | null
          onboarding_complete?: boolean | null
          police_check_date?: string | null
          police_check_url?: string | null
          profile_photo_url?: string | null
          public_liability_expiry?: string | null
          public_liability_url?: string | null
          signed_at?: string | null
          sop_acknowledged_at?: string | null
          sop_chemical_acknowledged_at?: string | null
          sop_conduct_acknowledged_at?: string | null
          sop_consumables_acknowledged_at?: string | null
          sop_linen_acknowledged_at?: string | null
          sop_master_acknowledged_at?: string | null
          sops_resign_due?: string | null
          suburb?: string | null
          uniform_received?: boolean | null
          user_id: string
          vehicle_rego?: string | null
          vevo_check_url?: string | null
          vevo_required?: boolean | null
          vevo_verified_at?: string | null
        }
        Update: {
          abn?: string | null
          abn_confirmed?: boolean | null
          bank_account?: string | null
          bank_bsb?: string | null
          bank_name?: string | null
          chemical_quiz_attempts?: number | null
          chemical_quiz_passed?: boolean | null
          chemical_quiz_score?: number | null
          created_at?: string
          date_of_birth?: string | null
          digital_signature?: string | null
          director_approved?: boolean | null
          drivers_licence_expiry?: string | null
          drivers_licence_url?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gst_registered?: boolean | null
          id?: string
          id_document_type?: string | null
          id_document_url?: string | null
          mobile?: string | null
          onboarding_complete?: boolean | null
          police_check_date?: string | null
          police_check_url?: string | null
          profile_photo_url?: string | null
          public_liability_expiry?: string | null
          public_liability_url?: string | null
          signed_at?: string | null
          sop_acknowledged_at?: string | null
          sop_chemical_acknowledged_at?: string | null
          sop_conduct_acknowledged_at?: string | null
          sop_consumables_acknowledged_at?: string | null
          sop_linen_acknowledged_at?: string | null
          sop_master_acknowledged_at?: string | null
          sops_resign_due?: string | null
          suburb?: string | null
          uniform_received?: boolean | null
          user_id?: string
          vehicle_rego?: string | null
          vevo_check_url?: string | null
          vevo_required?: boolean | null
          vevo_verified_at?: string | null
        }
        Relationships: []
      }
      client_comms: {
        Row: {
          client_id: string
          id: string
          job_id: string | null
          message_body: string
          sent_at: string | null
          sent_by: string | null
        }
        Insert: {
          client_id: string
          id?: string
          job_id?: string | null
          message_body: string
          sent_at?: string | null
          sent_by?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          job_id?: string | null
          message_body?: string
          sent_at?: string | null
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_comms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_comms_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_messages: {
        Row: {
          client_id: string
          direction: string
          id: string
          message: string
          property_id: string | null
          read_at: string | null
          sent_at: string | null
        }
        Insert: {
          client_id: string
          direction?: string
          id?: string
          message: string
          property_id?: string | null
          read_at?: string | null
          sent_at?: string | null
        }
        Update: {
          client_id?: string
          direction?: string
          id?: string
          message?: string
          property_id?: string | null
          read_at?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      client_properties: {
        Row: {
          client_id: string
          created_at: string | null
          guest_ready_sms: boolean | null
          id: string
          onboard_token: string | null
          onboard_used: boolean | null
          onboarding_sent_at: string | null
          portal_active: boolean | null
          portal_link_sent_at: string | null
          portal_token: string | null
          property_id: string
          show_invoices: boolean | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          guest_ready_sms?: boolean | null
          id?: string
          onboard_token?: string | null
          onboard_used?: boolean | null
          onboarding_sent_at?: string | null
          portal_active?: boolean | null
          portal_link_sent_at?: string | null
          portal_token?: string | null
          property_id: string
          show_invoices?: boolean | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          guest_ready_sms?: boolean | null
          id?: string
          onboard_token?: string | null
          onboard_used?: boolean | null
          onboarding_sent_at?: string | null
          portal_active?: boolean | null
          portal_link_sent_at?: string | null
          portal_token?: string | null
          property_id?: string
          show_invoices?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "client_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          used: boolean
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean
        }
        Relationships: []
      }
      clock_events: {
        Row: {
          created_at: string
          distance_from_property_m: number | null
          duration_minutes: number | null
          event_at: string
          event_type: string
          geofence_warning: boolean | null
          id: string
          job_id: string | null
          lat: number | null
          lng: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          distance_from_property_m?: number | null
          duration_minutes?: number | null
          event_at?: string
          event_type: string
          geofence_warning?: boolean | null
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          distance_from_property_m?: number | null
          duration_minutes?: number | null
          event_at?: string
          event_type?: string
          geofence_warning?: boolean | null
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_config: {
        Row: {
          access_token: string | null
          add_cleaner: boolean
          auto_create_event: boolean
          calendar_id: string | null
          created_at: string
          email: string | null
          id: string
          invite_client: boolean
          refresh_token: string | null
          token_expiry: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          add_cleaner?: boolean
          auto_create_event?: boolean
          calendar_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invite_client?: boolean
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          add_cleaner?: boolean
          auto_create_event?: boolean
          calendar_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invite_client?: boolean
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      guesty_config: {
        Row: {
          access_token: string | null
          account_name: string | null
          api_key: string | null
          auto_create_job: boolean
          buffer_hours: number
          client_id: string | null
          client_secret: string | null
          created_at: string
          default_clean_type: string
          id: string
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_name?: string | null
          api_key?: string | null
          auto_create_job?: boolean
          buffer_hours?: number
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          default_clean_type?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_name?: string | null
          api_key?: string | null
          auto_create_job?: boolean
          buffer_hours?: number
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          default_clean_type?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      job_acceptances: {
        Row: {
          acceptance_status: string
          cleaner_id: string
          created_at: string
          id: string
          job_id: string
          responded_at: string | null
          sms_sent_at: string | null
        }
        Insert: {
          acceptance_status?: string
          cleaner_id: string
          created_at?: string
          id?: string
          job_id: string
          responded_at?: string | null
          sms_sent_at?: string | null
        }
        Update: {
          acceptance_status?: string
          cleaner_id?: string
          created_at?: string
          id?: string
          job_id?: string
          responded_at?: string | null
          sms_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_acceptances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_checklist_completions: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          id: string
          job_id: string
          sop_item_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          id?: string
          job_id: string
          sop_item_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          id?: string
          job_id?: string
          sop_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_checklist_completions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_checklist_completions_sop_item_id_fkey"
            columns: ["sop_item_id"]
            isOneToOne: false
            referencedRelation: "property_sop_items"
            referencedColumns: ["id"]
          },
        ]
      }
      job_feedback: {
        Row: {
          attention_areas: Json | null
          client_id: string
          comments: string | null
          created_at: string | null
          feedback_token: string | null
          id: string
          job_id: string | null
          nps_score: number | null
          photo_urls: Json | null
          property_id: string | null
          reasons: Json | null
          same_cleaner_preference: string | null
          score: number | null
          submitted_at: string | null
        }
        Insert: {
          attention_areas?: Json | null
          client_id: string
          comments?: string | null
          created_at?: string | null
          feedback_token?: string | null
          id?: string
          job_id?: string | null
          nps_score?: number | null
          photo_urls?: Json | null
          property_id?: string | null
          reasons?: Json | null
          same_cleaner_preference?: string | null
          score?: number | null
          submitted_at?: string | null
        }
        Update: {
          attention_areas?: Json | null
          client_id?: string
          comments?: string | null
          created_at?: string | null
          feedback_token?: string | null
          id?: string
          job_id?: string | null
          nps_score?: number | null
          photo_urls?: Json | null
          property_id?: string | null
          reasons?: Json | null
          same_cleaner_preference?: string | null
          score?: number | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_feedback_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_feedback_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      job_forms: {
        Row: {
          cleaner_id: string | null
          created_at: string
          form_data: Json | null
          id: string
          job_id: string | null
          property_id: string | null
          second_cleaner_id: string | null
          submitted_at: string | null
        }
        Insert: {
          cleaner_id?: string | null
          created_at?: string
          form_data?: Json | null
          id?: string
          job_id?: string | null
          property_id?: string | null
          second_cleaner_id?: string | null
          submitted_at?: string | null
        }
        Update: {
          cleaner_id?: string | null
          created_at?: string
          form_data?: Json | null
          id?: string
          job_id?: string | null
          property_id?: string | null
          second_cleaner_id?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_forms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_forms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          id: string
          job_id: string
          public_url: string | null
          room_label: string | null
          storage_path: string
          uploaded_at: string | null
        }
        Insert: {
          id?: string
          job_id: string
          public_url?: string | null
          room_label?: string | null
          storage_path: string
          uploaded_at?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          public_url?: string | null
          room_label?: string | null
          storage_path?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_restocking_completions: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          id: string
          job_id: string
          restocking_item_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          id?: string
          job_id: string
          restocking_item_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          id?: string
          job_id?: string
          restocking_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_restocking_completions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_restocking_completions_restocking_item_id_fkey"
            columns: ["restocking_item_id"]
            isOneToOne: false
            referencedRelation: "property_restocking_items"
            referencedColumns: ["id"]
          },
        ]
      }
      job_series: {
        Row: {
          clean_type: string | null
          cleaner_1_id: string | null
          cleaner_2_id: string | null
          created_at: string
          end_date: string | null
          frequency: string
          id: string
          interval_weeks: number
          notes: string | null
          price_ex_gst: number | null
          property_id: string | null
          start_date: string
        }
        Insert: {
          clean_type?: string | null
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          interval_weeks?: number
          notes?: string | null
          price_ex_gst?: number | null
          property_id?: string | null
          start_date: string
        }
        Update: {
          clean_type?: string | null
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          interval_weeks?: number
          notes?: string | null
          price_ex_gst?: number | null
          property_id?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_series_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          access_method: string | null
          arrived_at: string | null
          arrived_lat: number | null
          arrived_lng: number | null
          audit_areas: string[] | null
          audit_completed_at: string | null
          audit_notes: string | null
          audit_outcome: string | null
          audit_photos: string[] | null
          audit_rating: number | null
          audited_by: string | null
          bed_types: Json | null
          cancellation_notes: string | null
          cancellation_reason: string | null
          check_in_time: string | null
          check_out_time: string | null
          checkin_time: string | null
          checkout_time: string | null
          cleaner_1_id: string | null
          cleaner_2_id: string | null
          cleaner_notes: string | null
          cleaner_reminder_sms_sent_at: string | null
          client_booking_sms_sent_at: string | null
          client_name: string | null
          client_phone: string | null
          client_reminder_sms_sent_at: string | null
          clock_off: string | null
          clock_off_at: string | null
          clock_on: string | null
          clock_on_lat: number | null
          clock_on_lng: number | null
          completion_form_completed_at: string | null
          completion_form_data: Json | null
          completion_form_started_at: string | null
          completion_notes: string | null
          completion_photos: string[] | null
          completion_signatures: Json | null
          consumables_selection: Json | null
          created_at: string
          damage_notes: string | null
          damage_photos: string[] | null
          damage_reported: boolean
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_refund_reason: string | null
          deposit_refunded: boolean | null
          duration_minutes: number | null
          estimated_duration: number | null
          extra_time_approved: boolean | null
          extra_time_notes: string | null
          extra_time_photos: string[] | null
          extra_time_requested: boolean | null
          feedback_rating_sms_sent_at: string | null
          feedback_score: number | null
          frequency: string | null
          google_event_id: string | null
          guest_checkin_time: string | null
          guest_checkout_time: string | null
          guesty_reservation_id: string | null
          id: string
          invoice_amount: number | null
          invoice_notes: string | null
          invoice_paid_at: string | null
          invoice_raised_at: string | null
          invoice_sent_at: string | null
          invoice_status: string | null
          is_urgent: boolean | null
          late_alert_sent: boolean | null
          linen_required: boolean | null
          linked_quote_id: string | null
          no_show_alert_sent: boolean | null
          notes: string | null
          paused_at: string | null
          pre_clean_notes: Json | null
          price_ex_gst: number | null
          price_inc_gst: number | null
          price_notes: string | null
          property_id: string | null
          rebook_sms_sent_at: string | null
          recurring_parent_id: string | null
          report_token: string | null
          review_sms_sent_at: string | null
          scheduled_date: string
          scheduled_time: string | null
          series_id: string | null
          source: string | null
          status: string
          stripe_payment_intent_id: string | null
          total_pause_seconds: number
          turnaround_minutes: number | null
          xero_invoice_id: string | null
          xero_invoice_number: string | null
        }
        Insert: {
          access_method?: string | null
          arrived_at?: string | null
          arrived_lat?: number | null
          arrived_lng?: number | null
          audit_areas?: string[] | null
          audit_completed_at?: string | null
          audit_notes?: string | null
          audit_outcome?: string | null
          audit_photos?: string[] | null
          audit_rating?: number | null
          audited_by?: string | null
          bed_types?: Json | null
          cancellation_notes?: string | null
          cancellation_reason?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          cleaner_notes?: string | null
          cleaner_reminder_sms_sent_at?: string | null
          client_booking_sms_sent_at?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_reminder_sms_sent_at?: string | null
          clock_off?: string | null
          clock_off_at?: string | null
          clock_on?: string | null
          clock_on_lat?: number | null
          clock_on_lng?: number | null
          completion_form_completed_at?: string | null
          completion_form_data?: Json | null
          completion_form_started_at?: string | null
          completion_notes?: string | null
          completion_photos?: string[] | null
          completion_signatures?: Json | null
          consumables_selection?: Json | null
          created_at?: string
          damage_notes?: string | null
          damage_photos?: string[] | null
          damage_reported?: boolean
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_refund_reason?: string | null
          deposit_refunded?: boolean | null
          duration_minutes?: number | null
          estimated_duration?: number | null
          extra_time_approved?: boolean | null
          extra_time_notes?: string | null
          extra_time_photos?: string[] | null
          extra_time_requested?: boolean | null
          feedback_rating_sms_sent_at?: string | null
          feedback_score?: number | null
          frequency?: string | null
          google_event_id?: string | null
          guest_checkin_time?: string | null
          guest_checkout_time?: string | null
          guesty_reservation_id?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_notes?: string | null
          invoice_paid_at?: string | null
          invoice_raised_at?: string | null
          invoice_sent_at?: string | null
          invoice_status?: string | null
          is_urgent?: boolean | null
          late_alert_sent?: boolean | null
          linen_required?: boolean | null
          linked_quote_id?: string | null
          no_show_alert_sent?: boolean | null
          notes?: string | null
          paused_at?: string | null
          pre_clean_notes?: Json | null
          price_ex_gst?: number | null
          price_inc_gst?: number | null
          price_notes?: string | null
          property_id?: string | null
          rebook_sms_sent_at?: string | null
          recurring_parent_id?: string | null
          report_token?: string | null
          review_sms_sent_at?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          series_id?: string | null
          source?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          total_pause_seconds?: number
          turnaround_minutes?: number | null
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
        }
        Update: {
          access_method?: string | null
          arrived_at?: string | null
          arrived_lat?: number | null
          arrived_lng?: number | null
          audit_areas?: string[] | null
          audit_completed_at?: string | null
          audit_notes?: string | null
          audit_outcome?: string | null
          audit_photos?: string[] | null
          audit_rating?: number | null
          audited_by?: string | null
          bed_types?: Json | null
          cancellation_notes?: string | null
          cancellation_reason?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          cleaner_notes?: string | null
          cleaner_reminder_sms_sent_at?: string | null
          client_booking_sms_sent_at?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_reminder_sms_sent_at?: string | null
          clock_off?: string | null
          clock_off_at?: string | null
          clock_on?: string | null
          clock_on_lat?: number | null
          clock_on_lng?: number | null
          completion_form_completed_at?: string | null
          completion_form_data?: Json | null
          completion_form_started_at?: string | null
          completion_notes?: string | null
          completion_photos?: string[] | null
          completion_signatures?: Json | null
          consumables_selection?: Json | null
          created_at?: string
          damage_notes?: string | null
          damage_photos?: string[] | null
          damage_reported?: boolean
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_refund_reason?: string | null
          deposit_refunded?: boolean | null
          duration_minutes?: number | null
          estimated_duration?: number | null
          extra_time_approved?: boolean | null
          extra_time_notes?: string | null
          extra_time_photos?: string[] | null
          extra_time_requested?: boolean | null
          feedback_rating_sms_sent_at?: string | null
          feedback_score?: number | null
          frequency?: string | null
          google_event_id?: string | null
          guest_checkin_time?: string | null
          guest_checkout_time?: string | null
          guesty_reservation_id?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_notes?: string | null
          invoice_paid_at?: string | null
          invoice_raised_at?: string | null
          invoice_sent_at?: string | null
          invoice_status?: string | null
          is_urgent?: boolean | null
          late_alert_sent?: boolean | null
          linen_required?: boolean | null
          linked_quote_id?: string | null
          no_show_alert_sent?: boolean | null
          notes?: string | null
          paused_at?: string | null
          pre_clean_notes?: Json | null
          price_ex_gst?: number | null
          price_inc_gst?: number | null
          price_notes?: string | null
          property_id?: string | null
          rebook_sms_sent_at?: string | null
          recurring_parent_id?: string | null
          report_token?: string | null
          review_sms_sent_at?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          series_id?: string | null
          source?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          total_pause_seconds?: number
          turnaround_minutes?: number | null
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_linked_quote_id_fkey"
            columns: ["linked_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_recurring_parent_id_fkey"
            columns: ["recurring_parent_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "job_series"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string | null
          code: string | null
          content: string | null
          created_at: string | null
          id: string
          title: string | null
        }
        Insert: {
          category?: string | null
          code?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Update: {
          category?: string | null
          code?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          address: string
          bathrooms: string | null
          bedrooms: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string
          preferred_date: string | null
          preferred_time: string | null
          referral_source: string | null
          service_type: string
          status: string
          suburb: string
        }
        Insert: {
          address: string
          bathrooms?: string | null
          bedrooms?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone: string
          preferred_date?: string | null
          preferred_time?: string | null
          referral_source?: string | null
          service_type: string
          status?: string
          suburb: string
        }
        Update: {
          address?: string
          bathrooms?: string | null
          bedrooms?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string
          preferred_date?: string | null
          preferred_time?: string | null
          referral_source?: string | null
          service_type?: string
          status?: string
          suburb?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          enabled: boolean
          id: string
          key: string
          updated_at: string | null
        }
        Insert: {
          enabled?: boolean
          id?: string
          key: string
          updated_at?: string | null
        }
        Update: {
          enabled?: boolean
          id?: string
          key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string | null
          id: string
          link: string | null
          message: string
          metadata: Json | null
          read: boolean | null
          target_role: string | null
          tier: string | null
          title: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          link?: string | null
          message: string
          metadata?: Json | null
          read?: boolean | null
          target_role?: string | null
          tier?: string | null
          title?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string | null
          id?: string
          link?: string | null
          message?: string
          metadata?: Json | null
          read?: boolean | null
          target_role?: string | null
          tier?: string | null
          title?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      photos: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          job_id: string | null
          lat: number | null
          lng: number | null
          property_id: string | null
          room_label: string | null
          taken_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          property_id?: string | null
          room_label?: string | null
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          property_id?: string | null
          room_label?: string | null
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_settings: {
        Row: {
          category: string | null
          id: string
          key: string
          label: string | null
          updated_at: string | null
          value: number
        }
        Insert: {
          category?: string | null
          id?: string
          key: string
          label?: string | null
          updated_at?: string | null
          value: number
        }
        Update: {
          category?: string | null
          id?: string
          key?: string
          label?: string | null
          updated_at?: string | null
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          audit_scores: number[]
          avatar_url: string | null
          created_at: string
          email: string | null
          employment_type: string | null
          full_name: string | null
          hourly_rate: number | null
          id: string
          pay_cycle: string | null
          phone: string | null
          super_rate: number | null
          weekly_availability: Json | null
        }
        Insert: {
          audit_scores?: number[]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          employment_type?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id: string
          pay_cycle?: string | null
          phone?: string | null
          super_rate?: number | null
          weekly_availability?: Json | null
        }
        Update: {
          audit_scores?: number[]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          employment_type?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: string
          pay_cycle?: string | null
          phone?: string | null
          super_rate?: number | null
          weekly_availability?: Json | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          abn: string | null
          access_code: string | null
          access_details: Json | null
          access_method: string | null
          access_notes: string | null
          active: boolean | null
          address: string | null
          after_hours_access: boolean | null
          alarm_code: string | null
          amenities_kit: boolean | null
          amenities_notes: string | null
          amenities_restock: boolean | null
          approx_size: string | null
          assigned_cleaner_ids: Json | null
          avg_nightly_rate: number | null
          backup_cleaner_id: string | null
          balconies: number | null
          bathrooms: number | null
          bed_config: string | null
          bedrooms: number | null
          billing_email: string | null
          bin_details: string | null
          business_name: string | null
          checkin_time: string | null
          checklist_template: Json | null
          checkout_time: string | null
          clean_frequency: string | null
          clean_standard: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          client_type: string | null
          consumables_config: Json | null
          created_at: string
          deep_clean_cupboards: boolean | null
          deep_clean_fridge: boolean | null
          deep_clean_oven: boolean | null
          deep_clean_windows: boolean | null
          default_cleaner_id: string | null
          default_price: number | null
          estimated_hours: number | null
          first_clean: boolean | null
          floor_types: string | null
          focus_areas: string | null
          fragrance_preference: string | null
          garage_code: string | null
          guest_access_notes: string | null
          guest_checkin_at: string | null
          guest_wifi: string | null
          guesty_listing_id: string | null
          has_garage: boolean | null
          has_glass_screens: boolean | null
          has_kitchen_breakroom: boolean | null
          has_outdoor_area: boolean | null
          has_oven: boolean | null
          has_pool: boolean | null
          has_security_alarm: boolean | null
          host_preferences: string | null
          ical_last_sync: string | null
          ical_source: string | null
          ical_url: string | null
          id: string
          is_occupied: boolean | null
          kitchens: number | null
          last_cleaned_when: string | null
          lat: number | null
          linen_changeover: string | null
          linen_config: Json | null
          linen_fold_style: string | null
          linen_provided: boolean | null
          linen_required: boolean | null
          linen_sets: number | null
          linen_storage: string | null
          linen_supply: string | null
          living_areas: number | null
          lng: number | null
          lockbox_code: string | null
          locked_price_inc_gst: number | null
          max_guests: number | null
          min_notice: string | null
          neighbour_notes: string | null
          occupant_count: number | null
          outdoor_description: string | null
          override_price: boolean | null
          pain_points: string | null
          parking_instructions: string | null
          payment_terms: string | null
          pet_notes: string | null
          pet_situation: string | null
          platform: string | null
          postcode: string | null
          preferences_notes: string | null
          preferred_cleaner_id: string | null
          preferred_days: string | null
          preferred_time: string | null
          price_deep_clean: number | null
          price_end_of_lease: number | null
          price_includes_gst: boolean | null
          price_post_build: number | null
          price_turnover: number | null
          pricing_agreement_notes: string | null
          pricing_notes: string | null
          product_restrictions: string | null
          property_condition: string | null
          property_name: string
          property_notes: string | null
          property_photos: Json | null
          property_type: string | null
          room_notes: Json | null
          skip_areas: string | null
          sofa_beds: number | null
          spare_linen: string | null
          special_instructions: string | null
          state: string | null
          status: string | null
          suburb: string | null
          tea_coffee_kit: boolean | null
          toilets: number | null
          turnaround_window: string | null
          wash_kit: boolean | null
          wifi_password: string | null
        }
        Insert: {
          abn?: string | null
          access_code?: string | null
          access_details?: Json | null
          access_method?: string | null
          access_notes?: string | null
          active?: boolean | null
          address?: string | null
          after_hours_access?: boolean | null
          alarm_code?: string | null
          amenities_kit?: boolean | null
          amenities_notes?: string | null
          amenities_restock?: boolean | null
          approx_size?: string | null
          assigned_cleaner_ids?: Json | null
          avg_nightly_rate?: number | null
          backup_cleaner_id?: string | null
          balconies?: number | null
          bathrooms?: number | null
          bed_config?: string | null
          bedrooms?: number | null
          billing_email?: string | null
          bin_details?: string | null
          business_name?: string | null
          checkin_time?: string | null
          checklist_template?: Json | null
          checkout_time?: string | null
          clean_frequency?: string | null
          clean_standard?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_type?: string | null
          consumables_config?: Json | null
          created_at?: string
          deep_clean_cupboards?: boolean | null
          deep_clean_fridge?: boolean | null
          deep_clean_oven?: boolean | null
          deep_clean_windows?: boolean | null
          default_cleaner_id?: string | null
          default_price?: number | null
          estimated_hours?: number | null
          first_clean?: boolean | null
          floor_types?: string | null
          focus_areas?: string | null
          fragrance_preference?: string | null
          garage_code?: string | null
          guest_access_notes?: string | null
          guest_checkin_at?: string | null
          guest_wifi?: string | null
          guesty_listing_id?: string | null
          has_garage?: boolean | null
          has_glass_screens?: boolean | null
          has_kitchen_breakroom?: boolean | null
          has_outdoor_area?: boolean | null
          has_oven?: boolean | null
          has_pool?: boolean | null
          has_security_alarm?: boolean | null
          host_preferences?: string | null
          ical_last_sync?: string | null
          ical_source?: string | null
          ical_url?: string | null
          id?: string
          is_occupied?: boolean | null
          kitchens?: number | null
          last_cleaned_when?: string | null
          lat?: number | null
          linen_changeover?: string | null
          linen_config?: Json | null
          linen_fold_style?: string | null
          linen_provided?: boolean | null
          linen_required?: boolean | null
          linen_sets?: number | null
          linen_storage?: string | null
          linen_supply?: string | null
          living_areas?: number | null
          lng?: number | null
          lockbox_code?: string | null
          locked_price_inc_gst?: number | null
          max_guests?: number | null
          min_notice?: string | null
          neighbour_notes?: string | null
          occupant_count?: number | null
          outdoor_description?: string | null
          override_price?: boolean | null
          pain_points?: string | null
          parking_instructions?: string | null
          payment_terms?: string | null
          pet_notes?: string | null
          pet_situation?: string | null
          platform?: string | null
          postcode?: string | null
          preferences_notes?: string | null
          preferred_cleaner_id?: string | null
          preferred_days?: string | null
          preferred_time?: string | null
          price_deep_clean?: number | null
          price_end_of_lease?: number | null
          price_includes_gst?: boolean | null
          price_post_build?: number | null
          price_turnover?: number | null
          pricing_agreement_notes?: string | null
          pricing_notes?: string | null
          product_restrictions?: string | null
          property_condition?: string | null
          property_name: string
          property_notes?: string | null
          property_photos?: Json | null
          property_type?: string | null
          room_notes?: Json | null
          skip_areas?: string | null
          sofa_beds?: number | null
          spare_linen?: string | null
          special_instructions?: string | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          tea_coffee_kit?: boolean | null
          toilets?: number | null
          turnaround_window?: string | null
          wash_kit?: boolean | null
          wifi_password?: string | null
        }
        Update: {
          abn?: string | null
          access_code?: string | null
          access_details?: Json | null
          access_method?: string | null
          access_notes?: string | null
          active?: boolean | null
          address?: string | null
          after_hours_access?: boolean | null
          alarm_code?: string | null
          amenities_kit?: boolean | null
          amenities_notes?: string | null
          amenities_restock?: boolean | null
          approx_size?: string | null
          assigned_cleaner_ids?: Json | null
          avg_nightly_rate?: number | null
          backup_cleaner_id?: string | null
          balconies?: number | null
          bathrooms?: number | null
          bed_config?: string | null
          bedrooms?: number | null
          billing_email?: string | null
          bin_details?: string | null
          business_name?: string | null
          checkin_time?: string | null
          checklist_template?: Json | null
          checkout_time?: string | null
          clean_frequency?: string | null
          clean_standard?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_type?: string | null
          consumables_config?: Json | null
          created_at?: string
          deep_clean_cupboards?: boolean | null
          deep_clean_fridge?: boolean | null
          deep_clean_oven?: boolean | null
          deep_clean_windows?: boolean | null
          default_cleaner_id?: string | null
          default_price?: number | null
          estimated_hours?: number | null
          first_clean?: boolean | null
          floor_types?: string | null
          focus_areas?: string | null
          fragrance_preference?: string | null
          garage_code?: string | null
          guest_access_notes?: string | null
          guest_checkin_at?: string | null
          guest_wifi?: string | null
          guesty_listing_id?: string | null
          has_garage?: boolean | null
          has_glass_screens?: boolean | null
          has_kitchen_breakroom?: boolean | null
          has_outdoor_area?: boolean | null
          has_oven?: boolean | null
          has_pool?: boolean | null
          has_security_alarm?: boolean | null
          host_preferences?: string | null
          ical_last_sync?: string | null
          ical_source?: string | null
          ical_url?: string | null
          id?: string
          is_occupied?: boolean | null
          kitchens?: number | null
          last_cleaned_when?: string | null
          lat?: number | null
          linen_changeover?: string | null
          linen_config?: Json | null
          linen_fold_style?: string | null
          linen_provided?: boolean | null
          linen_required?: boolean | null
          linen_sets?: number | null
          linen_storage?: string | null
          linen_supply?: string | null
          living_areas?: number | null
          lng?: number | null
          lockbox_code?: string | null
          locked_price_inc_gst?: number | null
          max_guests?: number | null
          min_notice?: string | null
          neighbour_notes?: string | null
          occupant_count?: number | null
          outdoor_description?: string | null
          override_price?: boolean | null
          pain_points?: string | null
          parking_instructions?: string | null
          payment_terms?: string | null
          pet_notes?: string | null
          pet_situation?: string | null
          platform?: string | null
          postcode?: string | null
          preferences_notes?: string | null
          preferred_cleaner_id?: string | null
          preferred_days?: string | null
          preferred_time?: string | null
          price_deep_clean?: number | null
          price_end_of_lease?: number | null
          price_includes_gst?: boolean | null
          price_post_build?: number | null
          price_turnover?: number | null
          pricing_agreement_notes?: string | null
          pricing_notes?: string | null
          product_restrictions?: string | null
          property_condition?: string | null
          property_name?: string
          property_notes?: string | null
          property_photos?: Json | null
          property_type?: string | null
          room_notes?: Json | null
          skip_areas?: string | null
          sofa_beds?: number | null
          spare_linen?: string | null
          special_instructions?: string | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          tea_coffee_kit?: boolean | null
          toilets?: number | null
          turnaround_window?: string | null
          wash_kit?: boolean | null
          wifi_password?: string | null
        }
        Relationships: []
      }
      property_issues: {
        Row: {
          acknowledged_by: string | null
          created_at: string | null
          description: string | null
          id: string
          job_id: string | null
          photo_url: string | null
          property_id: string | null
          reported_at: string | null
          reported_by: string | null
          resolved_at: string | null
          room: string | null
          status: string | null
        }
        Insert: {
          acknowledged_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          job_id?: string | null
          photo_url?: string | null
          property_id?: string | null
          reported_at?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          room?: string | null
          status?: string | null
        }
        Update: {
          acknowledged_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          job_id?: string | null
          photo_url?: string | null
          property_id?: string | null
          reported_at?: string | null
          reported_by?: string | null
          resolved_at?: string | null
          room?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_issues_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_issues_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_restocking_items: {
        Row: {
          active: boolean | null
          emoji: string | null
          id: string
          item_name: string
          property_id: string
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          emoji?: string | null
          id?: string
          item_name: string
          property_id: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          emoji?: string | null
          id?: string
          item_name?: string
          property_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_restocking_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_sop_items: {
        Row: {
          active: boolean | null
          id: string
          property_id: string
          room: string
          sort_order: number | null
          task: string
        }
        Insert: {
          active?: boolean | null
          id?: string
          property_id: string
          room: string
          sort_order?: number | null
          task: string
        }
        Update: {
          active?: boolean | null
          id?: string
          property_id?: string
          room?: string
          sort_order?: number | null
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_sop_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_audit_rooms: {
        Row: {
          audit_id: string
          created_at: string
          id: string
          notes: string | null
          rating: string | null
          room_name: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          id?: string
          notes?: string | null
          rating?: string | null
          room_name: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          rating?: string | null
          room_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_audit_rooms_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "qc_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_audits: {
        Row: {
          action_required: boolean | null
          audit_date: string | null
          cleaner_id: string | null
          cleaner_notified: boolean | null
          created_at: string
          id: string
          improvement_feedback: string | null
          inspector_id: string | null
          issues_text: string | null
          job_id: string | null
          max_score: number | null
          percentage: number | null
          positive_feedback: string | null
          property_id: string | null
          re_clean_date: string | null
          result: string | null
          scores: Json | null
          total_score: number | null
        }
        Insert: {
          action_required?: boolean | null
          audit_date?: string | null
          cleaner_id?: string | null
          cleaner_notified?: boolean | null
          created_at?: string
          id?: string
          improvement_feedback?: string | null
          inspector_id?: string | null
          issues_text?: string | null
          job_id?: string | null
          max_score?: number | null
          percentage?: number | null
          positive_feedback?: string | null
          property_id?: string | null
          re_clean_date?: string | null
          result?: string | null
          scores?: Json | null
          total_score?: number | null
        }
        Update: {
          action_required?: boolean | null
          audit_date?: string | null
          cleaner_id?: string | null
          cleaner_notified?: boolean | null
          created_at?: string
          id?: string
          improvement_feedback?: string | null
          inspector_id?: string | null
          issues_text?: string | null
          job_id?: string | null
          max_score?: number | null
          percentage?: number | null
          positive_feedback?: string | null
          property_id?: string | null
          re_clean_date?: string | null
          result?: string | null
          scores?: Json | null
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_audits_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_audits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          accepted_at: string | null
          addons: Json | null
          address: string | null
          bathrooms: number | null
          bedrooms: number | null
          clean_type: string | null
          converted_client_id: string | null
          created_at: string
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_refund_reason: string | null
          deposit_refunded: boolean | null
          email: string | null
          estimated_hours: number | null
          expires_at: string | null
          extra_notes: string | null
          first_name: string | null
          followup_approved_at: string | null
          followup_approved_by: string | null
          followup_sent_at: string | null
          form_data: Json | null
          form_submitted_at: string | null
          has_garage: boolean | null
          hourly_rate: number | null
          id: string
          is_occupied: boolean | null
          last_name: string | null
          last_status_change: string | null
          phone: string | null
          photos: Json | null
          preferred_date: string | null
          preferred_frequency: string | null
          preferred_time: string | null
          property_size: string | null
          property_type: string | null
          quote_sent_at: string | null
          referral_source: string | null
          status: string
          stripe_payment_intent_id: string | null
          tcs_accepted: boolean | null
          tcs_accepted_at: string | null
          tcs_version: string | null
          toilets: number | null
          token: string
          total_ex_gst: number | null
          total_inc_gst: number | null
        }
        Insert: {
          accepted_at?: string | null
          addons?: Json | null
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          clean_type?: string | null
          converted_client_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_refund_reason?: string | null
          deposit_refunded?: boolean | null
          email?: string | null
          estimated_hours?: number | null
          expires_at?: string | null
          extra_notes?: string | null
          first_name?: string | null
          followup_approved_at?: string | null
          followup_approved_by?: string | null
          followup_sent_at?: string | null
          form_data?: Json | null
          form_submitted_at?: string | null
          has_garage?: boolean | null
          hourly_rate?: number | null
          id?: string
          is_occupied?: boolean | null
          last_name?: string | null
          last_status_change?: string | null
          phone?: string | null
          photos?: Json | null
          preferred_date?: string | null
          preferred_frequency?: string | null
          preferred_time?: string | null
          property_size?: string | null
          property_type?: string | null
          quote_sent_at?: string | null
          referral_source?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          tcs_accepted?: boolean | null
          tcs_accepted_at?: string | null
          tcs_version?: string | null
          toilets?: number | null
          token?: string
          total_ex_gst?: number | null
          total_inc_gst?: number | null
        }
        Update: {
          accepted_at?: string | null
          addons?: Json | null
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          clean_type?: string | null
          converted_client_id?: string | null
          created_at?: string
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_refund_reason?: string | null
          deposit_refunded?: boolean | null
          email?: string | null
          estimated_hours?: number | null
          expires_at?: string | null
          extra_notes?: string | null
          first_name?: string | null
          followup_approved_at?: string | null
          followup_approved_by?: string | null
          followup_sent_at?: string | null
          form_data?: Json | null
          form_submitted_at?: string | null
          has_garage?: boolean | null
          hourly_rate?: number | null
          id?: string
          is_occupied?: boolean | null
          last_name?: string | null
          last_status_change?: string | null
          phone?: string | null
          photos?: Json | null
          preferred_date?: string | null
          preferred_frequency?: string | null
          preferred_time?: string | null
          property_size?: string | null
          property_type?: string | null
          quote_sent_at?: string | null
          referral_source?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          tcs_accepted?: boolean | null
          tcs_accepted_at?: string | null
          tcs_version?: string | null
          toilets?: number | null
          token?: string
          total_ex_gst?: number | null
          total_inc_gst?: number | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          acceptance_method: string | null
          access_instructions: string | null
          access_method: string | null
          actual_gp_dollars: number | null
          actual_gp_percent: number | null
          balconies: number | null
          bathrooms: number | null
          bed_types: Json | null
          bedrooms: number | null
          bond_certificate: boolean | null
          builder_name: string | null
          checkin_time: string | null
          checkout_time: string | null
          clean_type: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          consumables_cost: number | null
          consumables_selection: Json | null
          created_at: string
          created_by: string | null
          deep_clean_multiplier: number | null
          discount_gp_percent: number | null
          discounted_price: number | null
          extras: Json | null
          frequency: string | null
          gp_percent: number | null
          gst: number | null
          hosting_platform: string | null
          hours: number | null
          id: string
          internal_notes: string | null
          kitchens: number | null
          labour_cost: number | null
          levels: number | null
          linen_cost: number | null
          linen_required: boolean | null
          living_areas: number | null
          notes: string | null
          outdoor_areas: boolean | null
          parking: string | null
          pets: boolean | null
          preferred_days: string[] | null
          preferred_time: string | null
          price: number | null
          project_name: string | null
          property_address: string | null
          property_id: string | null
          property_name: string | null
          property_type_build: string | null
          quote_accepted_at: string | null
          quote_declined_at: string | null
          quote_sent_at: string | null
          quote_token: string | null
          reference: string | null
          sell_price_ex_gst: number | null
          sell_price_inc_gst: number | null
          service_type: string | null
          sofa_beds: number | null
          special_requirements: string | null
          specialist_chemicals: number | null
          sqm: number | null
          status: string | null
          tcs_accepted: boolean | null
          tcs_accepted_at: string | null
          tcs_version: string | null
          total_cost: number | null
          wet_areas: number | null
          xero_invoice_id: string | null
        }
        Insert: {
          acceptance_method?: string | null
          access_instructions?: string | null
          access_method?: string | null
          actual_gp_dollars?: number | null
          actual_gp_percent?: number | null
          balconies?: number | null
          bathrooms?: number | null
          bed_types?: Json | null
          bedrooms?: number | null
          bond_certificate?: boolean | null
          builder_name?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          clean_type?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          consumables_cost?: number | null
          consumables_selection?: Json | null
          created_at?: string
          created_by?: string | null
          deep_clean_multiplier?: number | null
          discount_gp_percent?: number | null
          discounted_price?: number | null
          extras?: Json | null
          frequency?: string | null
          gp_percent?: number | null
          gst?: number | null
          hosting_platform?: string | null
          hours?: number | null
          id?: string
          internal_notes?: string | null
          kitchens?: number | null
          labour_cost?: number | null
          levels?: number | null
          linen_cost?: number | null
          linen_required?: boolean | null
          living_areas?: number | null
          notes?: string | null
          outdoor_areas?: boolean | null
          parking?: string | null
          pets?: boolean | null
          preferred_days?: string[] | null
          preferred_time?: string | null
          price?: number | null
          project_name?: string | null
          property_address?: string | null
          property_id?: string | null
          property_name?: string | null
          property_type_build?: string | null
          quote_accepted_at?: string | null
          quote_declined_at?: string | null
          quote_sent_at?: string | null
          quote_token?: string | null
          reference?: string | null
          sell_price_ex_gst?: number | null
          sell_price_inc_gst?: number | null
          service_type?: string | null
          sofa_beds?: number | null
          special_requirements?: string | null
          specialist_chemicals?: number | null
          sqm?: number | null
          status?: string | null
          tcs_accepted?: boolean | null
          tcs_accepted_at?: string | null
          tcs_version?: string | null
          total_cost?: number | null
          wet_areas?: number | null
          xero_invoice_id?: string | null
        }
        Update: {
          acceptance_method?: string | null
          access_instructions?: string | null
          access_method?: string | null
          actual_gp_dollars?: number | null
          actual_gp_percent?: number | null
          balconies?: number | null
          bathrooms?: number | null
          bed_types?: Json | null
          bedrooms?: number | null
          bond_certificate?: boolean | null
          builder_name?: string | null
          checkin_time?: string | null
          checkout_time?: string | null
          clean_type?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          consumables_cost?: number | null
          consumables_selection?: Json | null
          created_at?: string
          created_by?: string | null
          deep_clean_multiplier?: number | null
          discount_gp_percent?: number | null
          discounted_price?: number | null
          extras?: Json | null
          frequency?: string | null
          gp_percent?: number | null
          gst?: number | null
          hosting_platform?: string | null
          hours?: number | null
          id?: string
          internal_notes?: string | null
          kitchens?: number | null
          labour_cost?: number | null
          levels?: number | null
          linen_cost?: number | null
          linen_required?: boolean | null
          living_areas?: number | null
          notes?: string | null
          outdoor_areas?: boolean | null
          parking?: string | null
          pets?: boolean | null
          preferred_days?: string[] | null
          preferred_time?: string | null
          price?: number | null
          project_name?: string | null
          property_address?: string | null
          property_id?: string | null
          property_name?: string | null
          property_type_build?: string | null
          quote_accepted_at?: string | null
          quote_declined_at?: string | null
          quote_sent_at?: string | null
          quote_token?: string | null
          reference?: string | null
          sell_price_ex_gst?: number | null
          sell_price_inc_gst?: number | null
          service_type?: string | null
          sofa_beds?: number | null
          special_requirements?: string | null
          specialist_chemicals?: number | null
          sqm?: number | null
          status?: string | null
          tcs_accepted?: boolean | null
          tcs_accepted_at?: string | null
          tcs_version?: string | null
          total_cost?: number | null
          wet_areas?: number | null
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body: string
          id: string
          key: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body?: string
          id?: string
          key: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body?: string
          id?: string
          key?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      sos_alerts: {
        Row: {
          cleaner_id: string
          id: string
          job_id: string | null
          lat: number | null
          lng: number | null
          resolved: boolean | null
          triggered_at: string | null
        }
        Insert: {
          cleaner_id: string
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          resolved?: boolean | null
          triggered_at?: string | null
        }
        Update: {
          cleaner_id?: string
          id?: string
          job_id?: string | null
          lat?: number | null
          lng?: number | null
          resolved?: boolean | null
          triggered_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sos_alerts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave: {
        Row: {
          created_at: string
          end_date: string
          id: string
          notes: string | null
          reason: string | null
          start_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          reason?: string | null
          start_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          reason?: string | null
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_magic_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          staff_id: string
          token: string
          used: boolean
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          staff_id: string
          token?: string
          used?: boolean
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          staff_id?: string
          token?: string
          used?: boolean
        }
        Relationships: []
      }
      staff_onboarding: {
        Row: {
          abn: string | null
          abn_status: string | null
          address: string | null
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          availability_notes: string | null
          available_days: Json | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_bsb: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          full_name: string | null
          has_connecteam: boolean | null
          has_whatsapp: boolean | null
          id: string
          id_confirmed: boolean | null
          id_document_url: string | null
          is_contractor: boolean | null
          max_jobs_per_day: string | null
          onboarding_token: string
          phone: string | null
          police_check_status: string | null
          police_check_url: string | null
          policy_acknowledgements: Json | null
          preferred_name: string | null
          preferred_start_time: string | null
          status: string
          submitted_at: string | null
          super_fund_name: string | null
          super_member_number: string | null
          tfn: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          abn?: string | null
          abn_status?: string | null
          address?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          availability_notes?: string | null
          available_days?: Json | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          has_connecteam?: boolean | null
          has_whatsapp?: boolean | null
          id?: string
          id_confirmed?: boolean | null
          id_document_url?: string | null
          is_contractor?: boolean | null
          max_jobs_per_day?: string | null
          onboarding_token?: string
          phone?: string | null
          police_check_status?: string | null
          police_check_url?: string | null
          policy_acknowledgements?: Json | null
          preferred_name?: string | null
          preferred_start_time?: string | null
          status?: string
          submitted_at?: string | null
          super_fund_name?: string | null
          super_member_number?: string | null
          tfn?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          abn?: string | null
          abn_status?: string | null
          address?: string | null
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          availability_notes?: string | null
          available_days?: Json | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_bsb?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          full_name?: string | null
          has_connecteam?: boolean | null
          has_whatsapp?: boolean | null
          id?: string
          id_confirmed?: boolean | null
          id_document_url?: string | null
          is_contractor?: boolean | null
          max_jobs_per_day?: string | null
          onboarding_token?: string
          phone?: string | null
          police_check_status?: string | null
          police_check_url?: string | null
          policy_acknowledgements?: Json | null
          preferred_name?: string | null
          preferred_start_time?: string | null
          status?: string
          submitted_at?: string | null
          super_fund_name?: string | null
          super_member_number?: string | null
          tfn?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_pay_rates: {
        Row: {
          airbnb_rate: number | null
          commercial_rate: number | null
          created_at: string
          deep_rate: number | null
          hourly_rate: number | null
          id: string
          rate_type: string
          staff_id: string
          standard_rate: number | null
          updated_at: string
        }
        Insert: {
          airbnb_rate?: number | null
          commercial_rate?: number | null
          created_at?: string
          deep_rate?: number | null
          hourly_rate?: number | null
          id?: string
          rate_type?: string
          staff_id: string
          standard_rate?: number | null
          updated_at?: string
        }
        Update: {
          airbnb_rate?: number | null
          commercial_rate?: number | null
          created_at?: string
          deep_rate?: number | null
          hourly_rate?: number | null
          id?: string
          rate_type?: string
          staff_id?: string
          standard_rate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      time_edit_queue: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          proposed_clock_off: string | null
          proposed_clock_on: string | null
          reason: string | null
          requested_by: string
          status: string
          time_entry_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          proposed_clock_off?: string | null
          proposed_clock_on?: string | null
          reason?: string | null
          requested_by: string
          status?: string
          time_entry_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          proposed_clock_off?: string | null
          proposed_clock_on?: string | null
          reason?: string | null
          requested_by?: string
          status?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_edit_queue_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      time_edit_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          proposed_clock_in: string | null
          proposed_clock_out: string | null
          reason: string
          requested_by: string
          status: string
          time_entry_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          proposed_clock_in?: string | null
          proposed_clock_out?: string | null
          reason: string
          requested_by: string
          status?: string
          time_entry_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          proposed_clock_in?: string | null
          proposed_clock_out?: string | null
          reason?: string
          requested_by?: string
          status?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_edit_requests_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_in_time: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          clock_out_time: string | null
          created_at: string
          edit_reason: string | null
          extra_time_decided_at: string | null
          extra_time_decided_by: string | null
          extra_time_minutes: number | null
          extra_time_reason: string | null
          extra_time_status: string | null
          flagged: boolean | null
          geo_distance_meters: number | null
          geo_override: boolean | null
          id: string
          job_id: string | null
          manual_hours: number | null
          total_minutes: number | null
          user_id: string
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_time?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_time?: string | null
          created_at?: string
          edit_reason?: string | null
          extra_time_decided_at?: string | null
          extra_time_decided_by?: string | null
          extra_time_minutes?: number | null
          extra_time_reason?: string | null
          extra_time_status?: string | null
          flagged?: boolean | null
          geo_distance_meters?: number | null
          geo_override?: boolean | null
          id?: string
          job_id?: string | null
          manual_hours?: number | null
          total_minutes?: number | null
          user_id: string
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_time?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_time?: string | null
          created_at?: string
          edit_reason?: string | null
          extra_time_decided_at?: string | null
          extra_time_decided_by?: string | null
          extra_time_minutes?: number | null
          extra_time_reason?: string | null
          extra_time_status?: string | null
          flagged?: boolean | null
          geo_distance_meters?: number | null
          geo_override?: boolean | null
          id?: string
          job_id?: string | null
          manual_hours?: number | null
          total_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      xero_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      xero_tokens: {
        Row: {
          access_token: string
          expires_at: string | null
          id: string
          refresh_token: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          expires_at?: string | null
          id?: string
          refresh_token: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          expires_at?: string | null
          id?: string
          refresh_token?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "head_cleaner" | "cleaner" | "client"
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
      app_role: ["admin", "head_cleaner", "cleaner", "client"],
    },
  },
} as const
