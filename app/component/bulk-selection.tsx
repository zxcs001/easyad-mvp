"use client";
import type { ReactNode } from "react";

export function BulkSelection({label,ids,selected,onChange,actions}:{label:string;ids:string[];selected:Set<string>;onChange:(next:Set<string>)=>void;actions?:ReactNode}){
 const all=ids.length>0&&ids.every(id=>selected.has(id));
 return <div className="bulk-selection" role="group" aria-label={label}><label><input type="checkbox" checked={all} aria-checked={selected.size>0&&!all?"mixed":all} onChange={event=>onChange(event.target.checked?new Set(ids):new Set())}/><span>{selected.size?`${selected.size} explicitly selected`:"Select this page"}</span></label>{selected.size?actions:null}</div>;
}
