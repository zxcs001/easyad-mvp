import { NextRequest,NextResponse } from "next/server";
import { playerCookie,playersEnabled,reportAlertRender,PlayerError } from "../../../lib/players";
export async function POST(request:NextRequest){if(!playersEnabled())return NextResponse.json({error:"Not available"},{status:404});try{return NextResponse.json(await reportAlertRender(request.cookies.get(playerCookie)?.value??"",await request.json()));}catch(e){return NextResponse.json({error:e instanceof PlayerError?e.message:"Render report failed"},{status:e instanceof PlayerError?e.status:500});}}
