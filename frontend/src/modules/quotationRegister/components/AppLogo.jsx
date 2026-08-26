import logoUrl from '../assets/adt-africa-logo.png'

export function AppLogo({ variant = 'sidebar', alt = 'adt africa Insurance Brokers Ltd' }) {
  const styles =
    variant === 'sidebar'
      ? {
          width: '100%',
          maxWidth: 240,
          height: 'auto',
          display: 'block',
        }
      : {
          height: 52,
          width: 'auto',
          maxWidth: 320,
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
