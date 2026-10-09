import * as assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { InventoryItem } from "../app/data";
import { capXml, heartbeatXml, signCap, testSigningCert } from "./helpers/cap-fixtures";

const postgresUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!postgresUrl)("Alert Ready relay stores, matches, asks first, shows automatically only when signed, and follows updates and cancels", async () => {
  const saved = { url: process.env.DATABASE_URL, flag: process.env.FEATURE_ALERT_READY, certs: process.env.ALERT_READY_SIGNING_CERTS };
  process.env.DATABASE_URL = postgresUrl;
  process.env.FEATURE_ALERT_READY = "true";
  process.env.ALERT_READY_SIGNING_CERTS = testSigningCert;
  vi.resetModules();
  const db = await import("../app/lib/db");
  const relay = await import("../app/lib/alert-ready/relay");
  try {
    await db.resetDatabaseForTests();
    const city = await db.createUser("City of Thunder Bay", "city@example.test", "hash", "institutional");
    const other = await db.createUser("Sudbury Library", "sudbury@example.test", "hash", "institutional");
    const base: InventoryItem = {
      id: "", name: "", operator: "City", format: "digital", x: 50, y: 50, address: "", price: 0, impressions: 0, traffic: 0, income: 0,
      audience: "Residents", competitor: "Low", occupancy: 0, imageInterval: 10, maxLoopSeconds: 90, availableFrom: "2026-01-01", availableTo: "2099-12-31", approvalStatus: "approved",
    };
    await db.createInventory({ ...base, id: "TB-EN", name: "City Hall", latitude: 48.3809, longitude: -89.2477 }, city.id, city.id);
    await db.createInventory({ ...base, id: "TB-FR", name: "Centre francophone", latitude: 48.40, longitude: -89.25, displayLanguage: "fr" }, city.id, city.id);
    await db.createInventory({ ...base, id: "TB-STATIC", name: "Billboard", format: "static", latitude: 48.39, longitude: -89.24 }, city.id, city.id);
    await db.createInventory({ ...base, id: "SUD", name: "Sudbury Library", latitude: 46.49, longitude: -81.0 }, other.id, other.id);

    // Ask me first (the default): stored and matched, nothing on screens.
    const unsigned = capXml({ identifier: "urn:oid:TEST-1" });
    const first = await relay.ingestCapMessage(unsigned, "stream:test");
    assert.equal(first.kind, "alert");
    if (first.kind !== "alert") return;
    assert.equal(first.signature, "unsigned");
    assert.equal(first.matchedScreens, 2);
    assert.deepEqual(first.shownAlertIds, []);
    assert.equal((await relay.ingestCapMessage(unsigned, "stream:other")).kind, "duplicate");
    let snapshot = await relay.alertReadySnapshot(city.id);
    assert.equal(snapshot.mode, "review");
    assert.equal(snapshot.alerts[0].state, "waiting");
    assert.deepEqual(snapshot.alerts[0].screens.map((screen) => screen.id).sort(), ["TB-EN", "TB-FR"]);
    assert.equal((await relay.alertReadySnapshot(other.id)).alerts.length, 0);

    // A person shows it: one message per display language.
    const shown = await relay.showOfficialAlert(first.key, city.id, city.id);
    assert.equal(shown.length, 2);
    const english = await db.getActiveDeviceAlertForDevice("TB-EN");
    const french = await db.getActiveDeviceAlertForDevice("TB-FR");
    assert.equal(english?.title, "Tornado warning in effect");
    assert.equal(french?.title, "Avertissement de tornade en vigueur");
    assert.equal(english?.alertType, "weather");
    assert.equal(english?.issuedBy, "Alert Ready (NAAD System)");
    assert.equal(english?.source, "alert-ready");
    assert.equal(french?.issuedBy, "En Alerte (système ADNA)");
    assert.match(english?.message ?? "", /^Take shelter now/);
    await assert.rejects(() => relay.showOfficialAlert(first.key, city.id, city.id), /already showing/);

    // A Cancel ends the screen messages of the alert it refers to.
    const cancel = await relay.ingestCapMessage(capXml({ identifier: "urn:oid:TEST-1-CANCEL", msgType: "Cancel", sent: "2026-10-09T18:30:00-00:00", references: "cap-pac@canada.ca,urn:oid:TEST-1,2026-10-09T18:00:00-00:00" }), "stream:test");
    assert.equal(cancel.kind === "alert" && cancel.endedAlertIds.length, 2);
    assert.equal(await db.getActiveDeviceAlertForDevice("TB-EN"), null);
    snapshot = await relay.alertReadySnapshot(city.id);
    assert.equal(snapshot.alerts.find((alert) => alert.key === first.key)?.state, "replaced");

    // Show automatically: an unsigned Broadcast Immediately alert still waits.
    await relay.setAlertReadyMode(city.id, "automatic", city.id);
    const waiting = await relay.ingestCapMessage(capXml({ identifier: "urn:oid:TEST-2" }), "stream:test");
    assert.deepEqual(waiting.kind === "alert" && waiting.shownAlertIds, []);
    // A signed one goes on the screens at once.
    const signed = await relay.ingestCapMessage(signCap(capXml({ identifier: "urn:oid:TEST-3", sent: "2026-10-09T19:00:00-00:00" })), "stream:test");
    assert.equal(signed.kind === "alert" && signed.signature, "verified");
    assert.equal(signed.kind === "alert" && signed.shownAlertIds.length, 2);
    // An alert without Broadcast Immediately waits even when signed.
    const quiet = await relay.ingestCapMessage(signCap(capXml({ identifier: "urn:oid:TEST-4", broadcastImmediately: false })), "stream:test");
    assert.deepEqual(quiet.kind === "alert" && quiet.shownAlertIds, []);

    // An Update replaces what the earlier alert was showing.
    const update = await relay.ingestCapMessage(signCap(capXml({ identifier: "urn:oid:TEST-3-UPDATE", msgType: "Update", sent: "2026-10-09T19:15:00-00:00", headline: "Tornado warning extended", references: "cap-pac@canada.ca,urn:oid:TEST-3,2026-10-09T19:00:00-00:00" })), "stream:test");
    assert.equal(update.kind === "alert" && update.endedAlertIds.length, 2);
    assert.equal(update.kind === "alert" && update.shownAlertIds.length, 2);
    assert.equal((await db.getActiveDeviceAlertForDevice("TB-EN"))?.title, "Tornado warning extended");

    // Test and Exercise messages never reach a screen. Off stops everything.
    assert.equal((await relay.ingestCapMessage(signCap(capXml({ identifier: "urn:oid:TEST-5", status: "Test" })), "stream:test")).kind, "ignored");
    await relay.setAlertReadyMode(city.id, "off", city.id);
    const off = await relay.ingestCapMessage(signCap(capXml({ identifier: "urn:oid:TEST-6", sent: "2026-10-09T20:00:00-00:00" })), "stream:test");
    assert.deepEqual(off.kind === "alert" && off.shownAlertIds, []);

    // A heartbeat records feed health and names alerts the app never stored.
    const heartbeat = await relay.ingestCapMessage(heartbeatXml(["cap-pac@canada.ca,urn:oid:TEST-1,2026-10-09T18:00:00-00:00", "cap-pac@canada.ca,urn:oid:MISSED,2026-10-09T18:05:00-00:00"]), "stream:test");
    assert.deepEqual(heartbeat.kind === "heartbeat" && heartbeat.missing.map((reference) => reference.identifier), ["urn:oid:MISSED"]);
    assert.equal((await relay.alertReadySnapshot(city.id)).feed.healthy, true);
  } finally {
    await db.closeDb();
    process.env.DATABASE_URL = saved.url;
    process.env.FEATURE_ALERT_READY = saved.flag;
    process.env.ALERT_READY_SIGNING_CERTS = saved.certs;
  }
});
