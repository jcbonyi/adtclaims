import { useMemo, useState } from 'react'
import { FOLLOW_UP_STATUSES, THEME } from '../constants'
import { useQuotations } from '../context/useQuotations'
import { useUi } from '../context/uiContext'
import { daysOpen, formatDisplayDate } from '../utils/dates'
import { StatusBadge } from './StatusBadge'
import { FollowUpLogModal } from './FollowUpLogModal'
import { Button, Card, PageHeader, LinkButton, EmptyState } from './ui'

export function FollowUpView({ onOpenClient }) {
  const { state, dispatch } = useQuotations()
  const { notify } = useUi()
  const [openAcc, setOpenAcc] = useState(() => new Set())
  const [logFor, setLogFor] = useState(null)

  const rows = useMemo(() => {
    return state.quotations
      .filter((q) => FOLLOW_UP_STATUSES.has(q.status))
      .sort((a, b) => daysOpen(b.dateReceived) - daysOpen(a.dateReceived))
  }, [state.quotations])

  const toggleAcc = (id) => {
    setOpenAcc((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <PageHeader title="Follow-Up Queue" subtitle="Active follow-up work sorted by longest open first." />
      <p style={{ margin: 0, color: THEME.textMuted, maxWidth: 720, fontSize: 14 }}>
        Quotations in <strong>Client to advise</strong>, <strong>On hold</strong>, or <strong>Pending</strong>,
        sorted by longest open first.
      </p>

      {rows.length === 0 && (
        <EmptyState>No quotations currently match this follow-up queue.</EmptyState>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((q) => (
          <Card key={q.id} className="adt-follow-card" hover>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <LinkButton onClick={() => onOpenClient(q.id)} style={{ fontSize: 17 }}>
                  {q.clientName}
                </LinkButton>
                <div style={{ fontSize: 13, color: THEME.textMuted, marginTop: 6 }}>
                  {q.coverType} · {q.insurer} · Received {formatDisplayDate(q.dateReceived)}
                </div>
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <StatusBadge status={q.status} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: THEME.brandGreen }}>
                    {daysOpen(q.dateReceived)} days open
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Button tone="accent" onClick={() => setLogFor(q)}>Log follow-up</Button>
                <Button onClick={() => onOpenClient(q.id)}>View record</Button>
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: `1px solid ${THEME.border}`, paddingTop: 12 }}>
              <button
                type="button"
                onClick={() => toggleAcc(q.id)}
                aria-expanded={openAcc.has(q.id)}
                className="adt-accordion-btn"
              >
                {openAcc.has(q.id) ? '▼' : '▶'} Follow-up history ({q.followUpHistory.length})
              </button>
              {openAcc.has(q.id) && (
                <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
                  {q.followUpHistory.length === 0 ? (
                    <li style={{ color: THEME.textMuted, fontSize: 14 }}>No entries yet.</li>
                  ) : (
                    [...q.followUpHistory]
                      .reverse()
                      .map((e, i) => (
                        <li key={`${e.date}-${i}`} className="adt-list-item" style={{ padding: '10px 0' }}>
                          <div>
                            <strong>{formatDisplayDate(e.date)}</strong>
                            <div style={{ marginTop: 4 }}>{e.note}</div>
                          </div>
                        </li>
                      ))
                  )}
                </ul>
              )}
            </div>
          </Card>
        ))}
      </div>

      {logFor && (
        <FollowUpLogModal
          clientLabel={logFor.clientName}
          onClose={() => setLogFor(null)}
          onSubmit={async ({ date, note }) => {
            try {
              await dispatch({
                type: 'LOG_FOLLOW_UP',
                payload: { id: logFor.id, date, note },
              })
              notify('Follow-up entry saved.')
              setLogFor(null)
            } catch {
              notify('Could not save follow-up. Please try again.')
            }
          }}
        />
      )}
    </>
  )
}
