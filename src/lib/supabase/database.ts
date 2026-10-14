/**
 * Minimal Supabase Database typing for our tables + RPC.
 * Keeps the admin client typed without running codegen.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export interface Database {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          code: string;
          host_user_id: string;
          mode: string;
          status: string;
          created_at: string;
          expires_at: string;
          current_match_id: string | null;
          settings: Json;
        };
        Insert: {
          id?: string;
          code: string;
          host_user_id: string;
          mode?: string;
          status?: string;
          created_at?: string;
          expires_at?: string;
          current_match_id?: string | null;
          settings?: Json;
        };
        Update: {
          code?: string;
          host_user_id?: string;
          mode?: string;
          status?: string;
          expires_at?: string;
          current_match_id?: string | null;
          settings?: Json;
        };
        Relationships: [];
      };
      room_members: {
        Row: {
          room_id: string;
          user_id: string;
          seat_index: number;
          display_name: string;
          ready: boolean;
          team_id: number | null;
          is_bot: boolean;
          is_host: boolean;
          joined_at: string;
          last_seen_at: string;
          presence_status: string;
        };
        Insert: {
          room_id: string;
          user_id: string;
          seat_index: number;
          display_name: string;
          ready?: boolean;
          team_id?: number | null;
          is_bot?: boolean;
          is_host?: boolean;
          joined_at?: string;
          last_seen_at?: string;
          presence_status?: string;
        };
        Update: {
          display_name?: string;
          ready?: boolean;
          team_id?: number | null;
          is_bot?: boolean;
          is_host?: boolean;
          last_seen_at?: string;
          presence_status?: string;
        };
        Relationships: [];
      };
      game_sessions: {
        Row: {
          id: string;
          room_id: string;
          schema_version: number;
          version: number;
          status: string;
          private_state: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          schema_version?: number;
          version?: number;
          status?: string;
          private_state: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          version?: number;
          status?: string;
          private_state?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      match_public_snapshots: {
        Row: {
          match_id: string;
          room_id: string;
          version: number;
          snapshot: Json;
          updated_at: string;
        };
        Insert: {
          match_id: string;
          room_id: string;
          version?: number;
          snapshot: Json;
          updated_at?: string;
        };
        Update: {
          version?: number;
          snapshot?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_action_receipts: {
        Row: {
          match_id: string;
          actor_user_id: string;
          action_id: string;
          result: string;
          resulting_version: number | null;
          response: Json | null;
          created_at: string;
        };
        Insert: {
          match_id: string;
          actor_user_id: string;
          action_id: string;
          result: string;
          resulting_version?: number | null;
          response?: Json | null;
        };
        Update: {
          result?: string;
          resulting_version?: number | null;
          response?: Json | null;
        };
        Relationships: [];
      };
      game_events: {
        Row: {
          id: number;
          match_id: string;
          room_id: string;
          version: number;
          kind: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          match_id: string;
          room_id: string;
          version: number;
          kind: string;
          payload?: Json;
        };
        Update: {
          kind?: string;
          payload?: Json;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      commit_match_transition: {
        Args: {
          p_session_id: string;
          p_expected_version: number;
          p_action_id: string;
          p_actor_id: string;
          p_accepted: boolean;
          p_new_version: number;
          p_new_private: Json;
          p_new_snapshot: Json;
          p_event_kind: string;
          p_event_payload: Json;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
