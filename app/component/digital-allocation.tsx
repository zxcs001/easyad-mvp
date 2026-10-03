"use client";
import { useI18n } from "../i18n/client";
import type { Allocation } from "../lib/digital-schedule";
export default function DigitalAllocation({ snapshot }: {
    snapshot: unknown;
}) {
    const { t } = useI18n();
    const allocation = snapshot as Allocation | null;
    return <p>{allocation?.model === "fixed-slot-v1" ? t("{seconds} seconds per {loop} second loop. Daily, 24 hours, UTC; no dayparts.", { seconds: allocation.slotSeconds * allocation.slots, loop: allocation.loopSeconds }) : t("Digital allocation is set when the operator confirms the quote.")}</p>;
}
