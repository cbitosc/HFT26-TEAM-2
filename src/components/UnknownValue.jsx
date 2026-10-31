/**
 * src/components/UnknownValue.jsx
 * Renders a grey "unknown" badge whenever a scientific measurement is missing (null).
 * Never substitutes 0 or typical values.
 */

export function UnknownValue({ label = 'unknown' }) {
  return (
    <span
      className="unknown-value"
      title="Measurement is missing (null) in the archive snapshot — never zero-filled or estimated"
    >
      {label}
    </span>
  );
}

export default UnknownValue;
