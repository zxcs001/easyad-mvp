"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { CreativeDraft } from "../types";
import { decodeCreativeDraft, draftChangeGroup, draftContent, encodeCreativeDraft, freshCreativeDraft } from "../creative-draft";

export function useCreativeDraft(input: CreativeDraft, setInput: Dispatch<SetStateAction<CreativeDraft>>, bookingId: string, ownerId?: string) {
  const key = ownerId ? `easyad:creative:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(bookingId)}` : `session:${bookingId}`;
  const persistent = Boolean(ownerId && bookingId);
  const ledger = useRef({ key, current: input, past: [] as CreativeDraft[], future: [] as CreativeDraft[], group: "", changedAt: 0 });
  const pendingInput = useRef<CreativeDraft | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(persistent ? null : key);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "unavailable">("saving");
  const [restored, setRestored] = useState(false);
  const signature = JSON.stringify(draftContent(input));

  useEffect(() => {
    const previous = ledger.current;
    const switched = previous.key !== key;
    if (switched && previous.key.startsWith("easyad:")) {
      try { localStorage.setItem(previous.key, encodeCreativeDraft(previous.current)); } catch { /* The editor remains usable when storage is full. */ }
    }
    // The parent can outlive this view and still hold another campaign's ad.
    // New persistent sessions start clean, then restore only their own key.
    let next = switched || persistent ? freshCreativeDraft(input) : input;
    if (!switched) next = { ...next, template: input.template };
    let didRestore = false;
    if (persistent) {
      try {
        const stored = decodeCreativeDraft(localStorage.getItem(key), next);
        if (stored) { next = stored; didRestore = true; }
      } catch { setSaveState("unavailable"); }
    }
    ledger.current = { key, current: next, past: [], future: [], group: "", changedAt: 0 };
    if (switched || didRestore || persistent) { pendingInput.current = next; setInput(next); }
    setRestored(didRestore);
    setLoadedKey(key);
    // Loading is scoped to the account and booking, never each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, persistent, setInput]);

  useEffect(() => {
    // The same effect flush still sees the old parent value after hydration.
    // Keep the restored content until that update reaches the parent.
    if (pendingInput.current && JSON.stringify(draftContent(input)) !== JSON.stringify(draftContent(pendingInput.current))) return;
    pendingInput.current = null;
    if (ledger.current.key === key) ledger.current.current = input;
  }, [input, key]);
  useEffect(() => {
    if (!persistent || loadedKey !== key) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(key, encodeCreativeDraft(ledger.current.current)); setSaveState("saved"); }
      catch { setSaveState("unavailable"); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [signature, key, loadedKey, persistent]);
  useEffect(() => {
    if (!persistent) return;
    const save = () => {
      if (ledger.current.key !== key || loadedKey !== key) return;
      try { localStorage.setItem(key, encodeCreativeDraft(ledger.current.current)); } catch { /* Avoid errors during navigation. */ }
    };
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, [key, loadedKey, persistent]);

  const ready = loadedKey === key;
  const setDraft: Dispatch<SetStateAction<CreativeDraft>> = action => {
    if (!ready) return;
    const state = ledger.current;
    const next = typeof action === "function" ? action(state.current) : action;
    if (JSON.stringify(draftContent(next)) !== JSON.stringify(draftContent(state.current))) {
      const group = draftChangeGroup(state.current, next), now = Date.now();
      if (state.group !== group || now - state.changedAt > 800) state.past = [...state.past.slice(-29), state.current];
      state.group = group; state.changedAt = now; state.future = [];
    }
    state.current = next;
    setInput(next);
  };
  function move(direction: "undo" | "redo") {
    if (!ready) return;
    const state = ledger.current, from = direction === "undo" ? state.past : state.future;
    const next = from.pop();
    if (!next) return;
    (direction === "undo" ? state.future : state.past).push(state.current);
    // A restored history snapshot cannot change the booked output dimensions.
    const restoredDraft = { ...next, format: input.format, width: input.width, height: input.height };
    state.current = restoredDraft; state.group = ""; state.changedAt = 0;
    setInput(restoredDraft);
  }
  return { setDraft, undo: () => move("undo"), redo: () => move("redo"), canUndo: ready && ledger.current.past.length > 0, canRedo: ready && ledger.current.future.length > 0, ready, persistent, saveState, restored };
}
