import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-handle" />
        <header className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="閉じる"><X /></button></header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
