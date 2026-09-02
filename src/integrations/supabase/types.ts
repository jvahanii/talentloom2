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
      ai_usage: {
        Row: {
          calls: number
          created_at: string
          day: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calls?: number
          created_at?: string
          day?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calls?: number
          created_at?: string
          day?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_sample: boolean
          last_activity_at: string
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          requisition_id: string | null
          resume_link: string | null
          source: string | null
          stage: Database["public"]["Enums"]["candidate_stage"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_sample?: boolean
          last_activity_at?: string
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          requisition_id?: string | null
          resume_link?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_sample?: boolean
          last_activity_at?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          requisition_id?: string | null
          resume_link?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["candidate_stage"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_industry: string | null
          company_name: string | null
          company_size: string | null
          created_at: string
          full_name: string | null
          id: string
          job_title: string | null
          job_title_other: string | null
          onboarding_completed_at: string | null
          onboarding_step: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_industry?: string | null
          company_name?: string | null
          company_size?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          job_title?: string | null
          job_title_other?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_industry?: string | null
          company_name?: string | null
          company_size?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          job_title_other?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          updated_at?: string
        }
        Relationships: []
      }
      requisitions: {
        Row: {
          created_at: string
          department: string | null
          hiring_manager: string | null
          id: string
          is_sample: boolean
          notes: string | null
          status: Database["public"]["Enums"]["requisition_status"]
          target_start_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          hiring_manager?: string | null
          id?: string
          is_sample?: boolean
          notes?: string | null
          status?: Database["public"]["Enums"]["requisition_status"]
          target_start_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          hiring_manager?: string | null
          id?: string
          is_sample?: boolean
          notes?: string | null
          status?: Database["public"]["Enums"]["requisition_status"]
          target_start_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stage_history: {
        Row: {
          candidate_id: string
          changed_at: string
          from_stage: Database["public"]["Enums"]["candidate_stage"] | null
          id: string
          to_stage: Database["public"]["Enums"]["candidate_stage"]
          user_id: string
        }
        Insert: {
          candidate_id: string
          changed_at?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          to_stage: Database["public"]["Enums"]["candidate_stage"]
          user_id: string
        }
        Update: {
          candidate_id?: string
          changed_at?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          to_stage?: Database["public"]["Enums"]["candidate_stage"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_history_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_ai_usage: { Args: { p_limit: number }; Returns: boolean }
      clear_sample_data: { Args: never; Returns: undefined }
      seed_sample_data: { Args: never; Returns: undefined }
    }
    Enums: {
      candidate_stage:
        | "applied"
        | "screen"
        | "interview"
        | "offer"
        | "hired"
        | "rejected"
      requisition_status: "open" | "on_hold" | "filled" | "closed"
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
      candidate_stage: [
        "applied",
        "screen",
        "interview",
        "offer",
        "hired",
        "rejected",
      ],
      requisition_status: ["open", "on_hold", "filled", "closed"],
    },
  },
} as const
