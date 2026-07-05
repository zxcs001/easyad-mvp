"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import { toast } from "./toast";

const greeting: ChatMessage = {
  role: "assistant",
  content: "Hi! I'm the OOH Market assistant. Ask me anything about discovering inventory, booking, or reporting.",
};

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      inputRef.current?.focus();
    }
  }, [messages, open]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const nextMessages = [...messages, { role: "user", content: text } as ChatMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!response.ok) throw new Error("The assistant is unavailable right now.");
      const payload = await response.json() as { message: ChatMessage };
      setMessages((current) => [...current, payload.message]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The assistant is unavailable right now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`chatbot-launcher${open ? " is-open" : ""}`}
        aria-label={open ? "Close assistant" : "Open assistant"}
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
        <section className="chatbot-panel" role="dialog" aria-label="Site assistant">
          <header className="chatbot-header">
            <div>
              <strong>Assistant</strong>
              <span>Here to help</span>
            </div>
            <button type="button" className="chatbot-close" aria-label="Close assistant" onClick={() => setOpen(false)}>&times;</button>
          </header>
          <div className="chatbot-messages" ref={listRef}>
            {messages.map((message, index) => (
              <div key={index} className={`chatbot-msg ${message.role}`}>{message.content}</div>
            ))}
            {sending ? (
              <div className="chatbot-msg assistant pending"><span className="async-spinner" /></div>
            ) : null}
          </div>
          <form className="chatbot-input" onSubmit={send}>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a message..."
              aria-label="Message the assistant"
              disabled={sending}
              maxLength={4000}
            />
            <button type="submit" className="primary-button" disabled={sending || !input.trim()} aria-label="Send message">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 8 6 8z" /></svg>
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
