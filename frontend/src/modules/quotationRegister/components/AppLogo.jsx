import logoUrl from '../assets/adt-africa-logo.png'

export function AppLogo({ variant = 'sidebar', alt = 'adt africa Insurance Brokers Ltd' }) {
  const styles =
    variant === 'sidebar'
      ? {
          width: '100%',
          maxWidth: 220,
          height: 'auto',
          display: 'block',
        }
      : {
          height: 44,
          width: 'auto',
          maxWidth: 280,
          display: 'block',
        }

  return (
    <img
      src={logoUrl}
      alt={alt}
      style={styles}
    />
  )
}
