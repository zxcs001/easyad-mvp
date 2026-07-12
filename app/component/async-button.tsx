"use client";

import "./async-button.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "./toast";

type ActionState = "idle" | "pending" | "success" | "error";

// A button that gives immediate "received" feedback (press + spinner) and then
// reflects the backend result with a success or error flash plus a toast.
export default function AsyncButton({
  onClick,
  children,
  className = "",
  successMessage,
  errorMessage,
  type = "button",
  disabled = false,
  notify = true,
  ...rest
}: {
  onClick: () => Promise<boolean | void>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  errorMessage?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  notify?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "disabled">) {
  const [state, setState] = useState<ActionState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
    window.clearTimeout(resetTimer.current);
  }, []);

  function scheduleReset() {
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      if (mounted.current) setState("idle");
    }, 1600);
  }

  async function handleClick() {
    if (state === "pending") return;
    setState("pending");
    try {
      const result = await onClick();
      if (!mounted.current) return;
      if (result === false) {
        setState("error");
        if (notify) toast.error(errorMessage ?? "That didn't work. Please try again.");
      } else {
        setState("success");
        if (notify && successMessage) toast.success(successMessage);
      }
    } catch (error) {
      if (!mounted.current) return;
      setState("error");
      if (notify) toast.error(error instanceof Error && error.message ? error.message : errorMessage ?? "Something went wrong.");
    } finally {
      if (mounted.current) scheduleReset();
    }
  }

  return (
    <button
      type={type}
      className={`${className} async-button is-${state}`.trim()}
      aria-busy={state === "pending"}
      disabled={disabled || state === "pending"}
      onClick={handleClick}
      {...rest}
    >
      <span className="async-button-label">{children}</span>
      <span className="async-button-feedback" aria-hidden="true">
        {state === "pending" ? <span className="async-spinner" /> : null}
        {state === "success" ? <svg viewBox="0 0 24 24" className="async-icon"><path d="M5 13l4 4L19 7" /></svg> : null}
        {state === "error" ? <svg viewBox="0 0 24 24" className="async-icon"><path d="M6 6l12 12M18 6L6 18" /></svg> : null}
      </span>
    </button>
  );
}
