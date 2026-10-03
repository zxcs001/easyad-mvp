import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  MapPinned,
  MonitorPlay,
  ShieldAlert,
  Upload,
  UsersRound,
} from "lucide-react";
import { getCurrentUser } from "../../lib/auth";
import { canAccessInstitutionWorkspace } from "../../roles";
import "./government-about.css";
import { getServerI18n } from "../../i18n/server";
import { LanguageSelector } from "../../i18n/client";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getServerI18n();
  return { title: t("Government and Institution Screen Operations — EasyAD Platform"), description: t("Learn how institutions, local government, and large organizations manage owned public-screen networks before secure sign-in.") };
}

const capabilities = [
  {
    icon: MapPinned,
    title: "See the whole fleet",
    copy: "Map institution-owned devices, check publishing state, and select a screen without losing network context.",
  },
  {
    icon: Upload,
    title: "Publish without a queue",
    copy: "Institution owners can add approved image or video content directly. Uploading never silently publishes a screen that was intentionally offline.",
  },
  {
    icon: MonitorPlay,
    title: "Review representative output",
    copy: "Open a useful 16:9 representation of each screen's current rotation. It reflects content state, not a live camera stream.",
  },
  {
    icon: ShieldAlert,
    title: "Override selected screens",
    copy: "Authorized teams can place a time-limited emergency message across owned displays with explicit scope and end controls.",
  },
];

