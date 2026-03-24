import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type CatwaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 border font-medium transition duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "rounded-xl border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] text-[var(--catwa-text-main)] hover:bg-[var(--catwa-accent-strong)]",
  ghost:
    "rounded-xl border-[var(--catwa-border)] bg-slate-900/55 text-[var(--catwa-text-muted)] hover:border-[var(--catwa-accent-strong)] hover:text-[var(--catwa-text-main)]",
  danger: "rounded-xl border-rose-500/45 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm"
};

export function CatwaButton({ variant = "primary", size = "md", className = "", ...props }: CatwaButtonProps) {
  return <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`.trim()} {...props} />;
}

type CatwaInputProps = InputHTMLAttributes<HTMLInputElement>;

export function CatwaInput({ className = "", ...props }: CatwaInputProps) {
  return (
    <input
      className={`h-10 w-full rounded-xl border border-[var(--catwa-border)] bg-slate-950/65 px-3 text-sm text-[var(--catwa-text-main)] outline-none transition placeholder:text-[var(--catwa-text-soft)] focus:border-[var(--catwa-accent-ring)] ${className}`.trim()}
      {...props}
    />
  );
}

type CatwaCardProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
};

export function CatwaCard({ title, description, className = "", children, ...props }: CatwaCardProps) {
  return (
    <section
      className={`rounded-2xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_88%,black_12%)] p-4 shadow-[0_16px_34px_-24px_rgba(2,6,23,0.85)] ${className}`.trim()}
      {...props}
    >
      {title ? <h3 className="text-sm font-semibold text-[var(--catwa-text-main)]">{title}</h3> : null}
      {description ? <p className="mt-1 text-xs text-[var(--catwa-text-muted)]">{description}</p> : null}
      <div className={title || description ? "mt-3" : undefined}>{children}</div>
    </section>
  );
}

type CatwaBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "danger";
};

const BADGE_TONES: Record<NonNullable<CatwaBadgeProps["tone"]>, string> = {
  neutral: "border-[var(--catwa-border)] bg-slate-900/55 text-[var(--catwa-text-muted)]",
  accent: "border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] text-cyan-100",
  success: "border-emerald-500/45 bg-emerald-500/15 text-emerald-100",
  danger: "border-rose-500/45 bg-rose-500/15 text-rose-100"
};

export function CatwaBadge({ tone = "neutral", className = "", ...props }: CatwaBadgeProps) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${BADGE_TONES[tone]} ${className}`.trim()} {...props} />;
}

type CatwaAvatarProps = {
  src?: string;
  alt: string;
  fallback: ReactNode;
  className?: string;
};

export function CatwaAvatar({ src, alt, fallback, className = "" }: CatwaAvatarProps) {
  return (
    <span className={`inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-[var(--catwa-border)] bg-slate-900/70 text-xs font-semibold text-[var(--catwa-text-main)] ${className}`.trim()}>
      {src ? <img alt={alt} className="h-full w-full object-cover" src={src} /> : fallback}
    </span>
  );
}

type CatwaTabsProps = {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
};

export function CatwaTabs({ items, value, onChange }: CatwaTabsProps) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--catwa-border)] bg-slate-900/65 p-1">
      {items.map((item) => (
        <button
          className={`rounded-lg px-3 py-1.5 text-xs transition ${
            item.id === value
              ? "bg-[var(--catwa-accent-soft)] text-[var(--catwa-text-main)]"
              : "text-[var(--catwa-text-muted)] hover:text-[var(--catwa-text-main)]"
          }`}
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
