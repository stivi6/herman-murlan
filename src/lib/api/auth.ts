import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AuthedUser {
  id: string;
}

/** Verify the Supabase session and return the user id, or null. */
export async function requireUser(): Promise<AuthedUser | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}

export function jsonError(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, code, message, ...extra }, { status });
}

export function jsonOk<T extends Record<string, unknown>>(body: T, status = 200) {
  return Response.json({ ok: true, ...body }, { status });
}

/** Map engine RuleError codes to stable API codes (same names). */
export function engineCodeToHttp(code: string): number {
  switch (code) {
    case "STALE_STATE":
      return 409;
    case "NOT_YOUR_TURN":
    case "ALREADY_PASSED":
      return 409;
    default:
      return 422;
  }
}
