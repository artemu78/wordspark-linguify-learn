export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      languages: {
        Row: {
          code: string
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: number
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      stories: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          vocabulary_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title: string
          updated_at?: string
          vocabulary_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          vocabulary_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_vocabulary_id_fkey"
            columns: ["vocabulary_id"]
            isOneToOne: false
            referencedRelation: "vocabularies"
            referencedColumns: ["id"]
          },
        ]
      }
      story_bits: {
        Row: {
          created_at: string
          id: string
          image_prompt: string | null
          image_url: string | null
          sentence: string
          sentence_language_you_know: string | null
          sequence_number: number
          story_id: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          sentence: string
          sentence_language_you_know?: string | null
          sequence_number: number
          story_id: string
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          sentence?: string
          sentence_language_you_know?: string | null
          sequence_number?: number
          story_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_bits_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_progress: {
        Row: {
          attempts: number | null
          choice_correct: boolean | null
          id: string
          is_correct: boolean | null
          last_attempted: string | null
          typing_correct: boolean | null
          user_id: string
          vocabulary_id: string
          word_id: string
        }
        Insert: {
          attempts?: number | null
          choice_correct?: boolean | null
          id?: string
          is_correct?: boolean | null
          last_attempted?: string | null
          typing_correct?: boolean | null
          user_id: string
          vocabulary_id: string
          word_id: string
        }
        Update: {
          attempts?: number | null
          choice_correct?: boolean | null
          id?: string
          is_correct?: boolean | null
          last_attempted?: string | null
          typing_correct?: boolean | null
          user_id?: string
          vocabulary_id?: string
          word_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_vocabulary_id_fkey"
            columns: ["vocabulary_id"]
            isOneToOne: false
            referencedRelation: "vocabularies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_progress_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_words"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabularies: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean | null
          is_public: boolean
          source_language: string
          target_language: string
          title: string
          topic: string
          updated_at: string | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean
          source_language?: string
          target_language?: string
          title: string
          topic: string
          updated_at?: string | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean
          source_language?: string
          target_language?: string
          title?: string
          topic?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      vocabulary_completion: {
        Row: {
          completed_at: string | null
          id: string
          user_id: string
          vocabulary_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          user_id: string
          vocabulary_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          user_id?: string
          vocabulary_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_completion_vocabulary_id_fkey"
            columns: ["vocabulary_id"]
            isOneToOne: false
            referencedRelation: "vocabularies"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary_words: {
        Row: {
          audio_url: string | null
          created_at: string | null
          id: string
          translation: string
          vocabulary_id: string
          word: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string | null
          id?: string
          translation: string
          vocabulary_id: string
          word: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string | null
          id?: string
          translation?: string
          vocabulary_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "vocabulary_words_vocabulary_id_fkey"
            columns: ["vocabulary_id"]
            isOneToOne: false
            referencedRelation: "vocabularies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "user" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "admin"],
    },
  },
} as const
