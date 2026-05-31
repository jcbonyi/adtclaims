import { useMemo } from 'react'
import { ATTENTION_SLA_DAYS, THEME, isPlacedStatus, STATUS_BADGE_STYLES } from '../constants'
import { useQuotations } from '../context/useQuotations'
import { daysOpen, formatDisplayDate, getToday, toISODate } from '../utils/dates'
import {
  DonutChart,
  HorizontalBarChart,
} from './charts/SimpleCharts'
import { Card, CardTitle, Button, PageHeader, KpiCard, KpiRow, LinkButton, EmptyState } from './ui'

export function Dashboard({ onOpenClient }) {
  const { state } = useQuotations()
  const { quotations } = state

  const metrics = useMemo(() => {
    const total = quotations.length
    const awaiting = quotations.filter(
      (q) => q.status === 'Client to advise' || q.status === 'Pending'
    ).length
    const placed = quotations.filter((q) => isPlacedStatus(q.status)).length
    const holdDeclined = quotations.filter(
      (q) => q.status === 'On hold' || q.status === 'Declined'
    ).length
    const conversion = total ? Math.round((placed / total) * 1000) / 10 : 0
    return { total, awaiting, placed, holdDeclined, conversion }
  }, [quotations])

  const byCover = useMemo(() => {
    const map = new Map()
    for (const q of quotations) {
      map.set(q.coverType, (map.get(q.coverType) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }, [quotations])

  const byStatus = useMemo(() => {
    const map = new Map()
    for (const q of quotations) {
      map.set(q.status, (map.get(q.status) ?? 0) + 1)
    }
    return [...map.entries()].map(([label, value]) => ({
      label,
      value,
      color: STATUS_BADGE_STYLES[label]?.border ?? '#94A3B8',
    }))
  }, [quotations])

  const topInsurers = useMemo(() => {
    const map = new Map()
    for (const q of quotations) {
      const key = q.insurer?.trim() || '—'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [quotations])

  const needsAttention = useMemo(() => {
    return quotations
      .filter((q) => q.status === 'Client to advise')
      .filter((q) => daysOpen(q.dateReceived) > ATTENTION_SLA_DAYS)
      .sort((a, b) => daysOpen(b.dateReceived) - daysOpen(a.dateReceived))
  }, [quotations])

  const renewalAlerts = useMemo(() => {
    const today = getToday()
    return quotations
      .filter((q) => q.renewalDate)
      .map((q) => {
        const due = new Date(`${q.renewalDate}T12:00:00`)
        const inDays = Math.floor((due.getTime() - today.getTime()) / 86400000)
        return { q, inDays }
      })
      .filter((x) => x.inDays >= 0 && x.inDays <= 45)
      .sort((a, b) => a.inDays - b.inDays)
      .slice(0, 6)
  }, [quotations])

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Pipeline health, conversion, and cases requiring action." />

      <KpiRow>
        <KpiCard label="Total quotes" value={metrics.total} accent={THEME.brandBlue} />
        <KpiCard label="Awaiting decision" value={metrics.awaiting} sub="Client to advise + Pending" accent="#F59E0B" />
        <KpiCard label="Cover placed" value={metrics.placed} accent={THEME.brandGreen} />
        <KpiCard label="On hold / Declined" value={metrics.holdDeclined} accent="#94A3B8" />
      </KpiRow>

      <Card className="adt-stat-highlight">
        <CardTitle>Conversion rate</CardTitle>
        <div className="adt-stat-highlight-value">{metrics.conversion}%</div>
        <div style={{ fontSize: 13, color: THEME.textMuted, marginTop: 8 }}>
          Placed quotes ÷ total quotes (placed includes NCBA placements)
        </div>
      </Card>

      <div className="adt-grid-2">
        <Card style={{ padding: 20 }} hover>
          <CardTitle>Quotations by cover type</CardTitle>
          <HorizontalBarChart items={byCover} labelKey="label" valueKey="value" barColor={THEME.brandBlue} />
        </Card>
        <Card style={{ padding: 20 }} hover>
          <CardTitle>Status distribution</CardTitle>
          <DonutChart segments={byStatus} size={180} />
        </Card>
      </div>

      <div className="adt-grid-2-wide">
        <Card style={{ padding: 20 }} hover>
          <CardTitle>Top insurers by volume</CardTitle>
          <div className="adt-table-wrap">
            <table className="adt-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th scope="col" className="adt-th-static">#</th>
                  <th scope="col" className="adt-th-static">Insurer</th>
                  <th scope="col" className="adt-th-static">Quotes</th>
                </tr>
              </thead>
              <tbody>
                {topInsurers.map((row, i) => (
                  <tr key={row.label}>
                    <td style={{ color: THEME.textMuted }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{row.label}</td>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card style={{ padding: 20 }} hover>
          <CardTitle>Needs attention</CardTitle>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: THEME.textMuted }}>
            “Client to advise” for more than {ATTENTION_SLA_DAYS} days (as at {formatDisplayDate(toISODate(getToday()))}).
          </p>
          {needsAttention.length === 0 ? (
            <EmptyState>No items in this queue.</EmptyState>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {needsAttention.map((q) => (
                <li key={q.id} className="adt-list-item">
                  <div>
                    <LinkButton onClick={() => onOpenClient(q.id)}>{q.clientName}</LinkButton>
                    <div className="adt-list-meta">
                      Received {formatDisplayDate(q.dateReceived)} · {daysOpen(q.dateReceived)} days open
                    </div>
                  </div>
                  <Button onClick={() => onOpenClient(q.id)} tone="secondary">
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card style={{ padding: 20 }} hover>
        <CardTitle>Upcoming renewals (45 days)</CardTitle>
        {!renewalAlerts.length ? (
          <EmptyState>No upcoming renewals in the next 45 days.</EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {renewalAlerts.map(({ q, inDays }) => (
              <li key={q.id} className="adt-list-item">
                <LinkButton onClick={() => onOpenClient(q.id)}>{q.clientName}</LinkButton>
                <span style={{ color: THEME.textMuted, fontSize: 13 }}>
                  {inDays} days · {formatDisplayDate(q.renewalDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
