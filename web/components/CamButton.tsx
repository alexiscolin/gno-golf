"use client";

// The view's button, the game's and the Builder's Play: an eye, the view's
// name, three dots (the one on filled); a click goes to the next view, kept
// for the next visit.
import { Button } from "@/components/ui";
import { CAM_ORDER, saveCam } from "@/lib/prefs";
import { sound } from "@/lib/feel";
import type { CamMode } from "@/lib/engine/types";

export const CAMS: Record<CamMode, string> = { classic: "Classic", far: "Far", third: "Third person" };

/** cam: the view on now; onCam: the next one, picked (the game's camera set to it). */
export function CamButton({ cam, onCam }: { cam: CamMode | undefined; onCam: (next: CamMode) => void }) {
  const now = cam || "classic";
  return (
    <Button
      className="cam-btn"
      aria-label={`View: ${CAMS[now]} — click for the next view`}
      title={`View: ${CAMS[now]} — click for the next view`}
      onClick={() => {
        const next = CAM_ORDER[(CAM_ORDER.indexOf(now) + 1) % CAM_ORDER.length];
        saveCam(next);
        sound("blip");
        onCam(next);
      }}
    >
      {/* an eye, the view */}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></svg>
      <span className="cam-btn__name">{CAMS[now]}</span>
      {/* which of the three views, the current one filled: a click goes to the next */}
      <span className="cam-btn__dots" aria-hidden="true">{CAM_ORDER.map((c) => <i key={c} data-on={c === now ? "" : undefined} />)}</span>
    </Button>
  );
}
