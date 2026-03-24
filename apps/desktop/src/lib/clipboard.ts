function fallbackCopy(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);

  const previousSelection = document.getSelection();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  }

  document.body.removeChild(textarea);
  if (previousSelection) {
    previousSelection.removeAllRanges();
  }
  return success;
}

export async function copyText(value: string): Promise<boolean> {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(normalized);
      return true;
    } catch {
      // fallback below
    }
  }

  return fallbackCopy(normalized);
}

