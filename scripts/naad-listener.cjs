#!/usr/bin/env node
// Alert Ready listener. Connects to the NAAD System TCP streams, splits the
// stream into CAP-CP messages, and posts each one to the app's ingest route.
// Run it as one long-lived process beside the web app (ADR 0010):
//
//   ALERT_READY_INGEST_URL=https://app.example/api/alert-ready/ingest \
//   ALERT_READY_INGEST_TOKEN=<32+ random characters> node scripts/naad-listener.cjs
//
// Behaviour follows the NAAD System LMD User Guide R10.0:
// - both streaming sites (Oakville and Montreal) on TCP 8080, for redundancy;
// - a message starts at "<alert" (or its XML declaration) and ends at "</alert>";
// - a heartbeat arrives every 60 seconds; without one for 150 seconds the
//   connection is dropped and opened again;
// - a heartbeat lists the last 10 alerts; any the app has not stored are
//   fetched from the capcp archive sites;
// - the same alert from both sites is posted once.
"use strict";

const net = require("node:net");

const DEFAULT_STREAMS = "streaming1.naad-adna.pelmorex.com:8080,streaming2.naad-adna.pelmorex.com:8080";
const DEFAULT_ARCHIVES = "capcp1.naad-adna.pelmorex.com,capcp2.naad-adna.pelmorex.com";
const MAX_BUFFER = 16 * 1024 * 1024;
const SILENCE_MS = 150_000;

/** Splits buffered stream text into complete CAP messages and the remainder. */
function extractMessages(buffer) {
  const messages = [];
  let rest = buffer;
  const end = /<\/(?:[\w.-]+:)?alert\s*>/;
  for (;;) {
    const match = end.exec(rest);
    if (!match) break;
    const stop = match.index + match[0].length;
    const chunk = rest.slice(0, stop);
    const declaration = chunk.lastIndexOf("<?xml");
    const open = chunk.search(/<(?:[\w.-]+:)?alert[\s>]/);
    const start = declaration >= 0 && declaration < (open < 0 ? Infinity : open) ? declaration : open;
    if (start >= 0) messages.push(chunk.slice(start).trim());
    rest = rest.slice(stop);
  }
  return { messages, rest };
}

/** sender|identifier|sent, read without a full parse, for duplicate detection. */
function quickKey(xml) {
  const read = (tag) => (xml.match(new RegExp(`<(?:[\\w.-]+:)?${tag}>([^<]*)</(?:[\\w.-]+:)?${tag}>`)) || [])[1]?.trim() ?? "";
  return `${read("sender")}|${read("identifier")}|${read("sent")}`;
}

/** Archive address of a missed alert: http://[site]/[SENT_DATE]/[SENT]I[IDENTIFIER].xml */
function archiveUrl(site, reference) {
  const encode = (value) => value.replace(/-/g, "_").replace(/\+/g, "p").replace(/:/g, "_");
  return `http://${site}/${reference.sent.slice(0, 10)}/${encode(reference.sent)}I${encode(reference.identifier)}.xml`;
}

class Recent {
  constructor(limit = 500) { this.limit = limit; this.keys = new Set(); }
  add(key) {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    if (this.keys.size > this.limit) this.keys.delete(this.keys.values().next().value);
    return true;
  }
}

function log(...parts) { console.log(new Date().toISOString(), ...parts); }

function createListener({ ingestUrl, token, streams, archives, fetchImpl = fetch, connect = net.connect, silenceMs = SILENCE_MS }) {
  const seen = new Recent();
  const sockets = new Set();
  let stopped = false;

  async function post(xml, via) {
    const key = quickKey(xml);
    if (!key.startsWith("NAADS-Heartbeat|") && !seen.add(key)) return null;
    try {
      const response = await fetchImpl(ingestUrl, { method: "POST", headers: { "content-type": "application/xml", authorization: `Bearer ${token}`, "x-received-via": via }, body: xml });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { log("ingest refused", response.status, result.error ?? "", key); seen.keys.delete(key); return null; }
      if (result.kind === "alert") log("alert", key, "screens", result.matchedScreens, "shown", (result.shownAlertIds ?? []).length, "ended", (result.endedAlertIds ?? []).length);
      if (result.kind === "heartbeat" && result.missing?.length) await recover(result.missing);
      return result;
    } catch (error) {
      seen.keys.delete(key);
      log("ingest failed", error.message, key);
      return null;
    }
  }

  // A heartbeat names alerts the app never stored: fetch them from either archive site.
  async function recover(references) {
    for (const reference of references) {
      for (const site of archives) {
        try {
          const response = await fetchImpl(archiveUrl(site, reference));
          if (!response.ok) continue;
          await post(await response.text(), `archive:${site}`);
          break;
        } catch (error) {
          log("archive fetch failed", site, error.message);
        }
      }
    }
  }

  function open(host, port, attempt = 0) {
    if (stopped) return;
    const socket = connect({ host, port });
    sockets.add(socket);
    let buffer = "";
    let watchdog;
    const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => { log("no heartbeat", host); socket.destroy(); }, silenceMs); };
    socket.setEncoding("utf8");
    socket.on("connect", () => { attempt = 0; log("connected", `${host}:${port}`); arm(); });
    socket.on("data", (data) => {
      arm();
      buffer += data;
      const { messages, rest } = extractMessages(buffer);
      buffer = rest.length > MAX_BUFFER ? "" : rest;
      for (const message of messages) void post(message, `stream:${host}`);
    });
    socket.on("error", (error) => log("stream error", host, error.message));
    socket.on("close", () => {
      clearTimeout(watchdog);
      sockets.delete(socket);
      if (stopped) return;
      const delay = Math.min(60_000, 5_000 * 2 ** Math.min(attempt, 4));
      log("disconnected", host, `retry in ${delay / 1000}s`);
      setTimeout(() => open(host, port, attempt + 1), delay);
    });
  }

  return {
    start() { for (const { host, port } of streams) open(host, port); },
    stop() { stopped = true; for (const socket of sockets) socket.destroy(); },
    post,
  };
}

function parseStreams(value) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const [host, port] = entry.split(":");
    return { host, port: Number(port) || 8080 };
  });
}

function main() {
  const origin = process.env.APP_ORIGIN?.replace(/\/$/, "");
  const ingestUrl = process.env.ALERT_READY_INGEST_URL || (origin ? `${origin}/api/alert-ready/ingest` : "");
  const token = process.env.ALERT_READY_INGEST_TOKEN || "";
  if (!ingestUrl) throw new Error("Set ALERT_READY_INGEST_URL or APP_ORIGIN.");
  if (token.length < 32) throw new Error("Set ALERT_READY_INGEST_TOKEN to at least 32 random characters.");
  const listener = createListener({
    ingestUrl,
    token,
    streams: parseStreams(process.env.NAAD_STREAMS || DEFAULT_STREAMS),
    archives: (process.env.NAAD_ARCHIVES || DEFAULT_ARCHIVES).split(",").map((site) => site.trim()).filter(Boolean),
  });
  listener.start();
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { log("stopping"); listener.stop(); process.exit(0); });
}

module.exports = { extractMessages, quickKey, archiveUrl, createListener, parseStreams };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exit(1); }
}
