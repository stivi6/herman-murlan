"use client";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => undefined;
}

/** True only after client hydration — gates client-only values (localStorage) to avoid SSR mismatch. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
