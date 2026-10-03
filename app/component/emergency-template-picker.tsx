"use client";
import { AlertTriangle, CloudLightning, DoorOpen, Droplets, MapPinOff, ShieldAlert, UserSearch, CircleCheck } from "lucide-react";
import { emergencyTemplates, type EmergencyTemplate } from "../emergency-templates";
import { useI18n } from "../i18n/client";
import "./emergency-template-picker.css";

const icons: Record<string, typeof AlertTriangle> = { "missing-person": UserSearch, amber: ShieldAlert, weather: CloudLightning, evacuation: DoorOpen, shelter: AlertTriangle, closure: MapPinOff, water: Droplets, "all-clear": CircleCheck };

export default function EmergencyTemplatePicker({ selected, disabled, onChoose }: {
  selected: string; disabled: boolean; onChoose: (template: EmergencyTemplate | null) => void;
}) {
  const { t } = useI18n();
  return <div className="panel emergency-template-picker">
    <div className="emergency-template-heading"><div><h2>{t("Start with a template")}</h2><p>{t("Choose a situation, replace the prompts, and review the screen preview.")}</p></div><button type="button" className="secondary-button" disabled={disabled} aria-pressed={selected === "custom"} onClick={() => onChoose(null)}>{t("Start blank")}</button></div>
    <div className="emergency-template-options" role="group" aria-label={t("Emergency templates")}>
      {emergencyTemplates.map(template => {
        const Icon = icons[template.id] ?? AlertTriangle;
        return <button key={template.id} type="button" className={`emergency-template-option template-${template.alertType}`} disabled={disabled} aria-pressed={selected === template.id} onClick={() => onChoose(template)}><Icon aria-hidden="true" /><span><strong>{t(template.name)}</strong><small>{t(template.description)}</small></span></button>;
      })}
    </div>
  </div>;
}
