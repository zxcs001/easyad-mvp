import * as assert from "node:assert/strict";
import { test } from "vitest";
import { inspectCreativeUpload } from "../app/lib/uploads";

test("creative uploads validate PDF and image signatures rather than extensions",async()=>{
  const pdf=new File([Buffer.from("%PDF-1.7\nfictional")],"artwork.pdf",{type:"application/pdf"});
  assert.equal((await inspectCreativeUpload(pdf,["pdf"],1024))?.extension,"pdf");
  assert.equal((await inspectCreativeUpload(pdf,["application/pdf"],1024))?.extension,"pdf");
  const spoofed=new File([Buffer.from("not a pdf")],"artwork.pdf",{type:"application/pdf"});
  assert.equal(await inspectCreativeUpload(spoofed,["pdf"],1024),null);
  const wrongType=new File([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],"artwork.png",{type:"application/pdf"});
  assert.equal(await inspectCreativeUpload(wrongType,["png"],1024),null);
});

test("media uploads recognize GIF87a and GIF89a signatures", async () => {
  const { inspectMediaUpload } = await import("../app/lib/uploads");
  for (const signature of ["GIF87a", "GIF89a"]) {
    const file = new File([Buffer.from(signature, "ascii")], "animated.gif", { type: "image/gif" });
    const inspected = await inspectMediaUpload(file, ["gif"]);
    assert.equal(inspected?.extension, "gif");
    assert.equal(inspected?.mimeType, "image/gif");
    assert.equal(inspected?.mediaType, "image");
  }
});
