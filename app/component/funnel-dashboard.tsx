"use client";
import { useEffect,useState } from "react";
import { useI18n } from "../i18n/client";
import { PanelHeading } from "./shared-ui";
type Metric={action?:string;status?:string;count:number};
export default function FunnelDashboard(){const {t}=useI18n();const [states,setStates]=useState<Metric[]>([]);const [events,setEvents]=useState<Metric[]>([]);useEffect(()=>{void fetch("/api/metrics/funnel?days=30").then(response=>response.ok?response.json():null).then(payload=>{if(payload){setStates(payload.campaignStates);setEvents(payload.events);}});},[]);if(!states.length&&!events.length)return null;return <section className="panel funnel-dashboard"><PanelHeading eyebrow={t("Product instrumentation")} title={t("30-day workflow funnel")}/><div className="campaign-report"><dl>{states.map(metric=><div key={metric.status}><dt>{t(metric.status??"")}</dt><dd>{metric.count}</dd></div>)}</dl></div><p>{events.slice(0,6).map(metric=>`${t(metric.action??"")}: ${metric.count}`).join(" · ")}</p></section>}
