import { useRef, useState } from "preact/hooks";

interface Props {
  label: string;
  value: number | null;
  min: number;
  max: number;
  /** Shows a "+" before positive numbers. */
  signed?: boolean;
  /** Clearing the field commits null. Without it, an empty field restores the old value. */
  allowEmpty?: boolean;
  placeholder?: string;
  onCommit: (value: number | null) => void;
}

/** Number input that commits on blur or Enter, so the list does not reorder while typing. */
export function NumField({ label, value, min, max, signed, allowEmpty, placeholder, onCommit }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : signed && value >= 0 ? `+${value}` : String(value));

  const cancelled = useRef(false);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === "") {
      if (allowEmpty && value !== null) onCommit(null);
      return;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <input
      class="num"
      type="text"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={shown}
      onFocus={(e) => e.currentTarget.select()}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Blur runs before the next render, so the draft must be discarded through a flag.
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
