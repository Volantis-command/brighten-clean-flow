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
          cleaner_1_id: string | null
          cleaner_2_id: string | null
          created_at: string
          estimated_duration: number | null
          feedback_score: number | null
          id: string
          invoice_amount: number | null
          invoice_notes: string | null
          invoice_status: string | null
          linked_quote_id: string | null
          notes: string | null
          price_ex_gst: number | null
          price_inc_gst: number | null
          price_notes: string | null
          property_id: string | null
          rebook_sms_sent_at: string | null
          review_sms_sent_at: string | null
          scheduled_date: string
          scheduled_time: string | null
          series_id: string | null
          status: string
          xero_invoice_id: string | null
          xero_invoice_number: string | null
        }
        Insert: {
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          created_at?: string
          estimated_duration?: number | null
          feedback_score?: number | null
          id?: string
          invoice_amount?: number | null
          invoice_notes?: string | null
          invoice_status?: string | null
          linked_quote_id?: string | null
          notes?: string | null
          price_ex_gst?: number | null
          price_inc_gst?: number | null
          price_notes?: string | null
          property_id?: string | null
          rebook_sms_sent_at?: string | null
          review_sms_sent_at?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          series_id?: string | null
          status?: string
          xero_invoice_id?: string | null
          xero_invoice_number?: string | null
        }
        Update: {
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          created_at?: string
          estimated_duration?: number | null
          feedback_score?: number | null
          id?: string
          invoice_amount?: number | null
          invoice_notes?: string | null
          invoice_status?: string | null
          linked_quote_id?: string | null
          notes?: string | null
          price_ex_gst?: number | null
          price_inc_gst?: number | null
          price_notes?: string | null
          property_id?: string | null
          rebook_sms_sent_at?: string | null
          review_sms_sent_at?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          series_id?: string | null
          status?: string
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
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean | null
          title: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean | null
          title?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean | null
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
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          weekly_availability: Json | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          weekly_availability?: Json | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          weekly_availability?: Json | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          access_code: string | null
          access_method: string | null
          access_notes: string | null
          address: string | null
          amenities_notes: string | null
          bathrooms: number | null
          bedrooms: number | null
          billing_email: string | null
          clean_frequency: string | null
          client_name: string | null
          created_at: string
          default_cleaner_id: string | null
          guest_checkin_at: string | null
          host_preferences: string | null
          id: string
          lat: number | null
          linen_fold_style: string | null
          lng: number | null
          payment_terms: string | null
          postcode: string | null
          preferred_cleaner_id: string | null
          price_deep_clean: number | null
          price_end_of_lease: number | null
          price_post_build: number | null
          price_turnover: number | null
          pricing_notes: string | null
          product_restrictions: string | null
          property_name: string
          property_type: string | null
          state: string | null
          status: string | null
          suburb: string | null
          turnaround_window: string | null
        }
        Insert: {
          access_code?: string | null
          access_method?: string | null
          access_notes?: string | null
          address?: string | null
          amenities_notes?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          billing_email?: string | null
          clean_frequency?: string | null
          client_name?: string | null
          created_at?: string
          default_cleaner_id?: string | null
          guest_checkin_at?: string | null
          host_preferences?: string | null
          id?: string
          lat?: number | null
          linen_fold_style?: string | null
          lng?: number | null
          payment_terms?: string | null
          postcode?: string | null
          preferred_cleaner_id?: string | null
          price_deep_clean?: number | null
          price_end_of_lease?: number | null
          price_post_build?: number | null
          price_turnover?: number | null
          pricing_notes?: string | null
          product_restrictions?: string | null
          property_name: string
          property_type?: string | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          turnaround_window?: string | null
        }
        Update: {
          access_code?: string | null
          access_method?: string | null
          access_notes?: string | null
          address?: string | null
          amenities_notes?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          billing_email?: string | null
          clean_frequency?: string | null
          client_name?: string | null
          created_at?: string
          default_cleaner_id?: string | null
          guest_checkin_at?: string | null
          host_preferences?: string | null
          id?: string
          lat?: number | null
          linen_fold_style?: string | null
          lng?: number | null
          payment_terms?: string | null
          postcode?: string | null
          preferred_cleaner_id?: string | null
          price_deep_clean?: number | null
          price_end_of_lease?: number | null
          price_post_build?: number | null
          price_turnover?: number | null
          pricing_notes?: string | null
          product_restrictions?: string | null
          property_name?: string
          property_type?: string | null
          state?: string | null
          status?: string | null
          suburb?: string | null
          turnaround_window?: string | null
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
          email: string | null
          estimated_hours: number | null
          extra_notes: string | null
          first_name: string | null
          form_submitted_at: string | null
          has_garage: boolean | null
          hourly_rate: number | null
          id: string
          is_occupied: boolean | null
          last_name: string | null
          phone: string | null
          preferred_date: string | null
          preferred_time: string | null
          property_size: string | null
          property_type: string | null
          quote_sent_at: string | null
          referral_source: string | null
          status: string
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
          email?: string | null
          estimated_hours?: number | null
          extra_notes?: string | null
          first_name?: string | null
          form_submitted_at?: string | null
          has_garage?: boolean | null
          hourly_rate?: number | null
          id?: string
          is_occupied?: boolean | null
          last_name?: string | null
          phone?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          property_size?: string | null
          property_type?: string | null
          quote_sent_at?: string | null
          referral_source?: string | null
          status?: string
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
          email?: string | null
          estimated_hours?: number | null
          extra_notes?: string | null
          first_name?: string | null
          form_submitted_at?: string | null
          has_garage?: boolean | null
          hourly_rate?: number | null
          id?: string
          is_occupied?: boolean | null
          last_name?: string | null
          phone?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          property_size?: string | null
          property_type?: string | null
          quote_sent_at?: string | null
          referral_source?: string | null
          status?: string
          toilets?: number | null
          token?: string
          total_ex_gst?: number | null
          total_inc_gst?: number | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          actual_gp_dollars: number | null
          actual_gp_percent: number | null
          balconies: number | null
          bathrooms: number | null
          bed_types: Json | null
          bedrooms: number | null
          bond_certificate: boolean | null
          builder_name: string | null
          clean_type: string | null
          client_name: string | null
          client_phone: string | null
          consumables_cost: number | null
          created_at: string
          created_by: string | null
          deep_clean_multiplier: number | null
          discount_gp_percent: number | null
          discounted_price: number | null
          extras: Json | null
          gp_percent: number | null
          gst: number | null
          hours: number | null
          id: string
          internal_notes: string | null
          kitchens: number | null
          labour_cost: number | null
          levels: number | null
          linen_cost: number | null
          living_areas: number | null
          notes: string | null
          outdoor_areas: boolean | null
          price: number | null
          project_name: string | null
          property_address: string | null
          property_id: string | null
          property_name: string | null
          property_type_build: string | null
          reference: string | null
          sell_price_ex_gst: number | null
          sell_price_inc_gst: number | null
          service_type: string | null
          sofa_beds: number | null
          special_requirements: string | null
          specialist_chemicals: number | null
          sqm: number | null
          status: string | null
          total_cost: number | null
          wet_areas: number | null
          xero_invoice_id: string | null
        }
        Insert: {
          actual_gp_dollars?: number | null
          actual_gp_percent?: number | null
          balconies?: number | null
          bathrooms?: number | null
          bed_types?: Json | null
          bedrooms?: number | null
          bond_certificate?: boolean | null
          builder_name?: string | null
          clean_type?: string | null
          client_name?: string | null
          client_phone?: string | null
          consumables_cost?: number | null
          created_at?: string
          created_by?: string | null
          deep_clean_multiplier?: number | null
          discount_gp_percent?: number | null
          discounted_price?: number | null
          extras?: Json | null
          gp_percent?: number | null
          gst?: number | null
          hours?: number | null
          id?: string
          internal_notes?: string | null
          kitchens?: number | null
          labour_cost?: number | null
          levels?: number | null
          linen_cost?: number | null
          living_areas?: number | null
          notes?: string | null
          outdoor_areas?: boolean | null
          price?: number | null
          project_name?: string | null
          property_address?: string | null
          property_id?: string | null
          property_name?: string | null
          property_type_build?: string | null
          reference?: string | null
          sell_price_ex_gst?: number | null
          sell_price_inc_gst?: number | null
          service_type?: string | null
          sofa_beds?: number | null
          special_requirements?: string | null
          specialist_chemicals?: number | null
          sqm?: number | null
          status?: string | null
          total_cost?: number | null
          wet_areas?: number | null
          xero_invoice_id?: string | null
        }
        Update: {
          actual_gp_dollars?: number | null
          actual_gp_percent?: number | null
          balconies?: number | null
          bathrooms?: number | null
          bed_types?: Json | null
          bedrooms?: number | null
          bond_certificate?: boolean | null
          builder_name?: string | null
          clean_type?: string | null
          client_name?: string | null
          client_phone?: string | null
          consumables_cost?: number | null
          created_at?: string
          created_by?: string | null
          deep_clean_multiplier?: number | null
          discount_gp_percent?: number | null
          discounted_price?: number | null
          extras?: Json | null
          gp_percent?: number | null
          gst?: number | null
          hours?: number | null
          id?: string
          internal_notes?: string | null
          kitchens?: number | null
          labour_cost?: number | null
          levels?: number | null
          linen_cost?: number | null
          living_areas?: number | null
          notes?: string | null
          outdoor_areas?: boolean | null
          price?: number | null
          project_name?: string | null
          property_address?: string | null
          property_id?: string | null
          property_name?: string | null
          property_type_build?: string | null
          reference?: string | null
          sell_price_ex_gst?: number | null
          sell_price_inc_gst?: number | null
          service_type?: string | null
          sofa_beds?: number | null
          special_requirements?: string | null
          specialist_chemicals?: number | null
          sqm?: number | null
          status?: string | null
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
      time_entries: {
        Row: {
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_in_time: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          clock_out_time: string | null
          created_at: string
          geo_distance_meters: number | null
          geo_override: boolean | null
          id: string
          job_id: string | null
          total_minutes: number | null
          user_id: string
        }
        Insert: {
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_time?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_time?: string | null
          created_at?: string
          geo_distance_meters?: number | null
          geo_override?: boolean | null
          id?: string
          job_id?: string | null
          total_minutes?: number | null
          user_id: string
        }
        Update: {
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_in_time?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          clock_out_time?: string | null
          created_at?: string
          geo_distance_meters?: number | null
          geo_override?: boolean | null
          id?: string
          job_id?: string | null
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
