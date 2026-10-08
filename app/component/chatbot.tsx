"use client";

import "./chatbot.css";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import { useI18n } from "../i18n/client";

const devicePagePrefixes = ["/devices", "/inventory", "/player"] as const;

export function isDevicePage(pathname: string | null) {
  return devicePagePrefixes.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));
}

// The assistant answers questions about buying and booking advertising. The
// institution workspace is a screen-operations tool, so it does not show it.
export function isInstitutionPage(pathname: string | null) {
  return pathname === "/government" || Boolean(pathname?.startsWith("/government/"));
}

export default function Chatbot() {
  const pathname = usePathname();

  if (isDevicePage(pathname) || isInstitutionPage(pathname)) return null;

  return <ChatbotWidget />;
}

function ChatbotWidget() {
  const { locale, t } = useI18n();
  const greeting = t("Hi! I'm the EasyAD Platform assistant. Ask me anything about discovering inventory, booking, or reporting.");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: greeting }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, error, sending, open]);

  // Focus only when the panel opens. Focusing on every message reopened the
  // on-screen keyboard on phones each time the assistant answered.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setMessages((current) => current.length === 1 && current[0]?.role === "assistant" ? [{ role: "assistant", content: greeting }] : current);
  }, [greeting]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const nextMessages = [...messages, { role: "user", content: text } as ChatMessage];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, locale }),
      });
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { message: ChatMessage };
      setMessages((current) => [...current, payload.message]);
    } catch {
      // The failure is shown inside the panel. As a toast it opened in the same
      // corner as the panel and, with the panel open, nobody could see it.
      setError("The assistant is unavailable right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`chatbot-launcher${open ? " is-open" : ""}`}
        aria-label={t(open ? "Close assistant" : "Open assistant")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 21 12z" /></svg>
        )}
      </button>

      {open ? (
        <section className="chatbot-panel" role="dialog" aria-label={t("Site assistant")}>
          <header className="chatbot-header">
            <div>
              <strong>{t("Assistant")}</strong>
              <span>{t("Here to help")}</span>
            </div>
            <button type="button" className="chatbot-close" aria-label={t("Close assistant")} onClick={() => setOpen(false)}>&times;</button>
          </header>
          <div className="chatbot-messages" ref={listRef}>
            {messages.map((message, index) => (
              <div key={index} className={`chatbot-msg ${message.role}`}>{message.content}</div>
            ))}
            {sending ? (
              <div className="chatbot-msg assistant pending"><span className="async-spinner" /></div>
            ) : null}
            {error && !sending ? (
              <div className="chatbot-msg assistant error" role="alert">{t(error)}</div>
            ) : null}
          </div>
          <form className="chatbot-input" noValidate onSubmit={send}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("Type a message...")}
              aria-label={t("Message the assistant")}
              // Not disabled while sending: a disabled input drops focus, which
              // closed the phone keyboard. send() already ignores a second send.
              aria-busy={sending}
              maxLength={4000}
            />
            <button type="submit" className="primary-button" disabled={sending || !input.trim()} aria-label={t("Send message")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 8 6 8z" /></svg>
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
