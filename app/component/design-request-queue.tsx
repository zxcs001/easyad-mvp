"use client";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/client";
import { PanelHeading } from "./shared-ui";
type RequestRow={id:string;campaign_name:string;priority:string;status:string;due_at:string|null;has_artwork:boolean};
export default function DesignRequestQueue(){const {t}=useI18n();const [requests,setRequests]=useState<RequestRow[]>([]);useEffect(()=>{void fetch("/api/design-requests?pageSize=20").then(response=>response.ok?response.json():null).then(payload=>payload&&setRequests(payload.requests));},[]);if(!requests.length)return null;return <section className="panel design-request-queue"><PanelHeading eyebrow={t("Agency design service")} title={t("Designer work queue")}/><div className="campaign-cards">{requests.map(request=><article key={request.id}><span className="status">{t(request.priority)}</span><strong>{request.campaign_name}</strong><small>{request.due_at?t("Due {date}",{date:request.due_at}):t("Due date missing")} · {t(request.status)}</small>{!request.has_artwork?<p className="readiness-blocker">{t("Blocker: no artwork version uploaded")}</p>:null}</article>)}</div></section>}
