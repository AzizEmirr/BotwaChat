import { ExternalLink } from "lucide-react";
import { Fragment } from "react";
import { parseMessageLinks } from "../../lib/linkUtils";
import { useAppPreferences } from "../../lib/useAppPreferences";
import { useLinkGuard } from "../ui/LinkGuardProvider";

type LinkifiedTextProps = {
  content: string;
  className?: string;
};

const MAX_LINK_LABEL_LENGTH = 78;

function formatLinkLabel(href: string): string {
  try {
    const parsed = new URL(href);
    const host = parsed.hostname.replace(/^www\./i, "");
    const decodedPath = decodeURIComponent(parsed.pathname || "/");
    const path = decodedPath === "/" ? "" : decodedPath;
    const isInviteLink = /\/invite\//i.test(decodedPath);
    const suffix = parsed.search && !isInviteLink ? "?..." : "";
    const label = `${host}${path}${suffix}`;
    if (label.length <= MAX_LINK_LABEL_LENGTH) {
      return label;
    }
    return `${label.slice(0, Math.max(1, MAX_LINK_LABEL_LENGTH - 3)).trimEnd()}...`;
  } catch {
    if (href.length <= MAX_LINK_LABEL_LENGTH) {
      return href;
    }
    return `${href.slice(0, Math.max(1, MAX_LINK_LABEL_LENGTH - 3)).trimEnd()}...`;
  }
}

export function LinkifiedText({ content, className }: LinkifiedTextProps) {
  const { openLink } = useLinkGuard();
  const preferences = useAppPreferences();
  const tokens = parseMessageLinks(content);
  const hideInviteLinks = preferences.streamerMode.enabled && preferences.streamerMode.hideInviteLinks;

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (token.kind === "text") {
          return <Fragment key={`txt-${index}`}>{token.text}</Fragment>;
        }

        const inviteLink = /(?:discord\.gg|discord\.com\/invite|catwa\.chat\/invite)\//i.test(token.href);
        if (hideInviteLinks && inviteLink) {
          return (
            <span className="catwa-inline-link catwa-invite-link inline-flex max-w-full break-all rounded-[3px] text-slate-400" key={`lnk-hidden-${index}`}>
              [Davet bağlantısı gizlendi]
            </span>
          );
        }

        return (
          <a
            className={`catwa-inline-link inline-flex max-w-full items-center gap-1 break-all rounded-[3px] text-[var(--catwa-accent)] underline decoration-[var(--catwa-accent-strong)] decoration-1 underline-offset-2 transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--catwa-accent-ring)] ${
              inviteLink ? "catwa-invite-link" : ""
            }`}
            href={token.href}
            key={`lnk-${token.href}-${index}`}
            onAuxClick={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              event.preventDefault();
              void openLink({
                href: token.href,
                domain: token.domain,
                isInternal: token.isInternal,
                blocked: token.blocked
              });
            }}
            rel="noreferrer"
            target="_blank"
            title={token.href}
          >
            <span className="min-w-0 break-all">{formatLinkLabel(token.href)}</span>
            {!token.isInternal ? <ExternalLink className="h-3 w-3 shrink-0 opacity-80" /> : null}
          </a>
        );
      })}
    </span>
  );
}
