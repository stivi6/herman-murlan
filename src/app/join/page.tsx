"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError, joinRoom } from "@/lib/client-api";
import { ensureSession, getUsername, setUsername } from "@/lib/auth-client";
import { useMounted } from "@/hooks/useMounted";

function JoinInner() {
  const router = useRouter();
  const search = useSearchParams();
  const mounted = useMounted();
  const initialCode = (search.get("code") ?? "").toUpperCase();
  const [name, setName] = useState(() => getUsername());
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ensureSession();
  }, []);

  const go = async () => {
    if (!name.trim() || !code.trim() || busy) return;
    setBusy(true);
    setError(null);
    setUsername(name.trim());
    try {
      const s = await ensureSession();
      if (!s) throw new ApiError("UNAUTHENTICATED", "Could not sign in.", 401);
      const res = await joinRoom(code.trim(), name.trim());
      router.push(`/room/${res.roomId}`);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 bg-zinc-950 p-5 text-white">
      <h1 className="pt-6 text-2xl font-bold">Join room</h1>
      {error && (
        <p role="alert" className="rounded-lg bg-red-900/60 px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span>Username</span>
        <input
          value={mounted ? name : ""}
          onChange={(e) => setName(e.target.value)}
          maxLength={18}
          aria-label="Username"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Room code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          aria-label="Room code"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 tracking-[0.25em] uppercase"
        />
      </label>
      <button
        type="button"
        onClick={go}
        disabled={!mounted || busy || !name.trim() || !code.trim()}
        className="rounded-xl bg-amber-300 px-4 py-2.5 font-bold text-zinc-900 disabled:opacity-40"
      >
        {busy ? "Joining…" : "Join"}
      </button>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-zinc-950 text-white">Loading…</div>}>
      <JoinInner />
    </Suspense>
  );
}