export default async function GovernmentAboutPage() {
  const { t } = await getServerI18n();
  const currentUser = await getCurrentUser();
  const hasWorkspaceAccess = canAccessInstitutionWorkspace(currentUser?.role);
  const accessHref = hasWorkspaceAccess ? "/government" : "/government/login?returnTo=%2Fgovernment";
  const accessLabel = hasWorkspaceAccess ? "Open your dashboard" : "Continue to secure sign in";

  return (
    <main className="government-about-page">
      <header className="government-about-nav">
        <Link className="government-about-brand" href="/" aria-label={t("EasyAD Platform home")}>
          <span className="government-about-emblem"><Building2 aria-hidden="true" /></span>
          <span><small>{t("EasyAD Platform")}</small><strong>{t("Civic Screen Operations")}</strong></span>
        </Link>
        <div className="government-about-nav-actions">
          <Link href="/">{t("Marketplace")}</Link>
          <Link className="government-about-access" href={accessHref}>{t(hasWorkspaceAccess ? "Open workspace" : "Institution sign in")}</Link>
          <LanguageSelector placement="embedded" />
        </div>
      </header>

      <section className="government-about-hero" aria-labelledby="government-about-title">
        <div className="government-about-hero-copy">
          <p className="government-about-kicker"><span aria-hidden="true" /> {t("For government, institutions, and large screen networks")}</p>
          <h1 id="government-about-title">{t("Public screens, under your authority.")}</h1>
          <p className="government-about-lede">{t("Civic Screen Operations is a dedicated environment for organizations that own and operate their displays. Coordinate devices, publish timely media, understand what is generally on screen, and interrupt selected displays when an urgent local message cannot wait.")}</p>
          <div className="government-about-actions">
            <Link className="government-about-primary" href={accessHref}>{t(accessLabel)}<ArrowRight aria-hidden="true" /></Link>
            <a className="government-about-secondary" href="#capabilities">{t("Explore capabilities")}</a>
          </div>
          <p className="government-about-access-note"><CheckCircle2 aria-hidden="true" /> {t("Workspace access is reserved for Institution accounts and Super Admin.")}</p>
        </div>

        <div className="government-about-console" aria-label={t("Illustration of institution screen control")}>
          <div className="government-about-console-head">
            <span><i aria-hidden="true" /> {t("Institution network")}</span>
            <strong>{t("Authorized scope")}</strong>
          </div>
          <div className="government-about-console-body">
            <div className="government-about-network-list" aria-label={t("Example device states")}>
              <div className="is-selected"><span>{t("City Hall entrance")}</span><small>{t("Published")}</small></div>
              <div><span>{t("Transit exchange")}</span><small>{t("Published")}</small></div>
              <div><span>{t("Community centre")}</span><small>{t("Unpublished")}</small></div>
            </div>
            <div className="government-about-screen-wrap">
              <div className="government-about-screen">
                <span>{t("Community update")}</span>
                <strong>{t("Public service hours")}</strong>
                <small>{t("Image and video rotation")}</small>
              </div>
              <p>{t("Representative content preview — not a live camera feed.")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="government-about-audience" aria-label={t("Organizations served")}>
        <span>{t("Municipal government")}</span>
        <span>{t("Public institutions")}</span>
        <span>{t("Campuses and healthcare")}</span>
        <span>{t("Large distributed networks")}</span>
      </section>

      <section className="government-about-capabilities" id="capabilities" aria-labelledby="capabilities-title">
        <div className="government-about-section-heading">
          <span>{t("One controlled operating picture")}</span>
          <h2 id="capabilities-title">{t("Manage the device, the message, and the public-facing result.")}</h2>
          <p>{t("The workspace reuses the proven media and inventory controls of EasyAD Platform inside a distinct civic shell, with permissions and publishing behavior suited to owned screen networks.")}</p>
        </div>
        <div className="government-about-capability-list">
          {capabilities.map(({ icon: Icon, title, copy }, index) => (
            <article key={title}>
              <span className="government-about-capability-index">0{index + 1}</span>
              <Icon aria-hidden="true" />
              <div><h3>{t(title)}</h3><p>{t(copy)}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="government-about-publishing" aria-labelledby="publishing-title">
        <div className="government-about-publishing-copy">
          <span className="government-about-section-label">{t("Publishing authority")}</span>
          <h2 id="publishing-title">{t("One upload surface. Two accountable paths to screen.")}</h2>
          <p>{t("Owners and delegated operators use the same media tools. What happens next depends on authority: owners publish directly, while operator uploads return to the institution for review.")}</p>
        </div>
        <div className="government-about-publishing-board" aria-label={t("Institution media publishing routes")}>
          <div className="government-about-board-head">
            <span><i aria-hidden="true" /> {t("Institution media routing")}</span>
            <strong>{t("Owner governed")}</strong>
          </div>
          <div className="government-about-board-body">
            <div className="government-about-upload-origin">
              <span className="government-about-upload-icon"><Upload aria-hidden="true" /></span>
              <span>{t("Shared entry point")}</span>
              <strong>{t("Upload media")}</strong>
              <small>{t("Same image and video tools")}</small>
            </div>
            <div className="government-about-route-switch" aria-hidden="true"><span /></div>
            <div className="government-about-publishing-routes">
              <article className="government-about-publishing-route owner">
                <header>
                  <span className="government-about-route-icon"><Building2 aria-hidden="true" /></span>
                  <span><small>{t("Owner path")}</small><strong>{t("Institution owner")}</strong></span>
                  <span className="government-about-authority-badge">{t("Direct authority")}</span>
                </header>
                <ol>
                  <li><span>01</span><strong>{t("Approved immediately")}</strong><small>{t("No review queue")}</small></li>
                  <li><span>02</span><strong>{t("Ready for display")}</strong><small>{t("When the screen is published")}</small></li>
                </ol>
              </article>
              <article className="government-about-publishing-route delegated">
                <header>
                  <span className="government-about-route-icon"><UsersRound aria-hidden="true" /></span>
                  <span><small>{t("Delegated path")}</small><strong>{t("Institution operator")}</strong></span>
                  <span className="government-about-authority-badge">{t("Review required")}</span>
                </header>
                <ol>
                  <li><span>01</span><strong>{t("Owner review")}</strong><small>{t("Institution keeps control")}</small></li>
                  <li><span>02</span><strong>{t("Approved for rotation")}</strong><small>{t("Then ready for display")}</small></li>
                </ol>
              </article>
            </div>
          </div>
          <p className="government-about-board-note"><CheckCircle2 aria-hidden="true" /> {t("Approval never changes a screen that an owner intentionally left unpublished.")}</p>
        </div>
      </section>

      <section className="government-about-boundary" aria-labelledby="boundary-title">
        <ShieldAlert aria-hidden="true" />
        <div>
          <span>{t("Clear operating boundary")}</span>
          <h2 id="boundary-title">{t("Emergency overrides stay inside your managed screen network.")}</h2>
          <p>{t("The feature does not send a wireless alert, contact emergency services, or issue through Alert Ready or another official public-alert system. It temporarily replaces ordinary content only on the owned displays you select.")}</p>
        </div>
      </section>

      <section className="government-about-cta" aria-labelledby="government-about-cta-title">
        <div><span>{t("Dedicated access")}</span><h2 id="government-about-cta-title">{t("Ready to operate your screen network?")}</h2><p>{t("Use your Institution account, or enter as Super Admin for authorized cross-institution oversight.")}</p></div>
        <div><Link className="government-about-primary" href={accessHref}>{t(accessLabel)}<ArrowRight aria-hidden="true" /></Link><small>{t("Need an account? Contact your EasyAD Platform Super Admin.")}</small></div>
      </section>
    </main>
  );
}
