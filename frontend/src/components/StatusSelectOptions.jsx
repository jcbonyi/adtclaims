import { CLAIM_STATUS_GROUPS } from "../utils/constants";

/**
 * Grouped <option> / <optgroup> children for status <select> elements.
 * @param {{ placeholder?: string | null }} props — pass placeholder string for empty option, or omit for no empty option
 */
export default function StatusSelectOptions({ placeholder = null }) {
  return (
    <>
      {placeholder != null && placeholder !== false ? (
        <option value="">{placeholder}</option>
      ) : null}
      {CLAIM_STATUS_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
