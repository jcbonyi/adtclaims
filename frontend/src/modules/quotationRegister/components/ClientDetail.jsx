import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { quotationPath } from '../basePath'
import { THEME } from '../constants'
import { useQuotations } from '../context/useQuotations'
import { useUi } from '../context/uiContext'
import { daysBetween, daysOpen, formatDisplayDate } from '../utils/dates'
import { StatusBadge } from './StatusBadge'
import { QuotationFormModal } from './QuotationFormModal'
import { FollowUpLogModal } from './FollowUpLogModal'
import { Button, Card, CardTitle, PageHeader, EmptyState } from './ui'

function Field({ label, value }) {
  return (
    <div className="adt-field">
      <div className="adt-field-label">{label}</div>
      <div className="adt-field-value">{value ?? '—'}</div>
    </div>
  )
}

export function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { state, dispatch } = useQuotations()
  const { notify } = useUi()
  const [editOpen, setEditOpen] = useState(false)
  const [followOpen, setFollowOpen] = useState(false)
  const q = state.quotations.find((x) => x.id === Number(id))
  const backPath = location.state?.from || quotationPath('register')

  if (!q) {
    return (
      <>
        <EmptyState>Record not found.</EmptyState>
        <Button onClick={() => navigate(backPath)} style={{ marginTop: 12 }}>← Back</Button>
      </>
    )
  }

  const timeline = [
    { label: 'Date received (client)', date: q.dateReceived },
    { label: 'Sent to insurer', date: q.dateSentToInsurer },
    { label: 'Received back from insurer', date: q.dateReceivedFromInsurer },
    { label: 'Current status', date: null, extra: q.status },
  ]

  return (
    <>
      <PageHeader title="Client Detail" subtitle="Quotation overview, timeline, and follow-up history." />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, var(--adt-blue-light) 0%, var(--adt-green-light) 100%)',
          borderRadius: 'var(--adt-radius)',
          border: '1px solid var(--adt-border)',
        }}
      >
        <Button onClick={() => navigate(backPath)}>← Back</Button>
        <h2 style={{ margin: 0, flex: 1, fontSize: 22, color: THEME.brandBlueDark, letterSpacing: '-0.02em' }}>
          {q.clientName}
        </h2>
        <Button tone="accent" onClick={() => setFollowOpen(true)}>Log follow-up</Button>
        {q.policyNumber ? (
          <Button
            tone="navy"
            onClick={() => navigate(`/valuations/valuation/new?fromQuotation=${q.id}`)}
          >
            Create Valuation
          </Button>
        ) : null}
        <Button tone="primary" onClick={() => setEditOpen(true)}>Edit</Button>
      </div>

      <div className="adt-detail-grid">
        <Card style={{ padding: '8px 20px 20px' }} hover>
          <CardTitle>Quotation details</CardTitle>
          <Field label="Cover type" value={q.coverType} />
          <Field label="Contact person" value={q.contactPerson} />
          <Field label="Source agent" value={q.sourceAgent} />
          <Field label="Insurer" value={q.insurer} />
          <Field label="Policy number" value={q.policyNumber || '—'} />
          <Field label="Premium" value={q.premium != null ? q.premium : '—'} />
          <Field label="Sum insured" value={q.sumInsured != null ? q.sumInsured : '—'} />
          <Field label="Renewal date" value={formatDisplayDate(q.renewalDate)} />
          <Field label="Status" value={<StatusBadge status={q.status} />} />
          <Field label="Days open" value={`${daysOpen(q.dateReceived)} days`} />
          <Field label="Notes" value={q.notes || '—'} />
          {q.lastFollowUp && <Field label="Last follow-up" value={formatDisplayDate(q.lastFollowUp)} />}
        </Card>

        <Card style={{ padding: 20 }} hover>
          <CardTitle>Timeline</CardTitle>
          <ol style={{ margin: 0, paddingLeft: 18, color: THEME.text }}>
            {timeline.map((step, i) => (
              <li key={i} style={{ marginBottom: 16, fontSize: 14 }}>
                <div style={{ fontWeight: 700, color: THEME.brandBlueDark }}>{step.label}</div>
                {step.extra != null ? (
                  <div style={{ marginTop: 6 }}>
                    <StatusBadge status={step.extra} />
                  </div>
                ) : (
                  <div style={{ marginTop: 4, color: THEME.textMuted }}>{formatDisplayDate(step.date)}</div>
                )}
              </li>
            ))}
          </ol>
          <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 8, padding: '10px 12px', background: THEME.pageBg, borderRadius: 8 }}>
            Turnaround: client → insurer{' '}
            {q.dateSentToInsurer
              ? `${daysBetween(q.dateReceived, q.dateSentToInsurer) ?? '—'} days`
              : '—'}
            {' · '}insurer cycle{' '}
            {q.dateSentToInsurer && q.dateReceivedFromInsurer
              ? `${daysBetween(q.dateSentToInsurer, q.dateReceivedFromInsurer) ?? '—'} days`
              : '—'}
          </div>
        </Card>
      </div>

      <Card style={{ padding: 20 }} hover>
        <CardTitle>Follow-up log</CardTitle>
        {q.followUpHistory.length === 0 ? (
          <EmptyState>No follow-up entries recorded.</EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[...q.followUpHistory].reverse().map((e, i) => (
              <li key={`${e.date}-${i}`} className="adt-list-item">
                <div>
                  <div style={{ fontWeight: 800, color: THEME.brandBlueDark }}>{formatDisplayDate(e.date)}</div>
                  <div style={{ marginTop: 6, fontSize: 14 }}>{e.note}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card style={{ padding: 20 }} hover>
        <CardTitle>Status history</CardTitle>
        {!q.statusHistory?.length ? (
          <EmptyState>No status transitions recorded yet.</EmptyState>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {[...q.statusHistory].reverse().map((s, idx) => (
              <li key={`${s.date}-${s.status}-${idx}`} style={{ marginBottom: 8, fontSize: 14 }}>
                <strong>{formatDisplayDate(s.date)}</strong> — {s.status}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editOpen && (
        <QuotationFormModal
          key={q.id}
          onClose={() => setEditOpen(false)}
          initial={q}
          title="Edit quotation"
          onSave={async (payload) => {
            try {
              await dispatch({ type: 'UPDATE', payload: { id: q.id, patch: payload } })
              notify('Quotation updated.')
              setEditOpen(false)
            } catch {
              notify('Could not update quotation. Please try again.')
            }
          }}
        />
      )}

      {followOpen && (
        <FollowUpLogModal
          clientLabel={q.clientName}
          onClose={() => setFollowOpen(false)}
          onSubmit={async ({ date, note }) => {
            try {
              await dispatch({
                type: 'LOG_FOLLOW_UP',
                payload: { id: q.id, date, note },
              })
              notify('Follow-up entry saved.')
              setFollowOpen(false)
            } catch {
              notify('Could not save follow-up. Please try again.')
            }
          }}
        />
      )}
    </>
  )
}
