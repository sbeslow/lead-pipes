const REPO_URL = "https://github.com/sbeslow/lead-pipes";
const DATA_URL =
  "https://github.com/sbeslow/lead-pipes/blob/main/park-district-fountains/data/raw/FOIA_RESPONSES/R%20-%206464.xlsx";

export default function About() {
  return (
    <div id="about">
      <div className="about-card">
        <h2 className="about-heading">About this site</h2>
        <p className="about-body">
          This site shows lead test results for drinking water fountains in
          Chicago parks, obtained via a Freedom of Information Act (FOIA)
          request to the Chicago Park District. It covers 2,807 fixtures across
          402 parks with five years of test history.
        </p>
      </div>

      <div className="about-card">
        <h2 className="about-heading">Links</h2>
        <ul className="about-links">
          <li>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              <span className="about-link-icon">⌥</span>
              <span>
                <strong>Source code</strong>
                <span className="about-link-sub">github.com/sbeslow/lead-pipes</span>
              </span>
            </a>
          </li>
          <li>
            <a href={DATA_URL} target="_blank" rel="noopener noreferrer">
              <span className="about-link-icon">⬇</span>
              <span>
                <strong>Raw FOIA data</strong>
                <span className="about-link-sub">FOIA response R-6464 (.xlsx)</span>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
