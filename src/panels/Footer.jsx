/**
 * src/panels/Footer.jsx
 * Mandatory scientific attribution, DOI 10.26133/NEA13, Exoplanet Encyclopaedia credit,
 * active snapshot ID, and raw CSV header timestamp.
 */

import { useExplorerStore } from '../store/explorerStore.js';

export function Footer() {
  const snapshot = useExplorerStore((s) => s.snapshot);
  const manifest = snapshot?.manifest || null;
  const primarySource = manifest?.sources?.[0] || null;
  const doi = primarySource?.doi || '10.26133/NEA13';
  const snapshotId = manifest?.snapshotId || '2026-10-30-79bb8609';
  const rawTimestamp = manifest?.headerTimestampRaw
    ? `${manifest.headerTimestampRaw} (timezone unspecified)`
    : 'Fri Oct 30 10:10:20 2026 (timezone unspecified)';

  return (
    <footer className="app-footer" role="contentinfo">
      <div className="footer-attribution">
        This research has made use of the NASA Exoplanet Archive, which is operated by the
        California Institute of Technology, under contract with the National Aeronautics and Space
        Administration under the Exoplanet Exploration Program.
      </div>
      <div className="footer-meta-row">
        <span>
          Primary Table: <code>pscomppars</code> • DOI:{' '}
          <a
            href={`https://doi.org/${doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            {doi} ↗
          </a>
        </span>
        <span>•</span>
        <span>Cross-catalogue design credit: Exoplanet Encyclopaedia (exoplanet.eu)</span>
        <span>•</span>
        <span>
          Snapshot: <code>{snapshotId}</code>
        </span>
        <span>•</span>
        <span>
          Archive Header Timestamp: <code>{rawTimestamp}</code>
        </span>
      </div>
    </footer>
  );
}

export default Footer;
