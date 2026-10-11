// Reads Common Alerting Protocol, Canadian Profile (CAP-CP) messages from the
// NAAD System, the feed that carries Alert Ready. Server only.
//
// Message shape: CAP 1.2 (urn:oasis:names:tc:emergency:cap:1.2) with the
// CAP-CP event, location and SOREM layer conventions described in the NAAD
// System Last Mile Distributor User Guide (R10.0).
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const CAP_NS = "urn:oasis:names:tc:emergency:cap:1.2";
const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";
export const MAX_CAP_BYTES = 8 * 1024 * 1024;
export const BROADCAST_IMMEDIATELY = "layer:SOREM:1.0:Broadcast_Immediately";
export const CAP_CP_EVENT = /^profile:CAP-CP:Event:/;
export const CAP_CP_LOCATION = /^profile:CAP-CP:Location:/;

export type CapReference = { sender: string; identifier: string; sent: string };

export type CapArea = {
  description: string;
  /** Closed rings of [latitude, longitude]. */
  polygons: [number, number][][];
  /** Statistics Canada SGC codes: province (2 digits), census division (4) or census subdivision (7). */
  geocodes: string[];
};

export type CapInfo = {
  language: string;
  event: string;
  eventCode: string | null;
  /** CAP responseType values, for example Shelter or Evacuate. */
  responseTypes: string[];
  urgency: string;
  severity: string;
  certainty: string;
  headline: string;
  description: string;
  instruction: string;
  senderName: string;
  effective: string | null;
  expires: string | null;
  broadcastImmediately: boolean;
  areas: CapArea[];
};

export type CapAlert = {
  identifier: string;
  sender: string;
  sent: string;
  status: "Actual" | "Exercise" | "System" | "Test" | "Draft";
  msgType: "Alert" | "Update" | "Cancel" | "Ack" | "Error";
  scope: string;
  references: CapReference[];
  infos: CapInfo[];
  isHeartbeat: boolean;
  signatureCount: number;
};

export class CapError extends Error {}

/** A stable key for one CAP message: sender, identifier and sent time. */
export function capKey(reference: CapReference) {
  return `${reference.sender}|${reference.identifier}|${reference.sent}`;
}

export function parseCap(xml: string): CapAlert {
  if (typeof xml !== "string" || !xml.trim()) throw new CapError("Empty CAP message.");
  if (Buffer.byteLength(xml, "utf8") > MAX_CAP_BYTES) throw new CapError("CAP message is too large.");
  // No DTDs: they are not part of CAP and are the route to entity expansion.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CapError("CAP messages must not contain a DTD.");
  const errors: string[] = [];
  let doc: Document | undefined;
  try {
    doc = new DOMParser({ errorHandler: { warning: () => undefined, error: (message: string) => { errors.push(message); }, fatalError: (message: string) => { errors.push(message); } } }).parseFromString(xml, "text/xml");
  } catch {
    throw new CapError("Not a CAP alert.");
  }
  const root = doc?.documentElement;
  if (errors.length || !root || root.localName !== "alert") throw new CapError("Not a CAP alert.");
  if (root.namespaceURI && root.namespaceURI !== CAP_NS) throw new CapError("Only CAP 1.2 is supported.");

  const status = text(root, "status") as CapAlert["status"];
  const msgType = text(root, "msgType") as CapAlert["msgType"];
  const identifier = text(root, "identifier");
  const sender = text(root, "sender");
  const sent = text(root, "sent");
  if (!identifier || !sender || !sent) throw new CapError("CAP identifier, sender and sent are required.");
  if (!["Actual", "Exercise", "System", "Test", "Draft"].includes(status)) throw new CapError("Unknown CAP status.");
  if (!["Alert", "Update", "Cancel", "Ack", "Error"].includes(msgType)) throw new CapError("Unknown CAP message type.");

  return {
    identifier,
    sender,
    sent,
    status,
    msgType,
    scope: text(root, "scope"),
    references: parseReferences(text(root, "references")),
    infos: children(root, "info").map(parseInfo),
    isHeartbeat: status === "System" && sender === "NAADS-Heartbeat",
    signatureCount: root.getElementsByTagNameNS(DSIG_NS, "Signature").length,
  };
}

