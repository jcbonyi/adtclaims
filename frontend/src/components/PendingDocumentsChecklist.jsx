import {
  getChecklistItems,
  normalizeReceivedKeys,
  resolveChecklistKey,
} from "../utils/pendingDocumentsConfig";

export default function PendingDocumentsChecklist({
  checklists,
  claimType,
  nonMotorCategory,
  receivedKeys,
  onChange,
  disabled,
}) {
  const checklistKey = resolveChecklistKey(claimType, nonMotorCategory);
  const checklist = checklists?.[checklistKey];
  const items = getChecklistItems(checklists, claimType, nonMotorCategory);
  const normalized = normalizeReceivedKeys(checklists, claimType, nonMotorCategory, receivedKeys);
  const receivedSet = new Set(normalized);
  const outstanding = items.filter((item) => !receivedSet.has(item.key));

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
        {items.map((item) => {
          const received = receivedSet.has(item.key);
          return (
            <li
              key={item.key}
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
                onChange={(e) => toggle(item.key, e.target.checked)}
              />
              <label
                htmlFor={`pdoc-${item.key}`}
                className={`flex-1 cursor-pointer ${received ? "text-slate-600 line-through" : "text-slate-900"}`}
              >
                {item.label}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
