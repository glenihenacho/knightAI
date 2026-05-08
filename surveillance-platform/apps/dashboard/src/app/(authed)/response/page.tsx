import { ComingSoon } from "../_components/coming-soon";

export default function ResponsePage() {
  return (
    <ComingSoon
      pillar="03"
      label="Response Orchestration"
      title="When something happens, the workflow runs."
      body="GoldCrusade routes events through programmable response workflows: notify the right guard, escalate if ignored, attach evidence, require acknowledgement, and preserve the audit trail. Phase 3 lights this up."
      bullets={[
        ["Programmable event routing", "Different events can notify guards, supervisors, dispatch, clients, or internal systems."],
        ["Acknowledgement and escalation", "Unacknowledged events move up the chain automatically instead of disappearing into a notification feed."],
        ["Response status tracking", "Every event carries a status: detected, routed, acknowledged, dispatched, resolved, or escalated."],
      ]}
    />
  );
}
