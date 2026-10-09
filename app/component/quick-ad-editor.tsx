"use client";

import "./quick-ad-editor.css";
import { CircleCheck, Lightbulb, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n/client";
import type { CreativeTemplateTopic } from "../creative-templates";
import { glanceChecks, headlineIdeas, quickAdFields, quickAdFieldsByTopic, type QuickAdFields } from "../quick-ad";

/**
 * The fill-in-the-blanks editor for a ready-made design. A person types the
 * words; the design keeps the layout. When the HTML was changed by hand, the
 * fields stop controlling the ad and say so, with one way back.
 */
export function QuickAdEditor({ topic, fields, handEdited, onChange, onUseFields }: { topic: CreativeTemplateTopic; fields?: QuickAdFields; handEdited: boolean; onChange: (next: QuickAdFields) => void; onUseFields: () => void }) {
  const { t } = useI18n();
  const values = quickAdFields(topic, fields);
  const set = (id: keyof QuickAdFields, value: string) => onChange({ ...values, [id]: value });
  return (
    <div className="quick-ad">
      {handEdited ? (
        <div className="quick-ad-notice" role="note" id="quick-ad-hand-edited">
          <TriangleAlert aria-hidden="true" />
          <span>{t("You changed the HTML by hand, so these fields no longer control the ad.")}</span>
          <button className="secondary-button" type="button" onClick={onUseFields}>{t("Use the fields again")}</button>
        </div>
      ) : null}
      <fieldset className="quick-ad-fields" disabled={handEdited} aria-describedby={handEdited ? "quick-ad-hand-edited" : undefined}>
        <legend>{t("Your words")}</legend>
        {quickAdFieldsByTopic[topic].map((field) => {
          const id = `quick-ad-${topic}-${field.id}`;
          const value = values[field.id];
          return (
            <div key={field.id} className={`quick-ad-field${field.multiline ? " is-wide" : ""}`}>
              <label className="quick-ad-label" htmlFor={id}>{t(field.label)}<small aria-hidden="true">{value.length}/{field.maxLength}</small></label>
              {field.multiline
                ? <textarea id={id} rows={field.id === "headline" ? 3 : 2} maxLength={field.maxLength} value={value} aria-describedby={field.hint ? `${id}-hint` : undefined} onChange={(event) => set(field.id, event.target.value)} />
                : <input id={id} type="text" maxLength={field.maxLength} value={value} aria-describedby={field.hint ? `${id}-hint` : undefined} onChange={(event) => set(field.id, event.target.value)} />}
              {field.hint ? <small id={`${id}-hint`}>{t(field.hint)}</small> : null}
            </div>
          );
        })}
        <div className="quick-ad-ideas is-wide">
          <span><Lightbulb aria-hidden="true" />{t("Headline ideas")}</span>
          {headlineIdeas[topic].map((idea) => (
            <button key={idea} type="button" onClick={() => set("headline", idea)}>{idea.replace(/\n/g, " ")}</button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** The glance test: advice on how fast a passer-by can read the ad. It never blocks a submission. */
export function GlanceTest({ topic, fields }: { topic: CreativeTemplateTopic; fields?: QuickAdFields }) {
  const { t } = useI18n();
  const checks = glanceChecks(topic, fields);
  const passed = checks.filter((check) => check.ok).length;
  return (
    <section className="glance-test" aria-labelledby="glance-test-title">
      <div className="glance-test-head">
        <strong id="glance-test-title">{t("Glance test")}</strong>
        <span className={`status ${passed === checks.length ? "good" : ""}`}>{t("{passed} of {total} pass", { passed, total: checks.length })}</span>
      </div>
      <p>{t("People see a screen for a few seconds. These are suggestions; you can still submit.")}</p>
      <ul>
        {checks.map((check) => (
          <li key={check.id} className={check.ok ? "pass" : "advice"}>
            {check.ok ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
            <span><strong>{t(check.label)}</strong><small>{glanceMessage(check, t)}</small></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Messages carry numbers; translate the pattern, not the filled-in sentence.
function glanceMessage(check: { id: string; message: string }, t: (message: string, variables?: Record<string, string | number>) => string) {
  const count = Number(check.message.match(/^(\d+)/)?.[1] ?? NaN);
  if (check.id === "headline-words" && Number.isFinite(count)) return t("{count} words. Six or fewer reads at a glance.", { count });
  if (check.id === "total-words" && Number.isFinite(count)) return t("{count} words to read. Fifteen or fewer works for a passing audience.", { count });
  return t(check.message);
}