function parseInfo(info: Element): CapInfo {
  const parameters = children(info, "parameter").map((parameter) => [text(parameter, "valueName"), text(parameter, "value")] as const);
  const eventCode = children(info, "eventCode").map((code) => [text(code, "valueName"), text(code, "value")] as const).find(([name]) => CAP_CP_EVENT.test(name))?.[1] ?? null;
  return {
    language: text(info, "language") || "en-US",
    event: text(info, "event"),
    eventCode,
    responseTypes: children(info, "responseType").map((node) => (node.textContent ?? "").trim()).filter(Boolean),
    urgency: text(info, "urgency"),
    severity: text(info, "severity"),
    certainty: text(info, "certainty"),
    headline: text(info, "headline"),
    description: text(info, "description"),
    instruction: text(info, "instruction"),
    senderName: text(info, "senderName"),
    effective: text(info, "effective") || null,
    expires: text(info, "expires") || null,
    broadcastImmediately: parameters.some(([name, value]) => name === BROADCAST_IMMEDIATELY && value.toLowerCase() === "yes"),
    areas: children(info, "area").map((area) => ({
      description: text(area, "areaDesc"),
      polygons: children(area, "polygon").map((polygon) => parsePolygon(polygon.textContent ?? "")).filter((ring) => ring.length >= 4),
      geocodes: children(area, "geocode").map((code) => [text(code, "valueName"), text(code, "value")] as const).filter(([name, value]) => CAP_CP_LOCATION.test(name) && /^\d{2,7}$/.test(value)).map(([, value]) => value),
    })),
  };
}

// CAP polygons are "lat,lon lat,lon ..." with the first point repeated last.
function parsePolygon(value: string): [number, number][] {
  const points = value.trim().split(/\s+/).map((pair) => pair.split(",").map(Number)).filter((pair) => pair.length === 2 && pair.every(Number.isFinite)) as [number, number][];
  return points.filter(([lat, lng]) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
}

// "sender,identifier,sent sender,identifier,sent" — whitespace separates entries.
function parseReferences(value: string): CapReference[] {
  return value.split(/\s+/).filter(Boolean).map((entry) => entry.split(",")).filter((parts) => parts.length === 3 && parts.every(Boolean)).map(([sender, identifier, sent]) => ({ sender, identifier, sent }));
}

function children(parent: Element, name: string): Element[] {
  const found: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (node as Element).localName === name) found.push(node as Element);
  }
  return found;
}

function text(parent: Element, name: string) {
  return (children(parent, name)[0]?.textContent ?? "").trim();
}

// --- Signatures -----------------------------------------------------------------

export type SignatureResult = "verified" | "unverified" | "unsigned" | "no-trusted-certificate";

/**
 * Checks the XML signatures on an alert against the configured Pelmorex
 * signing certificates. A signature counts only when it validates with a
 * trusted certificate and covers the whole alert (an enveloped reference with
 * URI ""), so a valid signature over a fragment cannot vouch for added text.
 */
export function verifyCapSignature(xml: string, trustedCertificates: string[]): SignatureResult {
  let doc: Document;
  try { doc = new DOMParser().parseFromString(xml, "text/xml"); } catch { return "unverified"; }
  const signatures = Array.from(doc.getElementsByTagNameNS(DSIG_NS, "Signature"));
  if (!signatures.length) return "unsigned";
  if (!trustedCertificates.length) return "no-trusted-certificate";
  for (const signature of signatures) {
    // Only a signature that is a direct child of <alert> can be enveloped over it.
    if (signature.parentNode !== doc.documentElement) continue;
    for (const publicCert of trustedCertificates) {
      try {
        const signed = new SignedXml({ publicCert, getCertFromKeyInfo: () => null });
        signed.loadSignature(signature);
        const wholeDocument = signed.getReferences().some((reference) => reference.uri === "" && reference.transforms.includes("http://www.w3.org/2000/09/xmldsig#enveloped-signature"));
        if (wholeDocument && signed.checkSignature(xml)) return "verified";
      } catch {
        // Try the next certificate.
      }
    }
  }
  return "unverified";
}

/**
 * Trusted signing keys from ALERT_READY_SIGNING_CERTS: PEM certificates (or
 * PEM public keys), as text or as the same text in Base64.
 */
export function trustedCertificatesFromEnvironment(value = process.env.ALERT_READY_SIGNING_CERTS ?? "") {
  const pem = value.includes("-----BEGIN") ? value : Buffer.from(value, "base64").toString("utf8");
  return pem.match(/-----BEGIN (CERTIFICATE|PUBLIC KEY)-----[\s\S]+?-----END \1-----/g) ?? [];
}
