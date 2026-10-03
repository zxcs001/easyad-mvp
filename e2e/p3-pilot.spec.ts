import { expect, test, type BrowserContext } from "@playwright/test";
import { createPlayerFixtures,pilotPassword } from "../tests/helpers/player-fixtures";
import { closeDb,createInventory,getDb } from "../app/lib/db";
import { LOCALE_COOKIE_NAME } from "../app/i18n/config";
const origin="http://localhost:3100";
test.afterAll(async()=>closeDb());
test("P3 advertiser plan, exact approvals, phone delay/retry, separate private proof and repeat draft",async({browser})=>{
 test.skip(process.env.PILOT_CAMPAIGN_FLAGS==="false","P3 is gated off");test.setTimeout(120000);
 const f=await createPlayerFixtures(`P3-${Date.now()}`);const second={...f.screen,advertisingOptIn:true,id:`${f.screen.id}-2`,name:"Second pilot screen"};await createInventory(second,f.institution.id,f.institution.id);
 const client=await browser.newContext({extraHTTPHeaders:{Origin:origin}});const operator=await browser.newContext({extraHTTPHeaders:{Origin:origin},viewport:{width:390,height:844}});
 async function login(context:BrowserContext,email:string){const r=await context.request.post(`${origin}/api/auth/login`,{headers:{Origin:origin},form:{email,password:pilotPassword},maxRedirects:0});expect(r.status()).toBe(303);}
 await login(client,f.advertiser.email);await login(operator,f.admin.email);
 try{
 const created=await client.request.post(`${origin}/api/campaigns`,{data:{name:"P3 phone pilot",objective:"Awareness",geography:"Thunder Bay",startDate:"2028-01-01",endDate:"2028-01-07",creativePath:"upload",inventoryIds:[f.screen.id,second.id,f.staticId]}});expect(created.status()).toBe(201);const cid=(await created.json()).campaignId;
 expect((await operator.request.patch(`${origin}/api/campaigns/${cid}`,{data:{action:"operator_confirm",expectedVersion:1}})).status()).toBe(200);
 expect((await client.request.patch(`${origin}/api/campaigns/${cid}`,{data:{action:"accept_offline",expectedVersion:2}})).status()).toBe(200);
 const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw1cAAAAASUVORK5CYII=","base64");
 const upload=await client.request.post(`${origin}/api/creative/assets`,{multipart:{campaignId:cid,file:{name:"pilot.png",mimeType:"image/png",buffer:bytes}}});expect(upload.status()).toBe(201);const versionId=(await upload.json()).versionId;
 expect((await client.request.post(`${origin}/api/creative/versions/${versionId}/reviews`,{data:{reviewType:"client",decision:"approved"}})).status()).toBe(200);
 expect((await operator.request.post(`${origin}/api/creative/versions/${versionId}/reviews`,{data:{reviewType:"operator",decision:"approved"}})).status()).toBe(200);
 const job=(await getDb().query("SELECT j.* FROM production_jobs j JOIN placements p ON p.id=j.placement_id WHERE p.campaign_id=$1",[cid])).rows[0];
 let v=job.version;for(const status of ["in_production","printed","shipped","delivered"])expect((await operator.request.patch(`${origin}/api/production-jobs/${job.id}`,{data:{status,expectedVersion:v++}})).status()).toBe(200);
 const page=await operator.newPage();await page.goto("/?role=admin&view=campaigns");
 const card=page.locator(".static-operations article").filter({has:page.getByRole("button",{name:"Complete installation",exact:true})}).filter({hasText:f.staticId.replace("INV-","").replace("-STATIC"," Billboard")});
 const orderCard=page.locator(".static-operations article").filter({has:page.getByRole("button",{name:"Complete installation",exact:true})}).last();
 await expect(orderCard).toBeVisible();
 page.once("dialog",dialog=>dialog.accept("Unsafe wind"));await orderCard.getByRole("button",{name:"Weather delay",exact:true}).click();await expect(orderCard.getByRole("button",{name:"Complete installation",exact:true})).toBeDisabled();
 await orderCard.getByLabel("Planned date",{exact:true}).fill("2028-01-02");await orderCard.getByLabel("Access instructions",{exact:true}).fill("Call the site desk");await orderCard.getByRole("button",{name:"Save assignment and schedule",exact:true}).click();
 await expect(orderCard.getByText("scheduled",{exact:false}).first()).toBeVisible();
 await page.route("**/api/work-orders/*/evidence",async route=>{if(route.request().method()==="POST"){await route.abort();await page.unroute("**/api/work-orders/*/evidence");}else await route.continue();});
 await orderCard.locator('input[type="file"]').setInputFiles({name:"proof.png",mimeType:"image/png",buffer:bytes});
 await expect(orderCard.getByRole("button",{name:"Retry",exact:true})).toBeVisible();await orderCard.getByRole("button",{name:"Retry",exact:true}).click();
 await expect(orderCard.getByRole("button",{name:"Complete installation",exact:true})).toBeEnabled();
 await expect(orderCard.getByLabel("Share completion photos with client",{exact:true})).not.toBeChecked();
 await orderCard.getByLabel("Share completion photos with client",{exact:true}).check();await orderCard.getByRole("button",{name:"Complete installation",exact:true}).click();await expect(orderCard.getByText("Completed at:",{exact:false})).toBeVisible();
 await page.screenshot({path:"docs/verification/p3-phone.png",fullPage:true});
 const advertiserPage=await client.newPage();await advertiserPage.goto("/?role=advertiser&view=campaigns");await advertiserPage.getByRole("button",{name:/P3 phone pilot/}).click();await expect(advertiserPage.getByRole("heading",{name:"Quote cost breakdown",exact:true})).toBeVisible();
 await advertiserPage.getByRole("button",{name:"Open campaign report",exact:true}).click();await expect(advertiserPage.getByRole("link",{name:"proof.png",exact:true})).toBeVisible();
 const report=await client.request.get(`${origin}/api/campaigns/${cid}/report`);const data=await report.json();expect(data.proofOfPosting).toHaveLength(1);expect(data.proofOfPlay).toHaveLength(0);
 await advertiserPage.getByRole("button",{name:"Repeat campaign",exact:true}).click();await expect(advertiserPage.getByLabel("Start",{exact:true})).toHaveValue("");
 await client.addCookies([{name:LOCALE_COOKIE_NAME,value:"fr",url:origin}]);await advertiserPage.reload();await expect(advertiserPage.getByText("Campagnes",{exact:true}).first()).toBeVisible();
 }finally{await client.close();await operator.close();}
});

