export default function EmptyState({ title, message, action }) {
  return (
    <div className="adt-empty">
      <p className="adt-empty-title">{title}</p>
      {message ? <p className="adt-empty-text">{message}</p> : null}
      {action}
    </div>
  );
}
