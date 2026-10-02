"use client";
import {useEffect} from "react";
import type {PlayerManifest} from "../player-types";
export default function PlayerAlertReporter({manifest}:{manifest:PlayerManifest}){
 useEffect(()=>{const controller=new AbortController();let busy=false;const report=async()=>{if(busy||document.hidden||!manifest.published||Date.parse(manifest.validUntil)<=Date.now())return;if(manifest.activeAlert?.image&&Date.parse(manifest.activeAlert.expiresAt)>Date.now()){const photo=document.querySelector<HTMLImageElement>("[data-emergency-photo]");if(!photo?.complete||!photo.naturalWidth)return;}busy=true;try{await fetch("/api/player/alert-render",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({revision:manifest.revision,alertId:manifest.activeAlert&&Date.parse(manifest.activeAlert.expiresAt)>Date.now()?manifest.activeAlert.id:null}),signal:controller.signal});}catch{}finally{busy=false;}};const timer=setInterval(()=>void report(),5000);const first=setTimeout(()=>void report(),1000);return()=>{clearInterval(timer);clearTimeout(first);controller.abort();};},[manifest]);return null;
}
