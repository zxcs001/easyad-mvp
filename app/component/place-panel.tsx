"use client";

import "./place-panel.css";
import { useEffect, useState } from "react";
import type { InventoryComment, InventoryItem } from "../data";
import { toast } from "./toast";
import { useI18n } from "../i18n/client";

// Comments about a screen's location. They used to live in a modal that opened
// only from a map pin, over a detail card that also changed underneath it, and
// they could not be reached from the result list at all. They now sit inside
// the detail card, collapsed, so a pin click and a list click do the same thing
// and the conversation is reachable from both.
export function PlaceComments({ item, canComment }: { item: InventoryItem; canComment: boolean }) {
  const { formatDate, t } = useI18n();
  const commentsEnabled = item.commentsEnabled !== false;
  const [comments, setComments] = useState<InventoryComment[]>([]);
  const [loading, setLoading] = useState(commentsEnabled);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    // A new screen is a new conversation, so an unsent draft does not follow it.
    setDraft("");
    if (!commentsEnabled) {
      setComments([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/inventory/${item.id}/comments`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Failed to load comments"))))
      .then((data: { comments: InventoryComment[] }) => {
        if (active) setComments(Array.isArray(data.comments) ? data.comments : []);
      })
      .catch(() => {
        if (active) setComments([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item.id, commentsEnabled]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const response = await fetch(`/api/inventory/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not post your comment.");
      }
      const data = await response.json() as { comment: InventoryComment };
      setComments((current) => [...current, data.comment]);
      setDraft("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not post your comment.");
    } finally {
      setPosting(false);
    }
  }

  if (!commentsEnabled) return null;

  return (
    <details className="detail-more detail-comments">
      <summary>{t(loading || !comments.length ? "Comments" : "Comments ({count})", { count: comments.length })}</summary>
      <div className="place-comment-list">
        {loading ? (
          <div className="place-comment-empty"><span className="async-spinner" /></div>
        ) : comments.length ? (
          comments.map((comment) => (
            <div className="place-comment" key={comment.id}>
              <div className="place-comment-meta">
                <strong>{comment.authorName}</strong>
                <span>{formatDate(comment.createdAt)}</span>
              </div>
              <p>{comment.body}</p>
            </div>
          ))
        ) : (
          <div className="place-comment-empty">{t("No comments yet. Be the first to share what you know about this spot.")}</div>
        )}
      </div>
      {canComment ? (
        <form className="place-comment-form" noValidate onSubmit={submit}>
          <textarea
            className="resize-none"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("Add a comment about this location...")}
            maxLength={1000}
            rows={2}
            disabled={posting}
            aria-label={t("Add a comment")}
          />
          <button type="submit" className="primary-button" disabled={posting || !draft.trim()}>{t(posting ? "Posting..." : "Post")}</button>
        </form>
      ) : (
        <p className="place-comment-signin">{t("Sign in to join the conversation.")}</p>
      )}
    </details>
  );
}
