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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      active_positions: {
        Row: {
          agents: Json | null
          asset: string
          current_pnl: number | null
          current_price: number | null
          direction: string
          entry_price: number
          id: string
          opened_at: string | null
          projected_profit: number
          risk_reward: number
          session: string | null
          stop_loss: number
          take_profit: number
          updated_at: string | null
        }
        Insert: {
          agents?: Json | null
          asset: string
          current_pnl?: number | null
          current_price?: number | null
          direction: string
          entry_price: number
          id?: string
          opened_at?: string | null
          projected_profit: number
          risk_reward: number
          session?: string | null
          stop_loss: number
          take_profit: number
          updated_at?: string | null
        }
        Update: {
          agents?: Json | null
          asset?: string
          current_pnl?: number | null
          current_price?: number | null
          direction?: string
          entry_price?: number
          id?: string
          opened_at?: string | null
          projected_profit?: number
          risk_reward?: number
          session?: string | null
          stop_loss?: number
          take_profit?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_logs: {
        Row: {
          agent_name: string
          asset: string
          created_at: string | null
          data: Json | null
          id: string
          status: string
        }
        Insert: {
          agent_name: string
          asset: string
          created_at?: string | null
          data?: Json | null
          id?: string
          status: string
        }
        Update: {
          agent_name?: string
          asset?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      daily_goals: {
        Row: {
          completed: boolean | null
          created_at: string | null
          date: string
          id: string
          losses: number | null
          max_losses: number | null
          projected_completion_time: string | null
          target_operations: number | null
          total_operations: number | null
          total_pnl: number | null
          wins: number | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          date: string
          id?: string
          losses?: number | null
          max_losses?: number | null
          projected_completion_time?: string | null
          target_operations?: number | null
          total_operations?: number | null
          total_pnl?: number | null
          wins?: number | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          date?: string
          id?: string
          losses?: number | null
          max_losses?: number | null
          projected_completion_time?: string | null
          target_operations?: number | null
          total_operations?: number | null
          total_pnl?: number | null
          wins?: number | null
        }
        Relationships: []
      }
      operations: {
        Row: {
          agents: Json | null
          asset: string
          created_at: string | null
          direction: string
          entry_price: number
          entry_time: string | null
          exit_price: number | null
          exit_time: string | null
          id: string
          pnl: number | null
          result: string | null
          risk_reward: number
          session: string | null
          stop_loss: number
          take_profit: number
        }
        Insert: {
          agents?: Json | null
          asset: string
          created_at?: string | null
          direction: string
          entry_price: number
          entry_time?: string | null
          exit_price?: number | null
          exit_time?: string | null
          id?: string
          pnl?: number | null
          result?: string | null
          risk_reward: number
          session?: string | null
          stop_loss: number
          take_profit: number
        }
        Update: {
          agents?: Json | null
          asset?: string
          created_at?: string | null
          direction?: string
          entry_price?: number
          entry_time?: string | null
          exit_price?: number | null
          exit_time?: string | null
          id?: string
          pnl?: number | null
          result?: string | null
          risk_reward?: number
          session?: string | null
          stop_loss?: number
          take_profit?: number
        }
        Relationships: []
      }
      session_history: {
        Row: {
          c1_direction: string | null
          confidence_score: number | null
          confirmation: string | null
          created_at: string | null
          cycle_phase: string
          direction: string | null
          id: string
          market_data: Json | null
          notes: string | null
          pair: string
          range_high: number | null
          range_low: number | null
          risk: Json | null
          session: string
          signal: string | null
          timestamp: string
          volume_factor: number | null
        }
        Insert: {
          c1_direction?: string | null
          confidence_score?: number | null
          confirmation?: string | null
          created_at?: string | null
          cycle_phase: string
          direction?: string | null
          id?: string
          market_data?: Json | null
          notes?: string | null
          pair: string
          range_high?: number | null
          range_low?: number | null
          risk?: Json | null
          session: string
          signal?: string | null
          timestamp: string
          volume_factor?: number | null
        }
        Update: {
          c1_direction?: string | null
          confidence_score?: number | null
          confirmation?: string | null
          created_at?: string | null
          cycle_phase?: string
          direction?: string | null
          id?: string
          market_data?: Json | null
          notes?: string | null
          pair?: string
          range_high?: number | null
          range_low?: number | null
          risk?: Json | null
          session?: string
          signal?: string | null
          timestamp?: string
          volume_factor?: number | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          api_key: string | null
          api_secret: string | null
          balance: number
          bot_status: string | null
          created_at: string | null
          id: string
          max_positions: number | null
          paper_mode: boolean | null
          risk_per_trade: number | null
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          balance?: number
          bot_status?: string | null
          created_at?: string | null
          id?: string
          max_positions?: number | null
          paper_mode?: boolean | null
          risk_per_trade?: number | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          balance?: number
          bot_status?: string | null
          created_at?: string | null
          id?: string
          max_positions?: number | null
          paper_mode?: boolean | null
          risk_per_trade?: number | null
          updated_at?: string | null
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
