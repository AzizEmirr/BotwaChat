import { MessageCircle } from "lucide-react";
import appLogo from "../../assets/app-logo.png";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  withRing?: boolean;
};

const sizeMap: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12"
};

export function BrandMark({ size = "md", withRing = true }: BrandMarkProps) {
  return (
    <div
      className={`inline-flex items-center justify-center overflow-hidden rounded-xl border border-cyan-400/35 bg-cyan-500/10 ${sizeMap[size]} ${
        withRing ? "ring-1 ring-cyan-300/40" : ""
      }`}
    >
      <img alt="Catwa" className="h-[78%] w-[78%] object-contain" src={appLogo} />
      <MessageCircle className="hidden h-4 w-4 text-cyan-200" />
    </div>
  );
}
