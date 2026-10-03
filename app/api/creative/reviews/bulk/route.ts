import { NextRequest, NextResponse } from "next/server";
import { POST as review } from "../../versions/[id]/reviews/route";
import { isFeatureEnabled } from "../../../../lib/feature-flags";
export async function POST(request:NextRequest){
 if(!isFeatureEnabled("agency_workspace"))return NextResponse.json({error:"Not available"},{status:404});
 const body=await request.json().catch(()=>({}));
 const ids:string[]=[...new Set<string>(Array.isArray(body.versionIds)?body.versionIds.map(String):[])].slice(0,100);
 if(!ids.length)return NextResponse.json({error:"Select creative versions"},{status:422});
 const results=[];
 for(const id of ids){const response=await review(new NextRequest(request.url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reviewType:"operator",decision:body.decision,reason:body.reason})}),{params:Promise.resolve({id})});const result=await response.json();results.push({id,ok:response.ok,...(!response.ok?{error:result.error}:{})});}
 return NextResponse.json({selectionScope:`${ids.length} explicitly selected creative versions`,succeeded:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results});
}
