"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createRoom,
  joinRoom,
} from "@/lib/client-api";
import {
  ensureSession,
  getMotionAllowed,
  getSoundEnabled,
  getUsername,
  applyMotionPreference,
  setMotionAllowed,
  setSoundEnabled,
  setUsername,
} from "@/lib/auth-client";
import { RulesModal } from "@/components/game-table/Overlays";
import { useMounted } from "@/hooks/useMounted";

export default function HomePage() {
  const router = useRouter();
  const mounted = useMounted();
  const [name, setName] = useState(() => getUsername());
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"ffa" | "2v2">("ffa");
  const [allowBots, setAllowBots] = useState(false);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [sound, setSound] = useState(() => getSoundEnabled());
  const [motion, setMotion] = useState(() => getMotionAllowed());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    applyMotionPreference();
    void ensureSession().then((s) => {
      if (!cancelled) setReady(s !== null || !isConfigured());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const validName = name.trim().length >= 1 && name.trim().length <= 18;

  async function withSession<T>(fn: () => Promise<T>): Promise<T> {
    if (!isConfigured()) throw new ApiError("NOT_CONFIGURED", "Supabase is not configured yet.", 503);
    const s = await ensureSession();
    if (!s) throw new ApiError("UNAUTHENTICATED", "Could not sign in. Try again.", 401);
    return fn();
  }

  const doCreate = async () => {
    if (!validName || busy) return;
    setBusy("create");
    setError(null);
    setUsername(name.trim());
    try {
      const res = await withSession(() => createRoom(name.trim(), mode, allowBots));
      router.push(`/room/${res.roomId}`);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const doJoin = async () => {
    if (!validName || !code.trim() || busy) return;
    setBusy("join");
    setError(null);
    setUsername(name.trim());
    try {
      const res = await withSession(() => joinRoom(code.trim(), name.trim()));
      router.push(`/room/${res.roomId}`);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 bg-zinc-950 p-5 text-white">
      <header className="pt-6 text-center">
        <h1 className="text-4xl font-black tracking-tight text-emerald-400">Murlan</h1>
        <p className="mt-1 text-sm text-zinc-400">Private card table for friends</p>
      </header>

      {!ready && (
        <p className="rounded-lg bg-white/5 px-3 py-2 text-center text-sm text-zinc-300">
          Connecting…
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-900/60 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-300">Username (1–18 characters)</span>
        <input
          value={mounted ? name : ""}
          onChange={(e) => setName(e.target.value)}
          maxLength={18}
          placeholder="e.g. Arben"
          aria-label="Username"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white placeholder:text-zinc-500"
        />
      </label>

      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Create a private room</h2>
        <div className="flex gap-2 text-sm" role="group" aria-label="Room mode">
          {(["ffa", "2v2"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-lg px-3 py-1.5 ${mode === m ? "bg-amber-300 text-zinc-900" : "bg-white/10"}`}
            >
              {m === "ffa" ? "Classic FFA" : "2v2 partners"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={allowBots}
            onChange={(e) => setAllowBots(e.target.checked)}
            className="h-4 w-4"
          />
          Allow filling empty seats with bots
        </label>
        <button
          type="button"
          onClick={doCreate}
          disabled={!mounted || !validName || busy !== null}
          className="rounded-xl bg-emerald-500 px-4 py-2.5 font-bold text-zinc-950 disabled:opacity-40"
        >
          {busy === "create" ? "Creating…" : "Create room"}
        </button>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="font-semibold">Join with a code</h2>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          aria-label="Room code"
          inputMode="text"
          autoCapitalize="characters"
          className="rounded-xl border border-white/15 bg-zinc-900 px-3 py-2.5 tracking-[0.25em] uppercase placeholder:text-zinc-600"
        />
        <button
          type="button"
          onClick={doJoin}
          disabled={!mounted || !validName || !code.trim() || busy !== null}
          className="rounded-xl bg-amber-300 px-4 py-2.5 font-bold text-zinc-900 disabled:opacity-40"
        >
          {busy === "join" ? "Joining…" : "Join room"}
        </button>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <h2 className="font-semibold">Settings</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={mounted && sound}
            onChange={(e) => {
              setSound(e.target.checked);
              setSoundEnabled(e.target.checked);
            }}
            className="h-4 w-4"
          />
          Sound effects (off by default)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!mounted || motion}
            onChange={(e) => {
              setMotion(e.target.checked);
              setMotionAllowed(e.target.checked);
            }}
            className="h-4 w-4"
          />
          Animations
        </label>
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="mt-1 rounded-xl border border-white/20 px-4 py-2 text-left"
        >
          How to play
        </button>
      </section>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
