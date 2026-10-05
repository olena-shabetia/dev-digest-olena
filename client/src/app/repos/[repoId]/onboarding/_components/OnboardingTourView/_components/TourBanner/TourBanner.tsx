/* TourBanner — skeleton (reason + next step) and stale (both short SHAs) notices. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingSkeletonReason } from "@/lib/types";
import { shortSha, skeletonReasonKey } from "../../helpers";
import { s } from "../../styles";

export function TourBanner(
  props:
    | { kind: "skeleton"; reason: OnboardingSkeletonReason | null }
    | { kind: "stale"; tourSha: string | null; currentSha: string | null },
) {
  const t = useTranslations("onboarding");
  if (props.kind === "skeleton") {
    const key = skeletonReasonKey(props.reason);
    return (
      <div role="status" style={s.banner("warn")}>
        <Icon.AlertTriangle size={16} />
        <div style={s.bannerBody}>
          <strong>{t(`${key}.title`)}</strong>
          <span style={s.bannerNext}>{t(`${key}.next`)}</span>
        </div>
      </div>
    );
  }
  return (
    <div role="status" style={s.banner("info")}>
      <Icon.Info size={16} />
      <div style={s.bannerBody}>
        <span>
          {t("stale.body", { tourSha: shortSha(props.tourSha), currentSha: shortSha(props.currentSha) })}
        </span>
        <span style={s.bannerNext}>{t("stale.next")}</span>
      </div>
    </div>
  );
}
