import { useSyncExternalStore } from "react";

export type LiveBench = {
  running: boolean;
  status: string;
  log: string;
  results: Record<string, unknown>;
  liveJobs: Record<string, string>;
  models: Array<{ id: string; kind: string }>;
  picked: Record<string, boolean>;
  scope: string;
};

const empty: LiveBench = {
  running: false,
  status: "就绪",
  log: "",
  results: {},
  liveJobs: {},
  models: [],
  picked: {},
  scope: "",
};

let snap: LiveBench = empty;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export const liveCtl = {
  stop: false,
  abort: null as AbortController | null,
};

export function getLiveBench() {
  return snap;
}

export function subscribeLive(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function patchLive(partial: Partial<LiveBench>) {
  snap = { ...snap, ...partial };
  emit();
}

export function appendLive(line: string) {
  snap = { ...snap, log: snap.log + line + "\n" };
  emit();
}

export function useLiveBench() {
  return useSyncExternalStore(subscribeLive, getLiveBench, getLiveBench);
}

export async function holdWakeLock() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return null;
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}
