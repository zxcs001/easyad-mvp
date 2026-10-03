import PlayerRuntime from "../component/player-runtime";
import { playersEnabled } from "../lib/players";
import { getServerI18n } from "../i18n/server";

export async function generateMetadata() {
  const { t } = await getServerI18n();
  return { title: t("Screen player"), robots: { index: false, follow: false } };
}
export default function PlayerPage() { return <PlayerRuntime enabled={playersEnabled()} />; }
