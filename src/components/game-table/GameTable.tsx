"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchSnapshot } from "@/lib/client-api";
import { cardFromId } from "@/lib/game/cards";
import { classifyCombination } from "@/lib/game/combinations";
import { beats } from "@/lib/game/compare";
import { getSoundEnabled } from "@/lib/auth-client";
import { sounds } from "@/lib/sound";
import { PlayerHand } from "./PlayerHand";
import { TrickArea } from "./TrickArea";
import { OpponentFan, SeatChip } from "./OpponentFan";
import { Hud } from "./Hud";
import {
  ExchangePanel,
  HandResultOverlay,
  MatchResultOverlay,
  RulesModal,
} from "./Overlays";
import { cn } from "@/lib/cn";

function playSound(kind: "play" | "pass" | "win" | "error") {
  try {
    if (getSoundEnabled()) sounds[kind]();
  } catch {
    // ignore
  }
}

export function GameTable({
  snapshot,
  acting,
  notice,
  connected,
  onAct,
  onAdvance,
  onRematch,
  onLobby,
  onLeave,
  onEndMatch,
}: {
  snapshot: MatchSnapshot;
  acting: boolean;
  notice: string | null;
  connected: "live" | "polling" | "offline";
  onAct: (intent: { type: "play"; cardIds: string[] } | { type: "pass" } | { type: "exchangeSelect"; cardId: string }) => Promise<boolean>;
  onAdvance: () => void;
  onRematch: () => void;
  onLobby: () => void;
  onLeave: () => void;
  onEndMatch: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  // If the table changed under the player's tap (bot move landed mid-tap),
  // explain why Play did nothing instead of failing silently.
  const [tapError, setTapError] = useState<string | null>(null);
  // Optimistic play: show the tapped cards on the table instantly; the next
  // authoritative snapshot (higher version) replaces them. Display-only —
  // the server remains the source of truth.
  const [pending, setPending] = useState<string[] | null>(null);
  const seenVersion = useRef(snapshot.version);
  useEffect(() => {
    if (snapshot.version !== seenVersion.current) {
      seenVersion.current = snapshot.version;
      setPending(null);
      setTapError(null);
    }
  }, [snapshot.version]);
  const pendingSet = useMemo(() => new Set(pending ?? []), [pending]);
  const mySeat = snapshot.mySeat;
  const isMyTurn = mySeat !== null && snapshot.currentActor === mySeat && snapshot.status === "playing";
  const inExchange = snapshot.status === "exchange" && snapshot.exchange?.needsReturnFrom === mySeat;

  const toggle = (id: string) => {
    setTapError(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Client-side pre-validation reuses the pure engine (server still authoritative).
  const preview = useMemo(() => {
    if (selected.length === 0) return { ok: false as const, reason: "Select cards to play." };
    try {
      const cards = selected.map(cardFromId);
      const cls = classifyCombination(cards);
      if (!cls.ok) return { ok: false as const, reason: cls.error.message };
      if (snapshot.isFirstHand && snapshot.openingPending && !selected.includes("S3")) {
        return { ok: false as const, reason: "The opening play must include 3♠." };
      }
      const table = snapshot.currentCombo
        ? (() => {
            const t = classifyCombination(snapshot.currentCombo.cardIds.map(cardFromId));
            return t.ok ? t.value : null;
          })()
        : null;
      if (!beats(cls.value, table)) {
        return { ok: false as const, reason: "That does not beat the current play." };
      }
      return { ok: true as const, label: cls.value.type };
    } catch {
      return { ok: false as const, reason: "Invalid selection." };
    }
  }, [selected, snapshot]);

  const canPass = isMyTurn && snapshot.currentCombo !== null;

  const doPlay = () => {
    if (acting) return;
    if (!preview.ok) {
      setTapError(preview.reason);
      return;
    }
    const ids = [...selected];
    playSound("play");
    setPending(ids);
    setSelected([]);
    void onAct({ type: "play", cardIds: ids }).then((done) => {
      // On success the version-bump effect clears pending. On failure the
      // server state never changed, so drop the optimistic cards immediately.
      if (!done) setPending(null);
    });
  };

  const doPass = () => {
    if (!canPass || acting) return;
    playSound("pass");
    void onAct({ type: "pass" }).then((done) => {
      if (done) setSelected([]);
    });
  };

  const doExchange = () => {
    if (selected.length !== 1 || acting) return;
    void onAct({ type: "exchangeSelect", cardId: selected[0] }).then((done) => {
      if (done) setSelected([]);
    });
  };

  // Seat rotation: mySeat rendered at bottom; order bottom,left,top,right clockwise.
  const order = useMemo(() => {
    if (mySeat === null) return [0, 1, 2, 3];
    return [0, 1, 2, 3].map((i) => (mySeat + i) % 4);
  }, [mySeat]);
  const [bottom, left, top, right] = order;
  const seatBy = (s: number) => snapshot.seats.find((x) => x.seat === s)!;

  const [noticeText, actionId] = (notice ?? "").split("::");

  return (
    <div className="murlan-room flex h-dvh flex-col overflow-hidden text-[var(--cream)]">
      {/* Ornamental outer frame with corner glints */}
      <div className="relative mx-2 mb-[max(0.5rem,env(safe-area-inset-bottom))] mt-[max(0.5rem,env(safe-area-inset-top))] flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--gold)]/60 shadow-[0_0_36px_rgba(234,184,63,0.10)] sm:mx-3">
        <span className="murlan-glint left-2 top-2" />
        <span className="murlan-glint right-2 top-2" />
        <span className="murlan-glint bottom-2 left-2" />
        <span className="murlan-glint bottom-2 right-2" />

        <Hud
          snapshot={snapshot}
          connected={connected}
          onRules={() => setShowRules(true)}
          onEnd={() => {
            if (window.confirm("End this match and return the room to the lobby?")) onEndMatch();
          }}
          onLeave={onLeave}
        />
        <div className="flex gap-1.5 px-2 pb-1 sm:hidden">
          {[top, left, right].map((s) => (
            <SeatChip key={s} seat={seatBy(s)} active={snapshot.currentActor === s} />
          ))}
        </div>

        <main className="murlan-felt relative mx-2 mb-2 flex min-h-0 flex-1 flex-col items-stretch gap-1 overflow-y-auto rounded-2xl px-2 py-2 sm:gap-2">
          {/* Club crest drawn into the felt: large centered watermark behind play */}
          <img
            src="/images/herman-murlan-logo.png"
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-[42%] z-0 w-[min(80%,58vmin)] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.17] [mask-image:radial-gradient(ellipse_at_center,black_58%,transparent_80%)]"
          />
          {/* Top opponent */}
          <div className="relative z-10 hidden justify-center sm:flex">
            <OpponentFan seat={seatBy(top)} orientation="top" active={snapshot.currentActor === top} />
          </div>

          {/* Middle row: side seats + center pile */}
          <div className="relative z-10 flex min-h-0 flex-1 items-center justify-between gap-1">
            <div className="hidden shrink-0 sm:block">
              <OpponentFan seat={seatBy(left)} orientation="left" active={snapshot.currentActor === left} />
            </div>
            <div className="min-w-0 flex-1">
              <TrickArea
                current={snapshot.currentCombo}
                openingPending={snapshot.openingPending}
                pending={pending}
                actorName={
                  snapshot.currentCombo ? seatBy(snapshot.currentCombo.playedBy).displayName : null
                }
              />
            </div>
            <div className="hidden shrink-0 sm:block">
              <OpponentFan seat={seatBy(right)} orientation="right" active={snapshot.currentActor === right} />
            </div>
          </div>

          {/* Bottom dock: hand + actions */}
          <div className="relative z-10 flex flex-col items-center gap-1">
            {(noticeText || actionId) && (
              <p role="status" className="rounded-lg bg-black/60 px-3 py-1 text-xs text-[var(--gold-highlight)]">
                {noticeText}
              </p>
            )}
            {tapError && (
              <p role="status" className="rounded-lg bg-black/60 px-3 py-1 text-xs text-[var(--gold-highlight)]">
                {tapError} — pick again.
              </p>
            )}
            {isMyTurn && !preview.ok && selected.length > 0 && (
              <p role="status" className="text-xs text-[var(--gold-highlight)]">
                {preview.reason}
              </p>
            )}
            {isMyTurn && snapshot.currentCombo === null && !snapshot.openingPending && (
              <p className="text-xs text-[var(--cream)]">Your lead — play any combination.</p>
            )}
            {inExchange && (
              <ExchangePanel
                snapshot={snapshot}
                selected={selected}
                onToggle={(id) => setSelected([id])}
                onConfirm={doExchange}
                acting={acting}
              />
            )}
            {!inExchange && (
              <>
                <PlayerHand
                  cards={snapshot.myCards.filter((c) => !pendingSet.has(c.id))}
                  selected={selected}
                  onToggle={toggle}
                  disabled={acting || !isMyTurn}
                  zoomed={isMyTurn}
                />
                <div className="flex w-full max-w-md items-center justify-between gap-3 px-2 pb-1">
                  <button
                    type="button"
                    onClick={doPass}
                    disabled={!canPass || acting}
                    aria-busy={acting}
                    title={!isMyTurn ? "Wait for your turn" : snapshot.currentCombo === null ? "You lead this trick — play a combination" : "Pass this trick"}
                    aria-label="Pass"
                    className="min-w-24 rounded-full border-2 border-[var(--gold)]/70 bg-gradient-to-b from-[#5b0f13] to-[#3a0709] px-[clamp(1.25rem,4vmin,2.5rem)] py-[clamp(0.6rem,1.8vmin,1rem)] text-[clamp(0.85rem,2.4vmin,1.25rem)] font-black tracking-widest text-[var(--cream)] shadow-[0_4px_14px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,224,138,0.35)] transition-all duration-150 hover:border-[var(--gold-highlight)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
                  >
                    PASS
                  </button>
                  {isMyTurn ? (
                    <p className="animate-pulse rounded-full bg-[var(--gold)] px-4 py-1 text-center text-[clamp(0.7rem,2vmin,0.9rem)] font-black tracking-widest text-[var(--room-shadow)] shadow-[0_0_16px_rgba(234,184,63,0.7)]">
                      YOUR TURN
                    </p>
                  ) : (
                    <p className="text-center text-xs text-[var(--text-muted)]">
                      {seatBy(snapshot.currentActor ?? bottom).displayName} to play
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={doPlay}
                    disabled={!isMyTurn || !preview.ok || acting}
                    aria-busy={acting}
                    aria-label="Play selected cards"
                    className="min-w-24 rounded-full border-2 border-[var(--gold-highlight)] bg-gradient-to-b from-[var(--gold-highlight)] via-[var(--gold)] to-[var(--gold-shadow)] px-[clamp(1.25rem,4vmin,2.5rem)] py-[clamp(0.6rem,1.8vmin,1rem)] text-[clamp(0.85rem,2.4vmin,1.25rem)] font-black tracking-widest text-[var(--room-shadow)] shadow-[0_4px_16px_rgba(234,184,63,0.35),inset_0_1px_0_rgba(255,255,255,0.5)] transition-all duration-150 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
                  >
                    {acting ? "…" : "PLAY"}
                  </button>
                </div>
                <div className="flex items-center gap-2 pb-1">
                  {selected.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelected([])}
                      className="rounded-xl px-3 py-1 text-xs text-[var(--text-muted)] underline hover:text-[var(--cream)]"
                    >
                      Clear selection
                    </button>
                  )}
                  <PlayerSeatCompact seat={seatBy(bottom)} active={snapshot.currentActor === bottom} />
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {snapshot.status === "handResult" && (
        <HandResultOverlay
          snapshot={snapshot}
          advancing={advancing}
          onContinue={() => {
            setAdvancing(true);
            onAdvance();
            setTimeout(() => setAdvancing(false), 4000);
          }}
        />
      )}
      {snapshot.status === "finished" && (
        <MatchResultOverlay snapshot={snapshot} onRematch={onRematch} onLobby={onLobby} busy={acting} />
      )}
      {showRules && (
        <RulesModal
          onClose={() => setShowRules(false)}
        />
      )}
    </div>
  );
}

function PlayerSeatCompact({ seat, active }: { seat: { displayName: string; score: number; team: 0 | 1 | null }; active: boolean }) {
  return (
    <p className={cn("text-xs text-[var(--text-muted)]", active && "font-bold text-[var(--gold-highlight)]")}>
      You: {seat.displayName} · {seat.score} pts
      {seat.team !== null && ` · Team ${seat.team + 1}`}
      {active && " · your turn"}
    </p>
  );
}
