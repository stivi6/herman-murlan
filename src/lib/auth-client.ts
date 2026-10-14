"use client";
/**
 * Browser-side auth: Supabase anonymous sign-in + local username.
 */
import { createClient } from "@/lib/supabase/browser";

const USER_KEY = "murlan.username";
const SOUND_KEY = "murlan.sound";
const MOTION_KEY = "murlan.motion";

let browserClient: ReturnType<typeof createClient> | null = null;

export function supabaseBrowser() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}

function configured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let inflightSession: Promise<{ userId: string } | null> | null = null;

export async function ensureSession(): Promise<{ userId: string } | null> {
  if (!configured()) return null;
  const supabase = supabaseBrowser();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return { userId: data.session.user.id };
  // Single-flight: React StrictMode double-mounts effects, which would fire
  // two concurrent anonymous sign-ins. The loser would overwrite the winner's
  // session AFTER a room was already created under it ("not a member" bug).
  if (!inflightSession) {
    inflightSession = supabase.auth
      .signInAnonymously()
      .then(({ data: signed, error }) => {
        if (error || !signed.session?.user) return null;
        return { userId: signed.session.user.id };
      })
      .finally(() => {
        inflightSession = null;
      });
  }
  return inflightSession;
}

export function getUsername(): string {
  try {
    return localStorage.getItem(USER_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setUsername(name: string) {
  try {
    localStorage.setItem(USER_KEY, name);
  } catch {
    // ignore
  }
}

export function getSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

export function getMotionAllowed(): boolean {
  try {
    const v = localStorage.getItem(MOTION_KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setMotionAllowed(on: boolean) {
  try {
    localStorage.setItem(MOTION_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
  applyMotionPreference();
}

/** Sync the document class with the stored animation preference. Client-only. */
export function applyMotionPreference() {
  try {
    const allowed = getMotionAllowed();
    const prefersReduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.toggle("motion-off", !allowed || prefersReduced);
  } catch {
    // ignore
  }
}
