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
      jobs: {
        Row: {
          cleaner_1_id: string | null
          cleaner_2_id: string | null
          created_at: string
          estimated_duration: number | null
          id: string
          notes: string | null
          property_id: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string
        }
        Insert: {
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          created_at?: string
          estimated_duration?: number | null
          id?: string
          notes?: string | null
          property_id?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
        }
        Update: {
          cleaner_1_id?: string | null
          cleaner_2_id?: string | null
          created_at?: string
          estimated_duration?: number | null
          id?: string
          notes?: string | null
          property_id?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean | null
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
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
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
          host_preferences: string | null
          id: string
          lat: number | null
          linen_fold_style: string | null
          lng: number | null
          payment_terms: string | null
          postcode: string | null
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
          host_preferences?: string | null
          id?: string
          lat?: number | null
          linen_fold_style?: string | null
          lng?: number | null
          payment_terms?: string | null
          postcode?: string | null
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
          host_preferences?: string | null
          id?: string
          lat?: number | null
          linen_fold_style?: string | null
          lng?: number | null
          payment_terms?: string | null
          postcode?: string | null
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
      app_role: "admin" | "head_cleaner" | "cleaner"
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
      app_role: ["admin", "head_cleaner", "cleaner"],
    },
  },
} as const
