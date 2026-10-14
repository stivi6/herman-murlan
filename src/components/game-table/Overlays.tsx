"use client";
import { useEffect, useMemo } from "react";
import type { MatchSnapshot } from "@/lib/client-api";
import { sortCardsAscending } from "@/lib/game/cards";
import { CardView } from "./CardView";

const POINTS = [3, 2, 1, 0];

export function HandResultOverlay({
  snapshot,
  onContinue,
  advancing,
}: {
  snapshot: MatchSnapshot;
  onContinue: () => void;
  advancing: boolean;
}) {
  const placements = snapshot.placements ?? snapshot.lastHandPlacements;
  if (!placements) return null;
  const rows = [0, 1, 2, 3]
    .map((seat) => ({ seat, place: placements[seat] as number }))
    .sort((a, b) => a.place - b.place);
  const nameOf = (seat: number) => snapshot.seats.find((s) => s.seat === seat)?.displayName ?? `Seat ${seat}`;
  return (
    <Overlay title={`Hand ${snapshot.handNumber} result`}>
      <ol className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.seat} className="flex items-center justify-between gap-4 text-sm">
            <span>
              #{r.place} {nameOf(r.seat)}
            </span>
            <span className="text-amber-300">+{POINTS[r.place - 1]} pts</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-zinc-300">
        Totals: {snapshot.seats.map((s) => `${s.displayName} ${s.score}`).join(" · ")} (target{" "}
        {snapshot.target})
      </p>
      {snapshot.mode === "2v2" && snapshot.teamTotals && (
        <p className="text-xs text-zinc-300">
          Teams: {snapshot.teamTotals[0]} – {snapshot.teamTotals[1]}
        </p>
      )}
      <p className="text-xs text-zinc-400">
        1st and 4th exchange a card before the next hand (skipped if 4th holds both jokers).
      </p>
      <button
        type="button"
        onClick={onContinue}
        disabled={advancing}
        className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-zinc-900 disabled:opacity-50"
      >
        {advancing ? "Dealing…" : "Continue"}
      </button>
    </Overlay>
  );
}

export function MatchResultOverlay({
  snapshot,
  onRematch,
  onLobby,
  busy,
}: {
  snapshot: MatchSnapshot;
  onRematch: () => void;
  onLobby: () => void;
  busy: boolean;
}) {
  const title = snapshot.tie
    ? "Tied match"
    : snapshot.mode === "2v2" && snapshot.winner !== null && snapshot.winner < 2
      ? `Team ${snapshot.winner + 1} wins!`
      : `${snapshot.seats.find((s) => s.seat === snapshot.winner)?.displayName ?? "Winner"} wins!`;
  return (
    <Overlay title={title}>
      <p className="text-sm">
        Final: {snapshot.seats.map((s) => `${s.displayName} ${s.score}`).join(" · ")}
      </p>
      {snapshot.mode === "2v2" && snapshot.teamTotals && (
        <p className="text-sm">
          Teams: {snapshot.teamTotals[0]} – {snapshot.teamTotals[1]}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRematch}
          disabled={busy}
          className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-zinc-900 disabled:opacity-50"
        >
          Play again
        </button>
        <button
          type="button"
          onClick={onLobby}
          className="rounded-lg border border-zinc-500 px-4 py-2 text-zinc-100"
        >
          Lobby
        </button>
      </div>
    </Overlay>
  );
}

export function ExchangePanel({
  snapshot,
  selected,
  onToggle,
  onConfirm,
  acting,
}: {
  snapshot: MatchSnapshot;
  selected: string[];
  onToggle: (id: string) => void;
  onConfirm: () => void;
  acting: boolean;
}) {
  const ex = snapshot.exchange;
  const ordered = useMemo(() => sortCardsAscending(snapshot.myCards), [snapshot.myCards]);
  if (!ex || ex.needsReturnFrom !== snapshot.mySeat) return null;
  const received = snapshot.myCards.find((c) => c.id === ex.receivedCardId);
  const hasLow = snapshot.myCards.some(
    (c) => c.id !== ex.receivedCardId && ["3", "4", "5", "6", "7", "8", "9", "10"].includes(c.rank),
  );
  return (
    <div className="rounded-xl border border-amber-300/60 bg-black/55 p-3 text-center text-sm text-white">
      <p className="font-semibold text-amber-200">Card exchange</p>
      <p className="text-xs">
        You finished 1st and received {received ? <strong>{received.rank}</strong> : "a card"} from
        4th place. Choose a card ranked 3–10 to give back
        {!hasLow && " (you hold no 3–10, so any card is allowed)"}.
      </p>
      <div className="mt-2 flex max-w-full flex-wrap justify-center gap-1">
        {ordered.map((c) => (
          <CardView
            key={c.id}
            id={c.id}
            size="sm"
            selectable
            selected={selected.includes(c.id)}
            onToggle={onToggle}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onConfirm}
        disabled={acting || selected.length !== 1}
        className="mt-2 rounded-lg bg-amber-300 px-4 py-2 font-semibold text-zinc-900 disabled:opacity-50"
      >
        {acting ? "Sending…" : "Give card"}
      </button>
    </div>
  );
}

export function Overlay({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-white/15 bg-zinc-900 p-5 text-white shadow-2xl">
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Overlay title="How to play Murlan" onClose={onClose}>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto text-sm text-zinc-200">
        <p>
          <strong>Goal:</strong> be first to empty your hand. Placements earn 3 / 2 / 1 / 0 points;
          first side to 21 wins (extends to 31 → 41 → 51 on ties).
        </p>
        <p>
          <strong>Card order:</strong> 3 &lt; 4 &lt; … &lt; K &lt; A &lt; 2 &lt; Black Joker &lt; Red
          Joker. Suits don&apos;t matter.
        </p>
        <p>
          <strong>Combinations:</strong> single, pair, triple, four-of-a-kind (bomb), or a scale of
          5+ consecutive ranks (e.g. 5-6-7-8-9). A–2–3–4–5 is the only scale with a 2; jokers never
          join scales.
        </p>
        <p>
          <strong>Beating:</strong> same type and size, strictly stronger. Bombs beat anything
          except a higher bomb.
        </p>
        <p>
          <strong>Passing:</strong> you may pass instead of beating; you sit out until the trick
          resets to whoever played last. The trick leader must play.
        </p>
        <p>
          <strong>First move:</strong> whoever holds 3♠ opens the first hand with a combo containing
          it.
        </p>
        <p>
          <strong>Exchange:</strong> after each hand (match still live), 4th gives their highest
          card to 1st, who returns a 3–10 card (any card if they hold none). Skipped if 4th holds
          both jokers; then 1st opens next.
        </p>
        <p>
          <strong>2v2:</strong> seats 0+2 vs 1+3; team score is the sum of both partners&apos; hand
          points.
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-zinc-900"
      >
        Close
      </button>
    </Overlay>
  );
}
