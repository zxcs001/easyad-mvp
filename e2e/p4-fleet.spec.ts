import {expect,test,type BrowserContext} from "@playwright/test";
import {createPlayerFixtures,pilotPassword} from "../tests/helpers/player-fixtures";
import {closeDb,createInventory,getDb,getInventory} from "../app/lib/db";
import {LOCALE_COOKIE_NAME} from "../app/i18n/config";
const origin="http://localhost:3100";
test.afterAll(async()=>closeDb());
test("P4 private fleet scheduling, scoped editor, visible alert render and restoration",async({browser})=>{
 test.skip(process.env.PILOT_CAMPAIGN_FLAGS==="false","Fleet rollout is disabled");test.setTimeout(120000);
 const f=await createPlayerFixtures(`P4-${Date.now()}`);const privateId=`${f.screen.id}-PRIVATE`;
 await createInventory({...f.screen,id:privateId,name:"Private fleet target",advertisingOptIn:false},f.institution.id,f.institution.id);
 const owner=await browser.newContext({extraHTTPHeaders:{Origin:origin}});const editor=await browser.newContext({extraHTTPHeaders:{Origin:origin}});const display=await browser.newContext({extraHTTPHeaders:{Origin:origin}});const guest=await browser.newContext();
 async function login(ctx:BrowserContext,email:string){const r=await ctx.request.post(`${origin}/api/auth/login`,{form:{email,password:pilotPassword},maxRedirects:0});expect(r.status()).toBe(303);}
 try{
 await login(owner,f.institution.email);await login(editor,f.operator.email);
 const page=await owner.newPage();await page.goto("/government");const fleet=page.getByRole("region",{name:"Fleet operations",exact:true});await expect(fleet).toBeVisible();
 await fleet.getByRole("checkbox",{name:/Private fleet target/}).check();await fleet.getByLabel("Building",{exact:true}).fill("City Hall");await fleet.getByLabel("Department",{exact:true}).fill("Services");await fleet.getByRole("combobox",{name:"Content visibility",exact:true}).selectOption("private");await fleet.getByRole("button",{name:"Save selected screen policy",exact:true}).click();
 await expect.poll(async()=>(await getInventory(privateId))?.contentVisibility).toBe("private");
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jw1cAAAAASUVORK5CYII=","base64");
 const uploaded=await owner.request.post(`${origin}/api/inventory/${privateId}/media`,{multipart:{title:"Private service notice",file:{name:"notice.png",mimeType:"image/png",buffer:png}}});expect(uploaded.status()).toBe(201);const resource=(await uploaded.json()).resource;
 expect((await guest.request.get(`${origin}/media/${resource.id}`)).status()).toBe(404);expect((await guest.request.get(`${origin}/api/public/devices/${privateId}/media`)).status()).toBe(404);expect((await guest.request.get(`${origin}/devices/${privateId}`)).status()).toBe(404);
 const code=await owner.request.post(`${origin}/api/inventory/${privateId}/player`);expect(code.status()).toBe(201);const displayPage=await display.newPage();await displayPage.goto("/player");await displayPage.getByLabel("Pairing code",{exact:true}).fill((await code.json()).code);await displayPage.getByRole("button",{name:"Pair this screen",exact:true}).click();await expect(displayPage.locator(`[data-player-slide="${resource.id}"] img`)).toBeVisible();
 const alert=await owner.request.post(`${origin}/api/institution/alerts`,{data:{alertType:"public-safety",title:"Pilot private alert",message:"Test instructions",area:"Office",targetDeviceIds:[privateId],expiresAt:new Date(Date.now()+90000).toISOString()}});expect(alert.status()).toBe(201);const alertId=(await alert.json()).alert.id;
 await expect(displayPage.getByRole("heading",{name:"Pilot private alert",exact:true})).toBeVisible({timeout:30000});
 await expect.poll(async()=>{const r=await owner.request.get(`${origin}/api/institution/fleet`);return (await r.json()).alertDelivery.find((a:any)=>a.alert_id===alertId)?.rendered_at;},{timeout:30000}).toBeTruthy();
 expect((await owner.request.patch(`${origin}/api/institution/alerts/${alertId}`,{data:{action:"end"}})).status()).toBe(200);await expect(displayPage.getByRole("heading",{name:"Pilot private alert",exact:true})).toHaveCount(0,{timeout:30000});
 await expect.poll(async()=>{const r=await owner.request.get(`${origin}/api/institution/fleet`);return (await r.json()).alertDelivery.find((a:any)=>a.alert_id===alertId)?.restored_at;},{timeout:30000}).toBeTruthy();
 await fleet.getByRole("button",{name:"Refresh",exact:true}).click();await fleet.getByRole("combobox",{name:"Source announcement media",exact:true}).selectOption(resource.id);await fleet.getByLabel("Announcement name",{exact:true}).fill("Reusable service notice");await fleet.getByRole("button",{name:"Save reusable announcement",exact:true}).click();await expect(fleet.getByRole("combobox",{name:"Saved announcement",exact:true}).locator("option")).toHaveCount(2);
 const until=new Date(Date.now()+120000).toISOString();const scheduled=await owner.request.post(`${origin}/api/institution/fleet`,{data:{action:"schedule",targets:[{id:privateId,version:(await getInventory(privateId))!.fleetVersion}],mediaId:resource.id,startsAt:new Date().toISOString(),endsAt:until}});expect((await scheduled.json()).succeeded).toBe(1);
 await fleet.getByRole("combobox",{name:"Department editor",exact:true}).selectOption(f.operator.id);await fleet.getByRole("button",{name:"Save scope and revoke sessions",exact:true}).click();await expect.poll(async()=>(await editor.request.get(`${origin}/api/institution/fleet`)).status()).toBe(401);await login(editor,f.operator.email);
 expect((await editor.request.post(`${origin}/api/inventory/${f.screen.id}/media`,{multipart:{file:{name:"bad.png",mimeType:"image/png",buffer:png}}})).status()).toBe(403);
 const stale=await editor.request.post(`${origin}/api/institution/fleet`,{data:{action:"publish",targets:[{id:privateId,version:(await getInventory(privateId))!.fleetVersion}]}});expect((await stale.json()).failed).toBe(1);
 await page.setViewportSize({width:390,height:844});await fleet.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await fleet.screenshot({path:"docs/verification/p4-fleet-phone.png"});
 await owner.addCookies([{name:LOCALE_COOKIE_NAME,value:"fr",url:origin}]);await page.reload();const french=page.getByRole("region",{name:"Opérations du parc",exact:true});await expect(french).toBeVisible();await french.getByLabel("Filtrer par bâtiment ou service",{exact:true}).focus();await page.keyboard.press("Tab");await expect(french.getByRole("button",{name:"Sélectionner les écrans filtrés",exact:true})).toBeFocused();await page.emulateMedia({forcedColors:"active",reducedMotion:"reduce"});await page.evaluate(()=>document.documentElement.style.zoom="2");await expect(french.getByRole("button",{name:"Sélectionner les écrans filtrés",exact:true})).toBeVisible();
 const audits=(await getDb().query("SELECT * FROM fleet_audit WHERE target_id=$1",[privateId])).rows;expect(audits.some(a=>a.action==="alert_created")).toBe(true);expect(JSON.stringify(audits)).not.toContain("Test instructions");
 }finally{await owner.close();await editor.close();await display.close();await guest.close();}
});
