"use client";

import "./device-api-guide.css";
import { useI18n } from "../i18n/client";

export default function DeviceApiGuide({ deviceId, deviceName, mediaCount }: { deviceId: string; deviceName: string; mediaCount: number }) {
  const { t } = useI18n();
  const apiPath = `/api/public/devices/${encodeURIComponent(deviceId)}/media`;

  return (
    <aside className="device-api-guide" aria-label={t("{name} developer API", { name: deviceName })}>
      <div className="device-api-heading">
        <span>{t("Developer API")}</span>
        <strong>{deviceName}</strong>
        <small>{t(mediaCount === 1 ? "{count} active media item" : "{count} active media items", { count: mediaCount })}</small>
      </div>
      <a href={apiPath} target="_blank" rel="noreferrer"><code>GET {apiPath}</code></a>
      <code>GET {apiPath}/{"{position-or-mediaId}"}</code>
    </aside>
  );
}
