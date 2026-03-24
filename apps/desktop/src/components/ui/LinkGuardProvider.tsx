import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { navigateInternalUrl, openExternalUrl, type InternalNavigateFn } from "../../lib/linkNavigation";
import { classifyLink } from "../../lib/linkUtils";
import {
  clearTrustedExternalDomains,
  getTrustedExternalDomains,
  isTrustedExternalDomain,
  trustExternalDomain
} from "../../lib/linkTrustStore";
import { toastError, toastInfo, toastWarning } from "../../store/toastStore";
import { ExternalLinkWarningModal } from "./ExternalLinkWarningModal";

type LinkGuardInput = {
  href: string;
  domain?: string;
  isInternal?: boolean;
  blocked?: boolean;
};

type LinkGuardContextValue = {
  openLink: (input: LinkGuardInput) => Promise<void>;
  openRawLink: (raw: string) => Promise<void>;
  clearTrustedDomains: () => void;
  trustedDomainsCount: number;
};

type PendingExternalLink = {
  href: string;
  domain: string;
};

const LinkGuardContext = createContext<LinkGuardContextValue | null>(null);

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

function isFirstPartyDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return false;
  }

  return (
    normalized === "catwa.chat" ||
    normalized === "www.catwa.chat" ||
    normalized.endsWith(".catwa.chat") ||
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

type LinkGuardProviderProps = {
  children: ReactNode;
  navigateInternal?: InternalNavigateFn;
};

export function LinkGuardProvider({ children, navigateInternal }: LinkGuardProviderProps) {
  const [pendingLink, setPendingLink] = useState<PendingExternalLink | null>(null);
  const [trustDomain, setTrustDomain] = useState(false);
  const [trustedDomainsVersion, setTrustedDomainsVersion] = useState(0);

  const trustedDomainsCount = useMemo(() => getTrustedExternalDomains().length, [trustedDomainsVersion]);

  const closeModal = useCallback(() => {
    setPendingLink(null);
    setTrustDomain(false);
  }, []);

  const openResolvedLink = useCallback(
    async (resolved: Required<LinkGuardInput>) => {
      if (resolved.blocked) {
        toastWarning("Bağlantı engellendi", "Güvenli olmayan bağlantı şeması desteklenmiyor.", "link-blocked-scheme");
        return;
      }

      if (resolved.isInternal) {
        navigateInternalUrl(resolved.href, navigateInternal);
        return;
      }

      if (isFirstPartyDomain(resolved.domain)) {
        const opened = await openExternalUrl(resolved.href);
        if (!opened) {
          toastError("Bağlantı açılamadı", "Bağlantı varsayılan tarayıcıda açılamadı.", "link-open-failed-first-party");
        }
        return;
      }

      if (isTrustedExternalDomain(resolved.domain)) {
        const opened = await openExternalUrl(resolved.href);
        if (!opened) {
          toastError("Bağlantı açılamadı", "Harici bağlantı varsayılan tarayıcıda açılamadı.", "link-open-failed");
        }
        return;
      }

      setPendingLink({ href: resolved.href, domain: resolved.domain });
      setTrustDomain(false);
    },
    [navigateInternal]
  );

  const openLink = useCallback(
    async (input: LinkGuardInput) => {
      const fallback = classifyLink(input.href);

      const resolved: Required<LinkGuardInput> = {
        href: input.href,
        domain: input.domain ?? fallback?.domain ?? "",
        isInternal: input.isInternal ?? fallback?.isInternal ?? false,
        blocked: input.blocked ?? fallback?.blocked ?? true
      };

      if (!resolved.domain) {
        toastWarning("Geçersiz bağlantı", "Bu bağlantı güvenli biçimde çözümlenemedi.", "link-invalid");
        return;
      }

      await openResolvedLink(resolved);
    },
    [openResolvedLink]
  );

  const openRawLink = useCallback(
    async (raw: string) => {
      const resolved = classifyLink(raw);
      if (!resolved) {
        toastWarning("Geçersiz bağlantı", "Bağlantı biçimi desteklenmiyor veya güvenli değil.", "link-invalid-raw");
        return;
      }

      await openResolvedLink({
        href: resolved.href,
        domain: resolved.domain,
        isInternal: resolved.isInternal,
        blocked: resolved.blocked
      });
    },
    [openResolvedLink]
  );

  const confirmExternal = useCallback(async () => {
    if (!pendingLink) {
      return;
    }

    const target = pendingLink;
    closeModal();

    if (trustDomain) {
      trustExternalDomain(target.domain);
      setTrustedDomainsVersion((current) => current + 1);
      toastInfo("Domain güvenildi", `${target.domain} için uyarı kapatıldı.`, `trusted-domain-${target.domain}`);
    }

    const opened = await openExternalUrl(target.href);
    if (!opened) {
      toastError("Bağlantı açılamadı", "Harici bağlantı varsayılan tarayıcıda açılamadı.", "link-open-failed-confirm");
    }
  }, [closeModal, pendingLink, trustDomain]);

  const clearTrustedDomains = useCallback(() => {
    clearTrustedExternalDomains();
    setTrustedDomainsVersion((current) => current + 1);
  }, []);

  const value = useMemo<LinkGuardContextValue>(
    () => ({
      openLink,
      openRawLink,
      clearTrustedDomains,
      trustedDomainsCount
    }),
    [clearTrustedDomains, openLink, openRawLink, trustedDomainsCount]
  );

  return (
    <LinkGuardContext.Provider value={value}>
      {children}
      <ExternalLinkWarningModal
        domain={pendingLink?.domain ?? ""}
        href={pendingLink?.href ?? ""}
        onClose={closeModal}
        onConfirm={() => {
          void confirmExternal();
        }}
        onTrustForDomainChange={setTrustDomain}
        open={Boolean(pendingLink)}
        trustForDomain={trustDomain}
      />
    </LinkGuardContext.Provider>
  );
}

export function useLinkGuard(): LinkGuardContextValue {
  const context = useContext(LinkGuardContext);
  if (!context) {
    throw new Error("useLinkGuard must be used inside LinkGuardProvider");
  }
  return context;
}
