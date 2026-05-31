import { useEffect, useId, useRef } from 'react'

export function Modal({ title, children, onClose, wide }) {
  const titleId = useId()
  const dialogRef = useRef(null)

  useEffect(() => {
    const node = dialogRef.current
    if (!node) return undefined
    const previous = document.activeElement
    node.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusables = node.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const list = [...focusables].filter((el) => !el.hasAttribute('disabled'))
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      if (previous && previous.focus) previous.focus()
    }
  }, [onClose])

  return (
    <div
      role="presentation"
      className="adt-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-labelledby={titleId}
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
        className={`adt-modal ${wide ? 'adt-modal--wide' : 'adt-modal--default'}`}
        style={{ position: 'relative' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="adt-modal-header"
          style={{
            position: 'relative',
            paddingTop: 19,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, var(--adt-blue), var(--adt-green))',
              borderRadius: '12px 12px 0 0',
            }}
          />
          <h2 id={titleId} className="adt-modal-title">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="adt-modal-close">
            ×
          </button>
        </div>
        <div className="adt-modal-body">{children}</div>
      </div>
    </div>
  )
}
