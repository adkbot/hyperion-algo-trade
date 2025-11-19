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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
        }
        Relationships: []
      }
      adk_strategy_state: {
        Row: {
          asset: string
          confirmation1m_data: Json | null
          created_at: string | null
          current_phase: string
          date: string
          entry_signal: Json | null
          foundation_data: Json | null
          fvg15m_data: Json | null
          id: string
          next_action: string | null
          retest_data: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          asset: string
          confirmation1m_data?: Json | null
          created_at?: string | null
          current_phase: string
          date: string
          entry_signal?: Json | null
          foundation_data?: Json | null
          fvg15m_data?: Json | null
          id?: string
          next_action?: string | null
          retest_data?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          asset?: string
          confirmation1m_data?: Json | null
          created_at?: string | null
          current_phase?: string
          date?: string
          entry_signal?: Json | null
          foundation_data?: Json | null
          fvg15m_data?: Json | null
          id?: string
          next_action?: string | null
          retest_data?: Json | null
          updated_at?: string | null
          user_id?: string
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
          user_id: string | null
        }
        Insert: {
          agent_name: string
          asset: string
          created_at?: string | null
          data?: Json | null
          id?: string
          status: string
          user_id?: string | null
        }
        Update: {
          agent_name?: string
          asset?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          status?: string
          user_id?: string | null
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
          target_pnl_percent: number | null
          total_operations: number | null
          total_pnl: number | null
          user_id: string | null
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
          target_pnl_percent?: number | null
          total_operations?: number | null
          total_pnl?: number | null
          user_id?: string | null
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
          target_pnl_percent?: number | null
          total_operations?: number | null
          total_pnl?: number | null
          user_id?: string | null
          wins?: number | null
        }
        Relationships: []
      }
      market_conditions: {
        Row: {
          analysis_data: Json | null
          asset: string
          condition_type: string
          detected_at: string | null
          expires_at: string | null
          id: string
          trend_direction: string | null
          user_id: string
          volatility_score: number | null
          volume_profile: string | null
        }
        Insert: {
          analysis_data?: Json | null
          asset: string
          condition_type: string
          detected_at?: string | null
          expires_at?: string | null
          id?: string
          trend_direction?: string | null
          user_id: string
          volatility_score?: number | null
          volume_profile?: string | null
        }
        Update: {
          analysis_data?: Json | null
          asset?: string
          condition_type?: string
          detected_at?: string | null
          expires_at?: string | null
          id?: string
          trend_direction?: string | null
          user_id?: string
          volatility_score?: number | null
          volume_profile?: string | null
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
          strategy: string | null
          take_profit: number
          user_id: string | null
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
          strategy?: string | null
          take_profit: number
          user_id?: string | null
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
          strategy?: string | null
          take_profit?: number
          user_id?: string | null
        }
        Relationships: []
      }
      pending_signals: {
        Row: {
          agents: Json | null
          asset: string
          confidence_score: number | null
          created_at: string | null
          detected_at: string
          direction: string
          entry_price: number
          executed_at: string | null
          expires_at: string
          id: string
          risk_reward: number
          session: string
          signal_data: Json | null
          status: string
          stop_loss: number
          strategy: string
          take_profit: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agents?: Json | null
          asset: string
          confidence_score?: number | null
          created_at?: string | null
          detected_at?: string
          direction: string
          entry_price: number
          executed_at?: string | null
          expires_at: string
          id?: string
          risk_reward: number
          session: string
          signal_data?: Json | null
          status?: string
          stop_loss: number
          strategy: string
          take_profit: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agents?: Json | null
          asset?: string
          confidence_score?: number | null
          created_at?: string | null
          detected_at?: string
          direction?: string
          entry_price?: number
          executed_at?: string | null
          expires_at?: string
          id?: string
          risk_reward?: number
          session?: string
          signal_data?: Json | null
          status?: string
          stop_loss?: number
          strategy?: string
          take_profit?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      performance_metrics: {
        Row: {
          avg_rr: number | null
          best_strategy: string | null
          date: string
          id: string
          losses: number | null
          max_drawdown: number | null
          signals_detected: number | null
          signals_executed: number | null
          signals_expired: number | null
          signals_rejected: number | null
          strategy_performance: Json | null
          total_operations: number | null
          total_pnl: number | null
          updated_at: string | null
          user_id: string
          win_rate: number | null
          wins: number | null
          worst_strategy: string | null
        }
        Insert: {
          avg_rr?: number | null
          best_strategy?: string | null
          date?: string
          id?: string
          losses?: number | null
          max_drawdown?: number | null
          signals_detected?: number | null
          signals_executed?: number | null
          signals_expired?: number | null
          signals_rejected?: number | null
          strategy_performance?: Json | null
          total_operations?: number | null
          total_pnl?: number | null
          updated_at?: string | null
          user_id: string
          win_rate?: number | null
          wins?: number | null
          worst_strategy?: string | null
        }
        Update: {
          avg_rr?: number | null
          best_strategy?: string | null
          date?: string
          id?: string
          losses?: number | null
          max_drawdown?: number | null
          signals_detected?: number | null
          signals_executed?: number | null
          signals_expired?: number | null
          signals_rejected?: number | null
          strategy_performance?: Json | null
          total_operations?: number | null
          total_pnl?: number | null
          updated_at?: string | null
          user_id?: string
          win_rate?: number | null
          wins?: number | null
          worst_strategy?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          name: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      protection_logs: {
        Row: {
          asset: string
          confidence: number
          created_at: string | null
          decision: string
          id: string
          position_id: string | null
          reason: string
          rr_at_decision: number
          user_id: string | null
        }
        Insert: {
          asset: string
          confidence: number
          created_at?: string | null
          decision: string
          id?: string
          position_id?: string | null
          reason: string
          rr_at_decision: number
          user_id?: string | null
        }
        Update: {
          asset?: string
          confidence?: number
          created_at?: string | null
          decision?: string
          id?: string
          position_id?: string | null
          reason?: string
          rr_at_decision?: number
          user_id?: string | null
        }
        Relationships: []
      }
      risk_management_state: {
        Row: {
          consecutive_losses: number | null
          consecutive_wins: number | null
          cooldown_until: string | null
          current_risk_multiplier: number | null
          daily_drawdown_percent: number | null
          id: string
          last_5_ops_winrate: number | null
          last_trade_at: string | null
          mode: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          consecutive_losses?: number | null
          consecutive_wins?: number | null
          cooldown_until?: string | null
          current_risk_multiplier?: number | null
          daily_drawdown_percent?: number | null
          id?: string
          last_5_ops_winrate?: number | null
          last_trade_at?: string | null
          mode?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          consecutive_losses?: number | null
          consecutive_wins?: number | null
          cooldown_until?: string | null
          current_risk_multiplier?: number | null
          daily_drawdown_percent?: number | null
          id?: string
          last_5_ops_winrate?: number | null
          last_trade_at?: string | null
          mode?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      session_foundation: {
        Row: {
          created_at: string | null
          date: string
          high: number
          id: string
          low: number
          session: string
          timeframe: string | null
          timestamp: string
          user_id: string
          validity_type: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          high: number
          id?: string
          low: number
          session: string
          timeframe?: string | null
          timestamp: string
          user_id: string
          validity_type?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          high?: number
          id?: string
          low?: number
          session?: string
          timeframe?: string | null
          timestamp?: string
          user_id?: string
          validity_type?: string | null
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
          event_data: Json | null
          event_type: string | null
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
          user_id: string | null
          volume_factor: number | null
        }
        Insert: {
          c1_direction?: string | null
          confidence_score?: number | null
          confirmation?: string | null
          created_at?: string | null
          cycle_phase: string
          direction?: string | null
          event_data?: Json | null
          event_type?: string | null
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
          user_id?: string | null
          volume_factor?: number | null
        }
        Update: {
          c1_direction?: string | null
          confidence_score?: number | null
          confirmation?: string | null
          created_at?: string | null
          cycle_phase?: string
          direction?: string | null
          event_data?: Json | null
          event_type?: string | null
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
          user_id?: string | null
          volume_factor?: number | null
        }
        Relationships: []
      }
      session_state: {
        Row: {
          asia_confirmation: string | null
          asia_direction: string | null
          c1_confidence: number | null
          c1_direction: string | null
          created_at: string | null
          date: string
          id: string
          london_range_high: number | null
          london_range_low: number | null
          oceania_high: number | null
          oceania_low: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          asia_confirmation?: string | null
          asia_direction?: string | null
          c1_confidence?: number | null
          c1_direction?: string | null
          created_at?: string | null
          date: string
          id?: string
          london_range_high?: number | null
          london_range_low?: number | null
          oceania_high?: number | null
          oceania_low?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          asia_confirmation?: string | null
          asia_direction?: string | null
          c1_confidence?: number | null
          c1_direction?: string | null
          created_at?: string | null
          date?: string
          id?: string
          london_range_high?: number | null
          london_range_low?: number | null
          oceania_high?: number | null
          oceania_low?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      session_trade_count: {
        Row: {
          created_at: string | null
          date: string
          id: string
          session: string
          trade_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          session: string
          trade_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          session?: string
          trade_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      strategy_config: {
        Row: {
          allowed_sessions: string[] | null
          created_at: string | null
          id: string
          is_active: boolean | null
          market_conditions: string[] | null
          max_positions: number | null
          min_confidence_score: number | null
          preferred_pairs: string[] | null
          priority: number | null
          risk_per_trade_multiplier: number | null
          strategy_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allowed_sessions?: string[] | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          market_conditions?: string[] | null
          max_positions?: number | null
          min_confidence_score?: number | null
          preferred_pairs?: string[] | null
          priority?: number | null
          risk_per_trade_multiplier?: number | null
          strategy_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allowed_sessions?: string[] | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          market_conditions?: string[] | null
          max_positions?: number | null
          min_confidence_score?: number | null
          preferred_pairs?: string[] | null
          priority?: number | null
          risk_per_trade_multiplier?: number | null
          strategy_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          action_required: boolean | null
          action_url: string | null
          alert_type: string
          category: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          severity: number | null
          title: string
          user_id: string
        }
        Insert: {
          action_required?: boolean | null
          action_url?: string | null
          alert_type: string
          category: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          severity?: number | null
          title: string
          user_id: string
        }
        Update: {
          action_required?: boolean | null
          action_url?: string | null
          alert_type?: string
          category?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          severity?: number | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          active_strategies: string[] | null
          api_key: string | null
          api_secret: string | null
          balance: number
          bot_status: string | null
          cooldown_disabled_until: string | null
          created_at: string | null
          id: string
          leverage: number | null
          max_positions: number | null
          paper_mode: boolean | null
          profit_target_percent: number | null
          risk_per_trade: number | null
          single_position_mode: boolean | null
          trading_strategy: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active_strategies?: string[] | null
          api_key?: string | null
          api_secret?: string | null
          balance?: number
          bot_status?: string | null
          cooldown_disabled_until?: string | null
          created_at?: string | null
          id?: string
          leverage?: number | null
          max_positions?: number | null
          paper_mode?: boolean | null
          profit_target_percent?: number | null
          risk_per_trade?: number | null
          single_position_mode?: boolean | null
          trading_strategy?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active_strategies?: string[] | null
          api_key?: string | null
          api_secret?: string | null
          balance?: number
          bot_status?: string | null
          cooldown_disabled_until?: string | null
          created_at?: string | null
          id?: string
          leverage?: number | null
          max_positions?: number | null
          paper_mode?: boolean | null
          profit_target_percent?: number | null
          risk_per_trade?: number | null
          single_position_mode?: boolean | null
          trading_strategy?: string | null
          updated_at?: string | null
          user_id?: string | null
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
