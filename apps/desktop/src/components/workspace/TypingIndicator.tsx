type TypingIndicatorProps = {
  text: string;
};

export function TypingIndicator({ text }: TypingIndicatorProps) {
  if (!text) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center gap-2 px-3 text-xs text-emerald-300">
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:240ms]" />
      </span>
      <span>{text}</span>
    </div>
  );
}

