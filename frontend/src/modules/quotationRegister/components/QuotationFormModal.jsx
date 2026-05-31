import { useState } from 'react'
import { Modal } from './Modal'
import { STATUS_OPTIONS } from '../constants'
import { Button } from './ui'

const emptyForm = {
  clientName: '',
  coverType: '',
  contactPerson: '',
  sourceAgent: '',
  dateReceived: '',
  dateSentToInsurer: '',
  insurer: '',
  dateReceivedFromInsurer: '',
  status: 'Pending',
  policyNumber: '',
  premium: '',
  sumInsured: '',
  renewalDate: '',
  notes: '',
  lastFollowUp: '',
}

function buildFormFromInitial(initial) {
  if (!initial) return { ...emptyForm }
  return {
    ...emptyForm,
    clientName: initial.clientName ?? '',
    coverType: initial.coverType ?? '',
    contactPerson: initial.contactPerson ?? '',
    sourceAgent: initial.sourceAgent ?? '',
    dateReceived: initial.dateReceived ?? '',
    dateSentToInsurer: initial.dateSentToInsurer ?? '',
    insurer: initial.insurer ?? '',
    dateReceivedFromInsurer: initial.dateReceivedFromInsurer ?? '',
    status: initial.status ?? 'Pending',
    policyNumber: initial.policyNumber ?? '',
    premium: initial.premium ?? '',
    sumInsured: initial.sumInsured ?? '',
    renewalDate: initial.renewalDate ?? '',
    notes: initial.notes ?? '',
    lastFollowUp: initial.lastFollowUp ?? '',
  }
}

function asMoney(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function QuotationFormModal({ onClose, initial, onSave, title }) {
  const [form, setForm] = useState(() => buildFormFromInitial(initial))
  const [error, setError] = useState('')

  const update = (key) => (e) => {
    const v = e.target.value
    setForm((f) => ({ ...f, [key]: v }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (form.dateSentToInsurer && form.dateSentToInsurer < form.dateReceived) {
      setError('Date sent to insurer cannot be before date received.')
      return
    }
    if (
      form.dateReceivedFromInsurer &&
      form.dateSentToInsurer &&
      form.dateReceivedFromInsurer < form.dateSentToInsurer
    ) {
      setError('Date received from insurer cannot be before date sent to insurer.')
      return
    }
    if (form.renewalDate && form.dateReceived && form.renewalDate < form.dateReceived) {
      setError('Renewal date should be after date received.')
      return
    }
    setError('')
    onSave({
      clientName: form.clientName.trim(),
      coverType: form.coverType.trim(),
      contactPerson: form.contactPerson.trim(),
      sourceAgent: form.sourceAgent.trim(),
      dateReceived: form.dateReceived || null,
      dateSentToInsurer: form.dateSentToInsurer || null,
      insurer: form.insurer.trim(),
      dateReceivedFromInsurer: form.dateReceivedFromInsurer || null,
      status: form.status,
      policyNumber: form.policyNumber.trim(),
      premium: asMoney(form.premium),
      sumInsured: asMoney(form.sumInsured),
      renewalDate: form.renewalDate || null,
      notes: form.notes,
      lastFollowUp: form.lastFollowUp || null,
    })
    onClose()
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="adt-label">Client name</label>
            <input required className="adt-input" style={{ marginTop: 4 }} value={form.clientName} onChange={update('clientName')} />
          </div>
          <div>
            <label className="adt-label">Cover type</label>
            <input required className="adt-input" style={{ marginTop: 4 }} value={form.coverType} onChange={update('coverType')} />
          </div>
          <div>
            <label className="adt-label">Status</label>
            <select className="adt-select" style={{ marginTop: 4, width: '100%' }} value={form.status} onChange={update('status')}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="adt-label">Contact person</label>
            <input required className="adt-input" style={{ marginTop: 4 }} value={form.contactPerson} onChange={update('contactPerson')} />
          </div>
          <div>
            <label className="adt-label">Source agent</label>
            <input required className="adt-input" style={{ marginTop: 4 }} value={form.sourceAgent} onChange={update('sourceAgent')} />
          </div>
          <div>
            <label className="adt-label">Date received</label>
            <input type="date" required className="adt-input" style={{ marginTop: 4 }} value={form.dateReceived} onChange={update('dateReceived')} />
          </div>
          <div>
            <label className="adt-label">Date sent to insurer</label>
            <input type="date" className="adt-input" style={{ marginTop: 4 }} value={form.dateSentToInsurer} onChange={update('dateSentToInsurer')} />
          </div>
          <div>
            <label className="adt-label">Insurer</label>
            <input required className="adt-input" style={{ marginTop: 4 }} value={form.insurer} onChange={update('insurer')} />
          </div>
          <div>
            <label className="adt-label">Date received from insurer</label>
            <input type="date" className="adt-input" style={{ marginTop: 4 }} value={form.dateReceivedFromInsurer} onChange={update('dateReceivedFromInsurer')} />
          </div>
          <div>
            <label className="adt-label">Policy number</label>
            <input className="adt-input" style={{ marginTop: 4 }} value={form.policyNumber} onChange={update('policyNumber')} />
          </div>
          <div>
            <label className="adt-label">Renewal date</label>
            <input type="date" className="adt-input" style={{ marginTop: 4 }} value={form.renewalDate} onChange={update('renewalDate')} />
          </div>
          <div>
            <label className="adt-label">Premium</label>
            <input type="number" min="0" step="0.01" className="adt-input" style={{ marginTop: 4 }} value={form.premium} onChange={update('premium')} />
          </div>
          <div>
            <label className="adt-label">Sum insured</label>
            <input type="number" min="0" step="0.01" className="adt-input" style={{ marginTop: 4 }} value={form.sumInsured} onChange={update('sumInsured')} />
          </div>
          <div>
            <label className="adt-label">Last follow-up</label>
            <input type="date" className="adt-input" style={{ marginTop: 4 }} value={form.lastFollowUp} onChange={update('lastFollowUp')} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="adt-label">Notes</label>
            <textarea rows={3} className="adt-textarea" style={{ marginTop: 4, resize: 'vertical' }} value={form.notes} onChange={update('notes')} />
          </div>
        </div>
        {error ? <div className="adt-form-error">{error}</div> : null}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" tone="accent">Save</Button>
        </div>
      </form>
    </Modal>
  )
}
