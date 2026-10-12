/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useCreativeDraft } from "../app/component/use-creative-draft";
import { decodeCreativeDraft, encodeCreativeDraft } from "../app/creative-draft";
import type { CreativeDraft } from "../app/types";

const base: CreativeDraft = { template: "retail", format: "digital", width: 1920, height: 1080, fileType: "html", fileSize: 1, safeZone: 10, distortion: 0 };
const key = (owner: string, booking: string) => `easyad:creative:v1:${owner}:${booking}`;
function useEditor(props: { owner: string; booking: string }) {
  const [draft, setDraft] = useState(base);
  return { draft, ...useCreativeDraft(draft, setDraft, props.booking, props.owner) };
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
test("restores drafts on reload and keeps campaigns and accounts separate", () => {
  localStorage.setItem(key("owner1", "book1"), encodeCreativeDraft({ ...base, fieldsByTopic: { retail: { headline: "Saved" } } }));
  const { result, rerender, unmount } = renderHook(useEditor, { initialProps: { owner: "owner1", booking: "book1" } });
  expect(result.current.draft.fieldsByTopic?.retail?.headline).toBe("Saved");
  act(() => result.current.setDraft(d => ({ ...d, fieldsByTopic: { retail: { headline: "Edited" } } })));
  rerender({ owner: "owner1", booking: "book2" });
  expect(result.current.draft.fieldsByTopic).toBeUndefined();
  expect(decodeCreativeDraft(localStorage.getItem(key("owner1", "book1")), base)?.fieldsByTopic?.retail?.headline).toBe("Edited");
  act(() => result.current.setDraft(d => ({ ...d, responseUrl: "campaign-two.ca" })));
  rerender({ owner: "owner1", booking: "book1" });
  expect(result.current.draft.fieldsByTopic?.retail?.headline).toBe("Edited");
  expect(result.current.draft.responseUrl).toBeUndefined();
  expect(result.current.canUndo).toBe(false);
  rerender({ owner: "owner2", booking: "book1" });
  expect(result.current.draft.fieldsByTopic).toBeUndefined();
  unmount();
  expect(decodeCreativeDraft(localStorage.getItem(key("owner1", "book2")), base)?.responseUrl).toBe("campaign-two.ca");
});
test("coalesces typing, restores successive changes, and discards redo after a new edit", () => {
  const { result } = renderHook(useEditor, { initialProps: { owner: "owner1", booking: "book1" } });
  for (const headline of ["H", "He", "Hello"]) act(() => result.current.setDraft(d => ({ ...d, fieldsByTopic: { retail: { headline } } })));
  act(() => result.current.setDraft(d => ({ ...d, responseUrl: "hello.ca" })));
  act(() => result.current.undo());
  expect(result.current.draft.responseUrl).toBeUndefined();
  expect(result.current.draft.fieldsByTopic?.retail?.headline).toBe("Hello");
  act(() => result.current.undo());
  expect(result.current.draft.fieldsByTopic).toBeUndefined();
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.redo());
  expect(result.current.draft.fieldsByTopic?.retail?.headline).toBe("Hello");
  act(() => result.current.setDraft(d => ({ ...d, responseUrl: "new.ca" })));
  expect(result.current.canRedo).toBe(false);
  act(() => vi.advanceTimersByTime(400));
  expect(result.current.saveState).toBe("saved");
});
test("reports unavailable browser storage while allowing edits and undo", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
  const { result } = renderHook(useEditor, { initialProps: { owner: "owner1", booking: "book1" } });
  act(() => result.current.setDraft(d => ({ ...d, responseUrl: "hello.ca" })));
  act(() => vi.advanceTimersByTime(400));
  expect(result.current.saveState).toBe("unavailable");
  act(() => result.current.undo());
  expect(result.current.draft.responseUrl).toBeUndefined();
});

test("a remounted view cannot inherit another campaign's parent-held content", () => {
  const { result } = renderHook(() => {
    const [draft, setDraft] = useState<CreativeDraft>({ ...base, fieldsByTopic: { retail: { headline: "Different campaign" } } });
    return { draft, ...useCreativeDraft(draft, setDraft, "new-booking", "owner1") };
  });
  expect(result.current.draft.fieldsByTopic).toBeUndefined();
});
