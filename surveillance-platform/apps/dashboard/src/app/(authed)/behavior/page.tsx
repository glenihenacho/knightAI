import { ComingSoon } from "../_components/coming-soon";

export default function BehaviorPage() {
  return (
    <ComingSoon
      pillar="02"
      label="Behavior Intelligence"
      title="Motion is noise. Behavior is signal."
      body="GoldCrusade interprets activity across zones and time. Dwell, repeated presence, path deviation, re-entry, and unusual movement become operational intelligence instead of raw alerts. Phase 2 lights this up."
      bullets={[
        ["Dwell and re-entry", "Understand when someone waits too long, leaves, returns, or repeats a pattern."],
        ["Path deviation", "Flag movement that breaks expected site flow, patrol routes, or access paths."],
        ["Contextual risk scoring", "The same activity can be normal at noon and suspicious at 2:00 AM."],
      ]}
    />
  );
}
