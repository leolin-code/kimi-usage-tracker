import { useEffect, useState } from "react";

import appIconUrl from "../../../app-icon.svg?url";
import { useDashboard } from "../../state/dashboard.tsx";

const MINIMUM_VISIBLE_MS = 650;
const MAXIMUM_VISIBLE_MS = 1_800;
const EXIT_DURATION_MS = 280;

export function LaunchSplash() {
  const { initialLoading } = useDashboard();
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [maximumElapsed, setMaximumElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_VISIBLE_MS);
    const maximumTimer = window.setTimeout(() => setMaximumElapsed(true), MAXIMUM_VISIBLE_MS);
    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(maximumTimer);
    };
  }, []);

  useEffect(() => {
    if (!minimumElapsed || (initialLoading && !maximumElapsed)) return;
    setExiting(true);
    const timer = window.setTimeout(() => setVisible(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [initialLoading, maximumElapsed, minimumElapsed]);

  if (!visible) return null;

  return (
    <div
      aria-label="Kimi Usage Tracker"
      className="launch-splash"
      data-exiting={exiting || undefined}
      role="status"
    >
      <img alt="" className="launch-splash__logo" height="88" src={appIconUrl} width="88" />
      <strong className="launch-splash__name">Kimi Usage Tracker</strong>
      <span aria-hidden className="launch-splash__activity">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
