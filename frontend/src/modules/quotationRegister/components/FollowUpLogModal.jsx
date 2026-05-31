import { useState } from 'react'
import { Modal } from './Modal'
import { toISODate } from '../utils/dates'
import { Button } from './ui'

export function FollowUpLogModal({ clientLabel, onClose, onSubmit }) {
  const [date, setDate] = useState(toISODate())
  const [note, setNote] = useState('')

  return (
    <Modal title={`Log follow-up — ${clientLabel}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!note.trim()) return
          onSubmit({ date, note: note.trim() })
        }}
      >
        <label className="adt-label" style={{ marginTop: 0 }}>Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="adt-input"
          style={{ display: 'block', marginTop: 6, marginBottom: 14 }}
        />
        <label className="adt-label" style={{ marginTop: 0 }}>Notes</label>
        <textarea
          required
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="adt-textarea"
          style={{ display: 'block', marginTop: 6, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" tone="navy">Save entry</Button>
        </div>
      </form>
    </Modal>
  )
}
