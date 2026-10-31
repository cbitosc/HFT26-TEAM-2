/**
 * src/components/DetectionBiasCaveat.jsx
 * Mandatory permanent caveat mounted wherever HAB-LAB or population indicators are shown.
 */

export function DetectionBiasCaveat() {
  return (
    <aside className="detection-bias-caveat" role="note" aria-label="Detection bias and habitability caveat">
      <span className="caveat-badge">Caveat</span>
      <p className="caveat-text">
        Detection methods favour certain planets, so this catalogue is not a representative sample.
        These are indicators, not a verdict.
      </p>
    </aside>
  );
}

export default DetectionBiasCaveat;
