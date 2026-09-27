/* BlastTree — one expandable row per downstream symbol: callers as
   file:line links (or plain mono text without a resolved repo), then the
   endpoint/cron pills that symbol's callers sit in. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CRON_COLOR, ENDPOINT_COLOR } from "../../constants";
import { showUnattributedEndpoints, uncalledCount } from "../../helpers";
import { s } from "../../styles";

export function BlastTree({
  data,
  repoFullName,
  headSha,
}: {
  data: BlastRadiusResponse;
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(data.downstream[0] ? [data.downstream[0].symbol] : []),
  );

  function toggle(symbol: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  const uncalled = uncalledCount(data);
  const showUnattributed = showUnattributedEndpoints(data);

  return (
    <div style={s.treeRoot}>
      {data.downstream.map((entry) => {
        const isOpen = expanded.has(entry.symbol);
        return (
          <div key={entry.symbol} style={s.row}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={t(isOpen ? "collapse" : "expand", { symbol: entry.symbol })}
              style={s.rowHeader}
              onClick={() => toggle(entry.symbol)}
            >
              {isOpen ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
              <span style={s.rowHeaderSymbol}>
                <Icon.Code size={13} style={{ color: "var(--accent)" }} />
                <span className="mono">{entry.symbol}</span>
              </span>
              <span style={s.rowHeaderCount}>
                {t("callerCount", { count: entry.callers.length })}
              </span>
            </button>

            {isOpen && (
              <>
                <div style={s.callerList}>
                  {entry.callers.map((c, i) => (
                    <div key={i} style={s.callerLine}>
                      <Icon.CornerDownRight size={12} style={{ color: "var(--text-muted)" }} />
                      {repoFullName ? (
                        <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>
                          {c.file}:{c.line}
                        </MonoLink>
                      ) : (
                        <span className="mono">
                          {c.file}:{c.line}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {(entry.endpoints_affected.length > 0 || entry.crons_affected.length > 0) && (
                  <div style={s.badgeRow}>
                    {entry.endpoints_affected.map((ep) => (
                      <Badge
                        key={ep}
                        mono
                        icon="Globe"
                        color={ENDPOINT_COLOR.color}
                        bg={ENDPOINT_COLOR.bg}
                      >
                        {ep}
                      </Badge>
                    ))}
                    {entry.crons_affected.map((cron) => (
                      <Badge
                        key={cron}
                        mono
                        icon="Clock"
                        color={CRON_COLOR.color}
                        bg={CRON_COLOR.bg}
                      >
                        {cron}
                      </Badge>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {(uncalled > 0 || showUnattributed) && (
        <div style={s.footer}>
          {uncalled > 0 && <span>{t("uncalled", { count: uncalled })}</span>}
          {showUnattributed && (
            <div>
              <span>{t("endpointsUnattributed")}</span>
              <div style={s.badgeRow}>
                {data.endpoints.map((ep) => (
                  <Badge key={ep} mono icon="Globe" color={ENDPOINT_COLOR.color} bg={ENDPOINT_COLOR.bg}>
                    {ep}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
