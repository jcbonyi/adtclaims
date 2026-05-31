import { useEffect } from "react";

export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="adt-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="adt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adt-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adt-modal-header">
          <h2 id="adt-modal-title" className="adt-modal-title">
            {title}
          </h2>
        </div>
        <div className="adt-modal-body">{children}</div>
        {footer ? <div className="adt-modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
