import { ArrowRight, Download, Gamepad2, Shield, Sparkles, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import appLogo from "../assets/app-logo.png";
import { useChatStore } from "../store/chatStore";

type WebLandingProps = {
  appName: string;
  downloadUrl: string;
  windowsSupport: string;
};

const NAV_ITEMS = ["Topluluk", "Güvenlik", "Blog", "Kariyer"];

export function WebLanding({ appName, downloadUrl, windowsSupport }: WebLandingProps) {
  const appStatus = useChatStore((state) => state.appStatus);
  const navigate = useNavigate();
  const targetHref = appStatus === "authenticated" ? "/channels/@me" : "/login";
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState(downloadUrl);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    let downloadOrigin = window.location.origin;

    try {
      downloadOrigin = new URL(downloadUrl, window.location.origin).origin;
    } catch {
      // Keep same-origin fallback.
    }

    const resolveLatestDownloadUrl = async () => {
      try {
        const response = await fetch("/updates/stable/latest.yml", {
          cache: "no-store",
          signal: controller.signal
        });
        if (!response.ok) {
          return;
        }

        const latestYml = await response.text();
        const pathMatch = latestYml.match(/^path:\s*(.+)\s*$/m);
        if (!pathMatch) {
          return;
        }

        const fileName = pathMatch[1].trim().replace(/^['"]|['"]$/g, "");
        if (!fileName) {
          return;
        }

        const encodedFileName = encodeURIComponent(fileName).replace(/%2F/g, "/");
        const absoluteUrl = `${downloadOrigin}/updates/stable/${encodedFileName}`;
        if (isActive) {
          setResolvedDownloadUrl(absoluteUrl);
        }
      } catch {
        // Keep fallback downloadUrl.
      }
    };

    void resolveLatestDownloadUrl();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [downloadUrl]);

  return (
    <main className="min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-slate-950 text-slate-100">
      <div
        className="min-h-[100dvh]"
        style={{
          background:
            "radial-gradient(900px 420px at 78% 20%, rgba(56, 104, 255, 0.34), transparent 62%), radial-gradient(820px 520px at 12% 0%, rgba(7, 182, 212, 0.24), transparent 58%), linear-gradient(180deg, #070d1f 0%, #111b5e 52%, #131f6f 100%)"
        }}
      >
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-7">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-slate-900/80">
              <img alt={`${appName} logo`} className="h-7 w-7 object-contain" src={appLogo} />
            </div>
            <span className="text-xl font-black tracking-tight sm:text-2xl">{appName}</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-slate-200/90 lg:flex">
            {NAV_ITEMS.map((item) => (
              <a className="transition hover:text-white" href="#" key={item}>
                {item}
              </a>
            ))}
          </nav>

          <button
            className="rounded-xl border border-white/25 bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-900 transition hover:bg-white sm:px-5 sm:text-sm"
            onClick={() => navigate(targetHref)}
            type="button"
          >
            Tarayıcıda aç
          </button>
        </header>

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-12 pt-4 sm:gap-10 sm:px-6 sm:pt-8 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div className="space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-cyan-100">
              <Sparkles className="h-3.5 w-3.5" />
              Gerçek zamanlı iletişim
            </p>

            <h1 className="max-w-xl text-3xl font-black leading-[1.06] tracking-tight text-white sm:text-5xl sm:leading-[1.03] lg:text-7xl">
              SOHBETİ WEB VE
              <br />
              MASAÜSTÜNDE
              <br />
              DEVAM ETTİR
            </h1>

            <p className="max-w-xl text-base leading-7 text-slate-200/90 sm:text-lg sm:leading-8">
              Arkadaşlarınla DM konuş, sunucu aç, yazılı ve sesli kanalları kullan. Web ve masaüstünde aynı hesabınla
              kaldığın yerden devam edebilirsin.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100 sm:w-auto"
                download
                href={resolvedDownloadUrl}
              >
                <Download className="h-4 w-4" />
                İndir
              </a>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20 sm:w-auto"
                onClick={() => navigate(targetHref)}
                type="button"
              >
                Tarayıcıda aç
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">{windowsSupport}</p>

            <div className="grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              <FeatureBadge icon={UsersRound} label="Arkadaş ve DM" />
              <FeatureBadge icon={Gamepad2} label="Ses kanalları" />
              <FeatureBadge icon={Shield} label="Güvenli oturum" />
            </div>
          </div>

          <div className="relative h-[320px] min-h-[320px] sm:h-[420px] sm:min-h-[380px] lg:h-[460px] lg:min-h-[420px]">
            <div className="absolute inset-0 rounded-[36px] border border-white/15 bg-slate-900/25 backdrop-blur-sm" />
            <div className="absolute -left-3 top-5 hidden h-40 w-32 rounded-3xl border border-white/15 bg-slate-900/45 shadow-2xl sm:block lg:-left-8 lg:top-8 lg:h-52 lg:w-44" />
            <div className="absolute right-3 top-8 hidden h-32 w-24 rounded-3xl border border-white/15 bg-slate-900/45 shadow-2xl sm:block lg:right-8 lg:top-14 lg:h-40 lg:w-32" />
            <div className="absolute left-4 right-4 top-12 rounded-[24px] border border-white/20 bg-slate-950/65 p-4 shadow-2xl sm:left-10 sm:right-10 sm:top-16 sm:rounded-[28px] sm:p-5 lg:left-14 lg:right-16 lg:top-20 lg:rounded-[32px]">
              <div className="mb-4 flex items-center gap-3">
                <img alt={`${appName} logo`} className="h-9 w-9 rounded-xl border border-cyan-300/30 bg-slate-900/90 p-1" src={appLogo} />
                <div>
                  <p className="text-sm font-semibold"># genel-sohbet</p>
                  <p className="text-xs text-slate-400">25 kişi çevrimiçi</p>
                </div>
              </div>
              <div className="space-y-3">
                <MockMessage name="Aziz" text="Akşam test için ses kanalına gelin." />
                <MockMessage name="Ece" text="Tamam, linki DM'den attım." />
                <MockMessage name="Mert" text="Yeni sunucu ayarları baya iyi olmuş." />
              </div>
            </div>
            <div className="absolute bottom-4 right-4 rounded-2xl border border-cyan-300/25 bg-cyan-400/20 px-3 py-2 text-xs font-semibold text-cyan-100 sm:bottom-7 sm:right-8 sm:px-4 sm:py-3 sm:text-sm lg:bottom-9 lg:right-10">
              Web + masaüstü senkron
            </div>
          </div>
        </section>
      </div>
      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-300/85 sm:px-6">
        <p>{appName} • {new Date().getFullYear()}</p>
        <Link className="rounded-lg border border-white/20 px-3 py-1.5 transition hover:bg-white/10" to={targetHref}>
          Uygulamayı aç
        </Link>
      </footer>
    </main>
  );
}

type FeatureBadgeProps = {
  icon: typeof UsersRound;
  label: string;
};

function FeatureBadge({ icon: Icon, label }: FeatureBadgeProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm">
      <Icon className="h-4 w-4 text-cyan-200" />
      <span>{label}</span>
    </div>
  );
}

type MockMessageProps = {
  name: string;
  text: string;
};

function MockMessage({ name, text }: MockMessageProps) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/85 px-3 py-2.5">
      <p className="text-xs font-semibold text-cyan-200">{name}</p>
      <p className="mt-0.5 text-sm text-slate-200">{text}</p>
    </div>
  );
}
