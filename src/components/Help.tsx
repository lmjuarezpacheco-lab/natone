import { useEffect, useRef, useState } from "preact/hooks";

const WIDTH = 240;
const EDGE = 8;

/** A small "?" button. Its explanation shows on hover, on keyboard focus and on tap. */
export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Record<string, string>>({});
  const button = useRef<HTMLButtonElement>(null);

  const show = () => {
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(box.left + box.width / 2 - width / 2, EDGE), window.innerWidth - width - EDGE);
    // The bubble goes below the button, or above it when the button is in the lower half of the panel.
    const below = box.top < window.innerHeight / 2;
    setPosition({
      left: `${left}px`,
      width: `${width}px`,
      ...(below ? { top: `${box.bottom + 6}px` } : { bottom: `${window.innerHeight - box.top + 6}px` }),
    });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  // The bubble is placed once, so it closes when the panel scrolls or resizes under it.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open]);

  return (
    <span class="help">
      <button
        ref={button}
        type="button"
        class="help-button"
        aria-label={`Ayuda: ${text}`}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === "Escape" && hide()}
        onClick={(e) => {
          // Inside a label, a click must not also toggle the checkbox.
          e.preventDefault();
          e.stopPropagation();
          if (open) hide();
          else show();
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.9" fill="none" stroke="currentColor" stroke-width="1.3" />
          <path d="M6.1 6.4a1.95 1.95 0 1 1 3 1.65c-.7.45-1.1.8-1.1 1.55" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          <circle cx="8" cy="11.8" r="0.85" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <span class="help-bubble" style={position} aria-hidden="true">
          {text}
        </span>
      )}
    </span>
  );
}
