import { THEME } from '../../constants'

export function HorizontalBarChart({ items, labelKey, valueKey, barColor }) {
  if (!items.length) {
    return <div style={{ fontSize: 13, color: THEME.textMuted }}>No data yet.</div>
  }
  const max = Math.max(1, ...items.map((i) => i[valueKey]))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((row) => (
        <div key={row[labelKey]}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: THEME.textMuted,
              marginBottom: 4,
            }}
          >
            <span style={{ color: THEME.text, fontWeight: 600 }}>
              {row[labelKey]}
            </span>
            <span>{row[valueKey]}</span>
          </div>
          <div
            style={{
              height: 10,
              borderRadius: 999,
              backgroundColor: THEME.pageBg,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(row[valueKey] / max) * 100}%`,
                backgroundColor: barColor ?? THEME.amber,
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DonutChart({ segments, size = 200 }) {
  if (!segments.length) {
    return <div style={{ fontSize: 13, color: THEME.textMuted }}>No data yet.</div>
  }
  const sum = segments.reduce((a, s) => a + s.value, 0)
  const total = sum || 1
  const stroke = 28
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const arcs = segments.map((s) => (s.value / total) * c)
  const offsets = arcs.map((_, i) =>
    i === 0 ? 0 : arcs.slice(0, i).reduce((a, b) => a + b, 0)
  )

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 24,
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          {segments.map((seg, i) => (
            <circle
              key={seg.label + i}
              r={r}
              cx={0}
              cy={0}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${arcs[i]} ${c - arcs[i]}`}
              strokeDashoffset={-offsets[i]}
              style={{ transition: 'stroke-dasharray 0.3s' }}
            />
          ))}
        </g>
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={THEME.brandBlueDark}
          fontSize={size * 0.12}
          fontWeight={800}
        >
          {sum}
        </text>
        <text
          x="50%"
          y="58%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={THEME.textMuted}
          fontSize={size * 0.055}
        >
          quotes
        </text>
      </svg>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          minWidth: 160,
          fontSize: 13,
        }}
      >
        {segments.map((seg) => (
          <li
            key={seg.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
              color: THEME.text,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: seg.color,
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1 }}>{seg.label}</span>
            <span style={{ color: THEME.textMuted, fontWeight: 600 }}>
              {seg.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FunnelBars({ stages }) {
  if (!stages.length) {
    return <div style={{ fontSize: 13, color: THEME.textMuted }}>No data yet.</div>
  }
  const max = Math.max(1, ...stages.map((s) => s.count))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {stages.map((s, idx) => (
        <div key={s.label}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 4,
              fontSize: 13,
              fontWeight: 600,
              color: THEME.text,
            }}
          >
            <span>
              {idx + 1}. {s.label}
            </span>
            <span style={{ color: THEME.textMuted }}>{s.count}</span>
          </div>
          <div
            style={{
              height: 36,
              borderRadius: 8,
              backgroundColor: THEME.pageBg,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(s.count / max) * 100}%`,
                background: `linear-gradient(90deg, ${THEME.brandBlue}, ${THEME.brandGreen})`,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 12,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                transition: 'width 0.35s ease',
              }}
            >
              {Math.round((s.count / max) * 100)}% of peak
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
