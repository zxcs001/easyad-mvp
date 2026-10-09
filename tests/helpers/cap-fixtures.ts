import { generateKeyPairSync } from "node:crypto";
import { SignedXml } from "xml-crypto";

// Synthetic CAP-CP messages shaped like NAAD System output (CAP 1.2, CAP-CP
// event and location codes, SOREM layer). Every value is fictional test data.

// Test signing keys are made per run, so no key file lives in the repository.
const pair = () => generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const trustedPair = pair();
const otherPair = pair();
/** Stands in for the Pelmorex signing certificate in ALERT_READY_SIGNING_CERTS. */
export const testSigningCert = trustedPair.publicKey;
export const testSigningKey = trustedPair.privateKey;
export const otherSigningKey = otherPair.privateKey;

/** A rectangle around central Thunder Bay, as CAP "lat,lon" pairs. */
export const thunderBayPolygon = "48.30,-89.40 48.30,-89.15 48.50,-89.15 48.50,-89.40 48.30,-89.40";
/** A rectangle around Sudbury, far from Thunder Bay. */
export const sudburyPolygon = "46.40,-81.10 46.40,-80.90 46.60,-80.90 46.60,-81.10 46.40,-81.10";

export type CapFixture = {
  identifier?: string;
  sender?: string;
  sent?: string;
  status?: string;
  msgType?: string;
  references?: string;
  event?: string;
  responseType?: string;
  broadcastImmediately?: boolean;
  expires?: string;
  polygon?: string | null;
  geocodes?: string[];
  headline?: string;
  headlineFr?: string;
};

export function capXml(fixture: CapFixture = {}) {
  const {
    identifier = "urn:oid:2.49.0.1.124.0000000001.2026",
    sender = "cap-pac@canada.ca",
    sent = "2026-10-09T18:00:00-00:00",
    status = "Actual",
    msgType = "Alert",
    references,
    event = "tornado",
    responseType = "Shelter",
    broadcastImmediately = true,
    expires = "2099-10-09T20:00:00-00:00",
    polygon = thunderBayPolygon,
    geocodes = ["3558004"],
    headline = "Tornado warning in effect",
    headlineFr = "Avertissement de tornade en vigueur",
  } = fixture;
  const info = (language: string, title: string, description: string, instruction: string, area: string) => `
  <info>
    <language>${language}</language>
    <category>Met</category>
    <event>${event}</event>
    <responseType>${responseType}</responseType>
    <urgency>Immediate</urgency>
    <severity>Extreme</severity>
    <certainty>Observed</certainty>
    <eventCode><valueName>profile:CAP-CP:Event:0.4</valueName><value>${event}</value></eventCode>
    <expires>${expires}</expires>
    <senderName>Environment and Climate Change Canada</senderName>
    <headline>${title}</headline>
    <description>${description}</description>
    <instruction>${instruction}</instruction>
    <parameter><valueName>layer:SOREM:1.0:Broadcast_Immediately</valueName><value>${broadcastImmediately ? "Yes" : "No"}</value></parameter>
    <area>
      <areaDesc>${area}</areaDesc>
      ${polygon ? `<polygon>${polygon}</polygon>` : ""}
      ${geocodes.map((code) => `<geocode><valueName>profile:CAP-CP:Location:0.3</valueName><value>${code}</value></geocode>`).join("\n      ")}
    </area>
  </info>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${identifier}</identifier>
  <sender>${sender}</sender>
  <sent>${sent}</sent>
  <status>${status}</status>
  <msgType>${msgType}</msgType>
  <source>TEST FIXTURE</source>
  <scope>Public</scope>
  <code>profile:CAP-CP:0.4</code>
  ${references ? `<references>${references}</references>` : ""}${info("en-CA", headline, "A tornado was observed near the city.", "Take shelter now in a basement or an interior room.", "City of Thunder Bay")}${info("fr-CA", headlineFr, "Une tornade a été observée près de la ville.", "Mettez-vous à l'abri maintenant au sous-sol ou dans une pièce intérieure.", "Ville de Thunder Bay")}
</alert>`;
}

export function heartbeatXml(references: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>urn:oid:2.49.0.1.124.heartbeat.${Date.now()}</identifier>
  <sender>NAADS-Heartbeat</sender>
  <sent>2026-10-09T18:01:00-00:00</sent>
  <status>System</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <references>${references.join(" ")}</references>
</alert>`;
}

/** An enveloped XML signature over the whole alert, as the NAAD System applies. */
export function signCap(xml: string, privateKey = testSigningKey) {
  const signer = new SignedXml({ privateKey, signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#" });
  signer.addReference({ xpath: "/*", uri: "", isEmptyUri: true, digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"] });
  signer.computeSignature(xml, { location: { reference: "/*", action: "append" } });
  return signer.getSignedXml();
}
