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
      applied_jobs: {
        Row: {
          applied_at: string
          id: string
          job_id: string
          last_notified_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          notes: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          id?: string
          job_id: string
          last_notified_status?:
            | Database["public"]["Enums"]["application_status"]
            | null
          notes?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string
          id?: string
          job_id?: string
          last_notified_status?:
            | Database["public"]["Enums"]["application_status"]
            | null
          notes?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applied_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_match_scores: {
        Row: {
          created_at: string
          feedback: number | null
          feedback_note: string | null
          gaps: string[] | null
          job_id: string
          score: number
          strengths: string[] | null
          summary: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: number | null
          feedback_note?: string | null
          gaps?: string[] | null
          job_id: string
          score: number
          strengths?: string[] | null
          summary?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          feedback?: number | null
          feedback_note?: string | null
          gaps?: string[] | null
          job_id?: string
          score?: number
          strengths?: string[] | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_match_scores_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          apply_url: string | null
          company: string
          company_logo: string | null
          created_at: string
          currency: string
          description: string
          experience_level: Database["public"]["Enums"]["experience_level"]
          external_id: string | null
          id: string
          location: string
          posted_at: string
          role: string
          salary_max: number | null
          salary_min: number | null
          skills: string[]
          source: string | null
          title: string
          work_mode: Database["public"]["Enums"]["work_mode"]
        }
        Insert: {
          apply_url?: string | null
          company: string
          company_logo?: string | null
          created_at?: string
          currency?: string
          description: string
          experience_level?: Database["public"]["Enums"]["experience_level"]
          external_id?: string | null
          id?: string
          location: string
          posted_at?: string
          role: string
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[]
          source?: string | null
          title: string
          work_mode?: Database["public"]["Enums"]["work_mode"]
        }
        Update: {
          apply_url?: string | null
          company?: string
          company_logo?: string | null
          created_at?: string
          currency?: string
          description?: string
          experience_level?: Database["public"]["Enums"]["experience_level"]
          external_id?: string | null
          id?: string
          location?: string
          posted_at?: string
          role?: string
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[]
          source?: string | null
          title?: string
          work_mode?: Database["public"]["Enums"]["work_mode"]
        }
        Relationships: []
      }
      notified_jobs: {
        Row: {
          created_at: string
          job_id: string
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          job_id: string
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          job_id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notified_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          headline: string | null
          id: string
          location: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          headline?: string | null
          id: string
          location?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          headline?: string | null
          id?: string
          location?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      resumes: {
        Row: {
          ai_analysis: Json | null
          created_at: string
          file_name: string
          file_path: string
          id: string
          is_active: boolean
          parsed_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          is_active?: boolean
          parsed_text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          is_active?: boolean
          parsed_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          created_at: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      search_history: {
        Row: {
          created_at: string
          filters: Json
          id: string
          query: string
          result_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          query?: string
          result_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          query?: string
          result_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_notifications: {
        Row: {
          applied_id: string | null
          attempts: number
          chat_id_masked: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: string
          last_error: string | null
          message: string
          metadata: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_id?: string | null
          attempts?: number
          chat_id_masked?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind: string
          last_error?: string | null
          message: string
          metadata?: Json
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_id?: string | null
          attempts?: number
          chat_id_masked?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: string
          last_error?: string | null
          message?: string
          metadata?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_notifications_applied_id_fkey"
            columns: ["applied_id"]
            isOneToOne: false
            referencedRelation: "applied_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string
          notify_application_updates: boolean
          notify_new_matches: boolean
          preferred_locations: string[] | null
          preferred_roles: string[] | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notify_application_updates?: boolean
          notify_new_matches?: boolean
          preferred_locations?: string[] | null
          preferred_roles?: string[] | null
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notify_application_updates?: boolean
          notify_new_matches?: boolean
          preferred_locations?: string[] | null
          preferred_roles?: string[] | null
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_telegram_credentials: {
        Row: {
          bot_token: string
          chat_id: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_token: string
          chat_id: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_token?: string
          chat_id?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      application_status:
        | "applied"
        | "interview"
        | "offer"
        | "rejected"
        | "withdrawn"
      experience_level:
        | "intern"
        | "entry"
        | "mid"
        | "senior"
        | "lead"
        | "executive"
      work_mode: "remote" | "hybrid" | "onsite"
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
      application_status: [
        "applied",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
      ],
      experience_level: [
        "intern",
        "entry",
        "mid",
        "senior",
        "lead",
        "executive",
      ],
      work_mode: ["remote", "hybrid", "onsite"],
    },
  },
} as const
