import { ComingSoon } from "../_components/coming-soon";

export default function EvidencePage() {
  return (
    <ComingSoon
      pillar="04"
      label="Evidence Compiler"
      title="Turn security work into client-visible proof."
      body="Every event, patrol, response, note, clip, and resolution becomes structured evidence. GoldCrusade compiles that proof into client-ready reporting that makes the value of the contract visible. Phase 4 lights this up."
      bullets={[
        ["Structured evidence packets", "Each event includes time, camera, location, trigger, clip, response, resolution, and audit trail."],
        ["Daily intelligence reports", "Clients receive a clear record of what was watched, what happened, and what was handled."],
        ["Renewal-ready proof", "Reports convert invisible security labor into measurable value clients can understand."],
      ]}
    />
  );
}
