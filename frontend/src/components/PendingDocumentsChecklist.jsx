import {
  getChecklistItems,
  getItemOutstandingLabel,
  normalizeReceivedKeys,
  resolveChecklistKey,
} from "../utils/pendingDocumentsConfig";

function ChecklistItemRow({
  item,
  received,
  disabled,
  otherText,
  onToggle,
  onOtherTextChange,
}) {
  return (
    <li
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
        received ? "border-green-200 bg-green-50/60" : "border-slate-200 bg-white"
      }`}
    >
      <input
        type="checkbox"
        id={`pdoc-${item.key}`}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0078c8]"
        checked={received}
        disabled={disabled}
        onChange={(e) => onToggle(item.key, e.target.checked)}
      />
      {item.freeText ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label
            htmlFor={`pdoc-other-${item.key}`}
            className={`font-medium ${received ? "text-slate-600 line-through" : "text-slate-900"}`}
          >
            {item.label}
          </label>
          <input
            id={`pdoc-other-${item.key}`}
            type="text"
            className="adt-input"
            placeholder="Describe any other required document"
            value={otherText || ""}
            disabled={disabled || received}
            onChange={(e) => onOtherTextChange?.(e.target.value)}
          />
          {!received && otherText?.trim() ? (
            <p className="text-xs text-slate-500">
              Outstanding: {getItemOutstandingLabel(item, otherText)}
            </p>
          ) : null}
        </div>
      ) : (
        <label
          htmlFor={`pdoc-${item.key}`}
          className={`flex-1 cursor-pointer ${received ? "text-slate-600 line-through" : "text-slate-900"}`}
        >
          {item.label}
        </label>
      )}
    </li>
  );
}

export default function PendingDocumentsChecklist({
  checklists,
  claimType,
  nonMotorCategory,
  wibaFatalInjury,
  receivedKeys,
  otherText,
  onChange,
  onOtherTextChange,
  disabled,
}) {
  const checklistKey = resolveChecklistKey(claimType, nonMotorCategory);
  const checklist = checklists?.[checklistKey];
  const items = getChecklistItems(checklists, claimType, nonMotorCategory, wibaFatalInjury);
  const normalized = normalizeReceivedKeys(
    checklists,
    claimType,
    nonMotorCategory,
    receivedKeys,
    wibaFatalInjury
  );
  const receivedSet = new Set(normalized);
  const outstanding = items.filter((item) => !receivedSet.has(item.key));
  const standardItems = checklist?.items || [];
  const fatalItems =
    checklistKey === "WIBA" && wibaFatalInjury ? checklist?.fatalItems || [] : [];

  function toggle(key, checked) {
    const next = checked
      ? [...new Set([...normalized, key])]
      : normalized.filter((k) => k !== key);
    onChange(next);
  }

  if (!checklists) {
    return (
      <p className="text-sm text-slate-500">Loading document checklist…</p>
    );
  }

  if (claimType === "NON-MOTOR" && !nonMotorCategory) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Select a non-motor claim category below to display the required documents checklist.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">
          {checklist?.label || "Required documents"}
        </p>
        <span className="text-xs text-slate-500">
          {outstanding.length === 0
            ? "All documents marked received"
            : `${outstanding.length} outstanding`}
        </span>
      </div>
      <ul className="space-y-2">
        {standardItems.map((item) => (
          <ChecklistItemRow
            key={item.key}
            item={item}
            received={receivedSet.has(item.key)}
            disabled={disabled}
            otherText={otherText}
            onToggle={toggle}
            onOtherTextChange={onOtherTextChange}
          />
        ))}
      </ul>
      {fatalItems.length > 0 ? (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <p className="text-sm font-medium text-slate-800">
            {checklist?.fatalItemsLabel || "Additional documents for fatal injuries"}
          </p>
          <ul className="space-y-2">
            {fatalItems.map((item) => (
              <ChecklistItemRow
                key={item.key}
                item={item}
                received={receivedSet.has(item.key)}
                disabled={disabled}
                onToggle={toggle}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
