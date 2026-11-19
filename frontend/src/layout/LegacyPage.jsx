import React from "react";

/*
 * Wraps pages that still use the legacy stylesheets. Gives them the padding the old
 * `main` element had and pins them to the light palette (their colors are hard-coded),
 * so they stay readable when the new shell is in dark mode. Remove per page as it is
 * migrated to src/components/ui; see src/styles/legacy-bridge.css.
 */
export function LegacyPage({ children }) {
  return <div className="legacy-page">{children}</div>;
}
