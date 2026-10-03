import * as assert from "node:assert/strict";
import { test } from "vitest";
import { inventoryDataQuality } from "../app/lib/inventory-quality";

test("inventory quality flags stale measurement evidence",()=>{
  const result=inventoryDataQuality({id:"I",name:"Face",operator:"Owner",format:"static",deliveryMode:"static",x:1,y:1,address:"1 Main",price:2,impressions:3,traffic:4,income:5,audience:"Adults",competitor:"Low",occupancy:1,imageInterval:6,maxLoopSeconds:120,availableFrom:"2026-01-01",availableTo:"2027-01-01",productionLeadDays:2,installationLeadDays:1,measurementUpdatedAt:"2020-01-01"},new Date("2026-08-24"));
  assert.equal(result.score,100);assert.equal(result.stale,true);
});
