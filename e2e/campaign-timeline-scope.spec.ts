import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";
import { createCampaignPlan } from "../app/lib/campaigns";
import { closeDb, createUser, getDb } from "../app/lib/db";
import { hashPassword } from "../app/lib/password";

test.afterAll(async () => closeDb());

test("customers see only their own bounded campaign timeline, even in a shared organization", async ({ browser }) => {
  const fixture = await createPlayerFixtures("TIMELINE-E2E");
  const viewer = await createUser("Second customer", `timeline.${randomUUID()}@example.test`, hashPassword(pilotPassword), "advertiser");
  const db = getDb();
  const ownerCampaign = await db.query<{ organization_id: string }>("SELECT organization_id FROM campaigns WHERE id=$1", [fixture.campaignId]);
  const ownerOrgId = ownerCampaign.rows[0].organization_id;
  await db.query("INSERT INTO organization_memberships(organization_id,user_id,membership_role,created_at) VALUES($1,$2,'owner',NOW()) ON CONFLICT DO NOTHING", [ownerOrgId, viewer.id]);
  const viewerCampaignId = await createCampaignPlan(viewer, {
    name: "Second customer campaign", objective: "Local awareness", geography: "Thunder Bay",
    startDate: "2026-10-01", endDate: "2026-10-02", creativePath: "later",
    inventoryIds: [fixture.screen.id], idempotencyKey: randomUUID(),
  });
  for (let index = 0; index < 25; index++) {
    await db.query(
      "INSERT INTO activity_events(id,organization_id,actor_id,subject_type,subject_id,action,created_at) VALUES($1,$2,$3,'campaign',$4,$5,NOW() + ($6 * INTERVAL '1 second'))",
      [`EVT-TIMELINE-${randomUUID()}`, ownerOrgId, fixture.advertiser.id, fixture.campaignId, `step_${index}`, index],
    );
  }

  const owner = await browser.newContext();
  const other = await browser.newContext();
  try {
    for (const [context, email] of [[owner, fixture.advertiser.email], [other, viewer.email]] as const) {
      const login = await context.request.post("http://localhost:3100/api/auth/login", {
        headers: { Origin: "http://localhost:3100" }, form: { email, password: pilotPassword }, maxRedirects: 0,
      });
      expect(login.status()).toBe(303);
    }

    const ownDetail = await owner.request.get(`http://localhost:3100/api/campaigns/${fixture.campaignId}`);
    expect(ownDetail.status()).toBe(200);
    expect((await ownDetail.json()).activity).toHaveLength(20);

    const otherList = await other.request.get("http://localhost:3100/api/campaigns?pageSize=50");
    expect(otherList.status()).toBe(200);
    const list = await otherList.json();
    expect(list.campaigns.map((campaign: { id: string }) => campaign.id)).toContain(viewerCampaignId);
    expect(list.campaigns.map((campaign: { id: string }) => campaign.id)).not.toContain(fixture.campaignId);
    expect((await other.request.get(`http://localhost:3100/api/campaigns/${fixture.campaignId}`)).status()).toBe(404);
    expect((await other.request.get(`http://localhost:3100/api/campaigns/${fixture.campaignId}/report`)).status()).toBe(404);
    expect((await other.request.patch(`http://localhost:3100/api/campaigns/${fixture.campaignId}`, { headers: { Origin: "http://localhost:3100" }, data: {
      action: "update_draft", expectedVersion: 1, name: "Changed by another customer", objective: "Wrong owner",
    } })).status()).toBe(404);

    const activity = await other.request.get("http://localhost:3100/api/activity?pageSize=100");
    expect(activity.status()).toBe(200);
    const activityPayload = await activity.json();
    expect(activityPayload.pageSize).toBe(20);
    expect(activityPayload.events.map((event: { subject_id: string }) => event.subject_id)).toContain(viewerCampaignId);
    expect(activityPayload.events.map((event: { subject_id: string }) => event.subject_id)).not.toContain(fixture.campaignId);
    const foreignActivity = await other.request.get(`http://localhost:3100/api/activity?subjectType=campaign&subjectId=${fixture.campaignId}`);
    expect((await foreignActivity.json()).events).toHaveLength(0);
    expect((await other.request.get("http://localhost:3100/api/activity?subjectType=work_order")).status()).toBe(403);
  } finally {
    await owner.close();
    await other.close();
  }
});
