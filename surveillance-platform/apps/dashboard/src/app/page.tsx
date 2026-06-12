import Link from "next/link";
import { MarketingEffects } from "./_components/marketing-effects";
import "./marketing.css";

export const metadata = {
  title: "GoldCrusade — AI-Powered Surveillance Intelligence",
  description:
    "GoldCrusade helps security companies turn surveillance into a premium service clients can see, understand, and trust.",
};

const DEMO_URL = "https://cal.com/goldcrusade/15min";

export default function MarketingLanding() {
  return (
    <div className="gc-body">
      <nav className="gc-top" data-shine-sticky="1">
        <div className="gc-wrap gc-row">
          <Link href="/" className="gc-brand">
            <span className="gc-crest" data-shine="1" />
            GoldCrusade
          </Link>
          <div className="gc-links">
            <a href="#economics">Economics</a>
            <a href="#product">Product</a>
            <a href="#integrations">Integrations</a>
            <Link href="/dashboard">Client</Link>
          </div>
          <a className="gc-btn gc-primary" href="#demo" data-pointer-track="1">
            Book a Private Demo <span className="gc-arrow">→</span>
          </a>
        </div>
      </nav>

      <header className="gc-hero">
        <div className="gc-wrap gc-grid">
          <div className="gc-r" data-reveal="1">
            <span className="gc-eyebrow gc-gold gc-shine" data-shine="1">
              AI-Powered Surveillance Intelligence for Security Companies
            </span>
            <h1>
              Agentic Surveillance,
              <br />
              <span className="gc-it gc-shine" data-shine="1">
                made simple.
              </span>
            </h1>
            <p className="gc-lede">
              GoldCrusade helps security companies turn surveillance into a premium service clients
              can <b>see</b>, <b>understand</b>, and <b>trust</b>.
            </p>
            <div className="gc-promise">
              <span className="gc-shine" data-shine="1">
                More proof.
              </span>
              <span className="gc-shine" data-shine="1">
                Sharper reports.
              </span>
              <span className="gc-shine" data-shine="1">
                Stronger retention.
              </span>
              <span className="gc-shine" data-shine="1">
                Higher-value contracts.
              </span>
            </div>
            <div className="gc-ctas">
              <a className="gc-btn gc-primary" href="#demo" data-pointer-track="1">
                Book a Private Demo <span className="gc-arrow">→</span>
              </a>
              <a className="gc-btn" href="#product" data-pointer-track="1">
                See the Surveillance Upgrade
              </a>
            </div>
          </div>

          <div className="gc-report gc-r" data-reveal="1">
            <div className="gc-rhead">
              <div>
                <div className="gc-eyebrow gc-gold gc-shine" data-shine="1">
                  Daily Site Report
                </div>
                <div className="gc-rtitle">Westmark Logistics · Yard 4</div>
              </div>
              <div className="gc-rmeta">
                Shift{" "}
                <b className="gc-shine" data-shine="1">
                  Night 02
                </b>
                <br />
                22:00 — 06:00
                <br />
                Prepared by GoldCrusade
              </div>
            </div>
            <div className="gc-rbody">
              <div className="gc-kpis">
                <div className="gc-kpi">
                  <div className="gc-v gc-shine" data-shine="1">14</div>
                  <div className="gc-l">Patrols verified</div>
                </div>
                <div className="gc-kpi">
                  <div className="gc-v gc-shine" data-shine="1">3</div>
                  <div className="gc-l">Events flagged</div>
                </div>
                <div className="gc-kpi">
                  <div className="gc-v gc-shine" data-shine="1">
                    100<sup>%</sup>
                  </div>
                  <div className="gc-l">Site coverage</div>
                </div>
              </div>
              <h5 className="gc-rh5">Notable events</h5>
              <div className="gc-events">
                <div className="gc-ev">
                  <span className="gc-ts">23:14</span>
                  <span>Perimeter line crossed · CAM-04 · clip attached</span>
                  <span className="gc-st gc-alert gc-shine" data-shine="1">Resolved</span>
                </div>
                <div className="gc-ev">
                  <span className="gc-ts">01:42</span>
                  <span>Loitering · Lot B · 3m 12s · approached &amp; cleared</span>
                  <span className="gc-st">Cleared</span>
                </div>
                <div className="gc-ev">
                  <span className="gc-ts">04:08</span>
                  <span>Vehicle on premises · authorized contractor</span>
                  <span className="gc-st">Cleared</span>
                </div>
              </div>
              <div className="gc-fband">
                <span>Audit trail · 4,812 frames reviewed</span>
                <span className="gc-seal gc-shine" data-shine="1">GoldCrusade Verified</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="economics" className="gc-section">
        <div className="gc-wrap">
          <div className="gc-shead gc-r" data-reveal="1">
            <div>
              <span className="gc-eyebrow gc-gold gc-shine" data-shine="1">
                01 / The case
              </span>
              <h2>
                Same guards. Same cameras.{" "}
                <span className="gc-it gc-shine" data-shine="1">
                  A different contract.
                </span>
              </h2>
              <p className="gc-intro">
                Your competitors sell hours. You sell intelligence. Clients pay more — and stay
                longer — when they can prove what was watched, walked, and verified.
              </p>
            </div>
            <span className="gc-num">For owners &amp; ops directors</span>
          </div>
          <div className="gc-econ gc-r" data-reveal="1">
            <EconCell tag="Pricing" value="+15–30" sup="%">
              estimated uplift on contract value for AI-verified service tiers. Modeled from
              premium-tier pricing in remote video monitoring.
            </EconCell>
            <EconCell tag="Retention" value="+6–12" sup="%">
              estimated annual renewal-rate lift from automated client reporting. Modeled from B2B
              retention benchmarks where transparency drives comparable gains.
            </EconCell>
            <EconCell tag="Win rate" value="+25–40" sup="%">
              estimated relative gain in competitive RFP win rates with AI surveillance as a
              differentiator vs. undifferentiated bids.
            </EconCell>
            <EconCell tag="Cost" value="0">
              new cameras, on-site appliances, or extra headcount required to deploy.
            </EconCell>
          </div>
        </div>
      </section>

      <section id="product" className="gc-section">
        <div className="gc-wrap">
          <div className="gc-shead gc-r" data-reveal="1">
            <div>
              <span className="gc-eyebrow gc-gold gc-shine" data-shine="1">
                02 / The intelligence layer
              </span>
              <h2>
                Program the site.{" "}
                <span className="gc-it gc-shine" data-shine="1">
                  Interpret the risk.
                </span>{" "}
                Prove the response.
              </h2>
              <p className="gc-intro">
                GoldCrusade is not another AI camera tool. It is a programmable intelligence layer
                between your cameras, guards, supervisors, and clients.
              </p>
            </div>
            <span className="gc-num">Capabilities</span>
          </div>

          <ProductBlock
            num="02 · A — Site Logic Engine"
            title={
              <>
                Every property gets its own{" "}
                <span className="gc-it gc-shine" data-shine="1">
                  operating logic.
                </span>
              </>
            }
            body="Each site has different rules. GoldCrusade lets you program zones, schedules, access conditions, escalation paths, and client-specific expectations into the security layer itself."
            bullets={[
              ["Zone-based rules", "Restricted areas, virtual perimeters, loading docks, gates, lots, and camera-defined checkpoints."],
              ["Time-aware conditions", "Different logic for business hours, after-hours, weekends, holidays, and shift windows."],
              ["Site-specific exceptions", "Contractors, authorized vehicles, guard-only zones, and repeat activity patterns can be treated differently."],
            ]}
            visual={<SiteLogicVisual />}
          />

          <ProductBlock
            flip
            num="02 · B — Behavior Intelligence"
            title={
              <>
                Motion is noise.{" "}
                <span className="gc-it gc-shine" data-shine="1">
                  Behavior is signal.
                </span>
              </>
            }
            body="GoldCrusade interprets activity across zones and time. Dwell, repeated presence, path deviation, re-entry, and unusual movement become operational intelligence instead of raw alerts."
            bullets={[
              ["Dwell and re-entry", "Understand when someone waits too long, leaves, returns, or repeats a pattern."],
              ["Path deviation", "Flag movement that breaks expected site flow, patrol routes, or access paths."],
              ["Contextual risk scoring", "The same activity can be normal at noon and suspicious at 2:00 AM."],
            ]}
            visual={<BehaviorVisual />}
          />

          <ProductBlock
            num="02 · C — Response Orchestration"
            title={
              <>
                When something happens,{" "}
                <span className="gc-it gc-shine" data-shine="1">
                  the workflow runs.
                </span>
              </>
            }
            body="GoldCrusade routes events through programmable response workflows: notify the right guard, escalate if ignored, attach evidence, require acknowledgement, and preserve the audit trail."
            bullets={[
              ["Programmable event routing", "Different events can notify guards, supervisors, dispatch, clients, or internal systems."],
              ["Acknowledgement and escalation", "Unacknowledged events move up the chain automatically instead of disappearing into a notification feed."],
              ["Response status tracking", "Every event carries a status: detected, routed, acknowledged, dispatched, resolved, or escalated."],
            ]}
            visual={<ResponseVisual />}
          />

          <ProductBlock
            flip
            num="02 · D — Evidence Compiler"
            title={
              <>
                Turn security work into{" "}
                <span className="gc-it gc-shine" data-shine="1">
                  client-visible proof.
                </span>
              </>
            }
            body="Every event, patrol, response, note, clip, and resolution becomes structured evidence. GoldCrusade compiles that proof into client-ready reporting that makes the value of the contract visible."
            bullets={[
              ["Structured evidence packets", "Each event includes time, camera, location, trigger, clip, response, resolution, and audit trail."],
              ["Daily intelligence reports", "Clients receive a clear record of what was watched, what happened, and what was handled."],
              ["Renewal-ready proof", "Reports convert invisible security labor into measurable value clients can understand."],
            ]}
            visual={<EvidenceVisual />}
          />
        </div>
      </section>

      <section id="upgrade" className="gc-section">
        <div className="gc-wrap">
          <div className="gc-shead gc-r" data-reveal="1">
            <div>
              <span className="gc-eyebrow gc-gold gc-shine" data-shine="1">
                03 / The upgrade, plainly
              </span>
              <h2>
                Then, versus{" "}
                <span className="gc-it gc-shine" data-shine="1">
                  now.
                </span>
              </h2>
            </div>
            <span className="gc-num">Before / After</span>
          </div>
        </div>
        <div className="gc-ba gc-ba-wide gc-r" data-reveal="1">
          <div className="gc-col gc-before">
            <h4>Before · Standard contract</h4>
            <ul>
              <li>Cameras recording into an NVR no one watches</li>
              <li>Paper logs and pin-pad checkpoints</li>
              <li>Incidents discovered the next morning</li>
              <li>Monthly invoice with no proof attached</li>
              <li>Client questions every renewal</li>
            </ul>
          </div>
          <div className="gc-col gc-after">
            <h4 className="gc-shine" data-shine="1">After · Programmable intelligence layer</h4>
            <ul>
              <li>Site rules programmed by zone, shift, access condition, and risk level</li>
              <li>Activity interpreted as behavior, not raw motion</li>
              <li>Events routed through response workflows with acknowledgement and escalation</li>
              <li>Every action compiled into structured evidence packets</li>
              <li>Renewals supported by visible proof of performance</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="integrations" className="gc-trust">
        <div className="gc-wrap">
          <div className="gc-thead gc-r" data-reveal="1">
            <span className="gc-eyebrow gc-gold gc-shine" data-shine="1">
              04 / Intelligence fabric
            </span>
            <h2>
              Works with the cameras your clients{" "}
              <span className="gc-it gc-shine" data-shine="1">
                already paid for.
              </span>
            </h2>
            <p>
              Camera-agnostic. RTSP, ONVIF, or direct VMS integration. The programmable layer sits
              above the existing stack and turns camera feeds into site logic, response workflows,
              and client-visible proof.
            </p>
          </div>
        </div>

        <div className="gc-marquee gc-r" data-reveal="1" aria-label="Supported camera and VMS vendors">
          <div className="gc-mq-track">
            <MarqueeRow />
            <MarqueeRow ariaHidden />
          </div>
        </div>

        <div className="gc-wrap">
          <div className="gc-tfoot gc-r" data-reveal="1">
            <div className="gc-protocols">
              <span>+</span> RTSP &nbsp; <span>+</span> ONVIF &nbsp; <span>+</span> Direct VMS
            </div>
            <a href="#demo">Confirm your stack is supported →</a>
          </div>
        </div>
      </section>

      <section className="gc-quote">
        <div className="gc-wrap gc-r" data-reveal="1">
          <span className="gc-eyebrow gc-gold gc-shine" data-shine="1">
            05 / Field
          </span>
          <blockquote>
            &ldquo;We stopped competing on price. We sell the{" "}
            <span className="gc-it gc-shine" data-shine="1">
              report our clients receive every morning
            </span>{" "}
            — and they renewed at a higher tier without asking.&rdquo;
          </blockquote>
          <div className="gc-who">
            <span>Martin · Xpress Guards</span>
          </div>
        </div>
      </section>

      <section className="gc-final" id="demo">
        <div className="gc-wrap gc-r" data-reveal="1">
          <span className="gc-eyebrow gc-gold gc-shine" data-shine="1">
            Private demo · 15 minutes
          </span>
          <h2>
            Make every site
            <br />
            <span className="gc-it gc-shine" data-shine="1">
              programmable.
            </span>
          </h2>
          <p>
            Bring one camera URL and one current client. We&rsquo;ll show how their site rules,
            behavior patterns, response workflows, and evidence reports could operate as one
            intelligence layer.
          </p>
          <div className="gc-ctas">
            <a
              className="gc-btn gc-primary"
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-pointer-track="1"
            >
              Book a Private Demo <span className="gc-arrow">→</span>
            </a>
            <a className="gc-btn" href="#product" data-pointer-track="1">
              See the Surveillance Upgrade
            </a>
          </div>
        </div>
      </section>

      <footer id="contact" className="gc-footer">
        <div className="gc-wrap gc-row">
          <div>GoldCrusade · ©2026</div>
          <div>
            <a href="#">Privacy</a>
            <a href="#">Security</a>
            <a href="#">Status</a>
            <a href={DEMO_URL} target="_blank" rel="noopener noreferrer">
              Contact
            </a>
          </div>
        </div>
      </footer>

      <MarketingEffects />
    </div>
  );
}

function EconCell({
  tag,
  value,
  sup,
  children,
}: {
  tag: string;
  value: string;
  sup?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="gc-cell">
      <div className="gc-ev-tag">{tag}</div>
      <div className="gc-ev-v gc-shine" data-shine="1">
        {value}
        {sup && <sup>{sup}</sup>}
      </div>
      <div className="gc-ev-l">{children}</div>
    </div>
  );
}

function ProductBlock({
  num,
  title,
  body,
  bullets,
  visual,
  flip,
}: {
  num: string;
  title: React.ReactNode;
  body: string;
  bullets: [string, string][];
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className={`gc-pblock${flip ? " gc-flip" : ""} gc-r`} data-reveal="1">
      <div>
        <span className="gc-num-inline gc-shine" data-shine="1">
          {num}
        </span>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="gc-bullets">
          {bullets.map(([label, desc]) => (
            <div className="gc-bul" key={label}>
              <div>
                <b>{label}</b>
                <span className="gc-desc">{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="gc-visual">{visual}</div>
    </div>
  );
}

function MarqueeRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  const a = ariaHidden ? { "aria-hidden": true } : {};
  return (
    <>
      <span className="gc-mq-item gc-mq-hikvision" {...a}>Hikvision</span>
      <span className="gc-mq-divider" aria-hidden />
      <span className="gc-mq-item gc-mq-axis" {...a}>Axis</span>
      <span className="gc-mq-divider" aria-hidden />
      <span className="gc-mq-item gc-mq-avigilon" {...a}>Avigilon</span>
      <span className="gc-mq-divider" aria-hidden />
      <span className="gc-mq-item gc-mq-hanwha" {...a}>Hanwha</span>
      <span className="gc-mq-divider" aria-hidden />
      <span className="gc-mq-item gc-mq-bosch" {...a}>Bosch</span>
      <span className="gc-mq-divider" aria-hidden />
      <span className="gc-mq-item gc-mq-dahua" {...a}>Dahua</span>
      <span className="gc-mq-divider" aria-hidden />
      <span className="gc-mq-item gc-mq-genetec" {...a}>Genetec</span>
      <span className="gc-mq-divider" aria-hidden />
      <span className="gc-mq-item gc-mq-milestone" {...a}>Milestone</span>
      <span className="gc-mq-divider" aria-hidden />
    </>
  );
}

function SiteLogicVisual() {
  return (
    <div className="gc-surv" aria-label="Programmable site logic dashboard">
      <div className="gc-surv-top">
        <span><strong>SITE LOGIC</strong> · Westmark Yard 4</span>
        <span className="gc-surv-live">Armed</span>
      </div>
      <div className="gc-surv-scene">
        <svg viewBox="0 0 640 512" role="img" aria-label="Site map with programmable zones and rules">
          <rect width="640" height="512" fill="#0b0b09" />
          <g opacity={0.34} stroke="rgba(255,255,255,.055)" strokeWidth={1}>
            <line x1="0" y1="96" x2="640" y2="96" />
            <line x1="0" y1="192" x2="640" y2="192" />
            <line x1="0" y1="288" x2="640" y2="288" />
            <line x1="0" y1="384" x2="640" y2="384" />
            <line x1="96" y1="0" x2="96" y2="512" />
            <line x1="224" y1="0" x2="224" y2="512" />
            <line x1="352" y1="0" x2="352" y2="512" />
            <line x1="480" y1="0" x2="480" y2="512" />
          </g>
          <polygon fill="#0d0d0b" stroke="#25251f" strokeWidth={1} points="62,90 536,62 588,414 104,438" />
          <polygon fill="rgba(233,184,100,.08)" stroke="rgba(233,184,100,.45)" strokeWidth={2} points="112,136 300,122 326,252 132,270" />
          <polygon fill="rgba(255,90,77,.08)" stroke="rgba(255,90,77,.55)" strokeWidth={2} points="342,116 512,102 540,248 364,258" />
          <polygon fill="rgba(255,255,255,.025)" stroke="#33332a" strokeWidth={1.5} points="136,306 528,282 546,380 150,404" />
          <rect x="148" y="152" width="112" height="68" fill="#11110d" stroke="#34342a" />
          <rect x="384" y="142" width="118" height="74" fill="#11110d" stroke="#34342a" />
          <rect x="212" y="320" width="174" height="42" fill="#11110d" stroke="#34342a" />
          <line x1="112" y1="136" x2="300" y2="122" stroke="var(--gold)" strokeWidth={2} style={{ filter: "drop-shadow(0 0 5px rgba(233,184,100,.65))" }} />
          <line x1="342" y1="116" x2="512" y2="102" stroke="var(--red)" strokeWidth={2} style={{ filter: "drop-shadow(0 0 5px rgba(255,90,77,.42))" }} />
          <text x="130" y="112" fill="#e9b864" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="12" letterSpacing="1.5">RULE: AFTER-HOURS ACCESS</text>
          <text x="360" y="92" fill="#ff5a4d" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="12" letterSpacing="1.5">RESTRICTED ZONE</text>
          <text x="150" y="296" fill="#a8a08e" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="11" letterSpacing="1.3">AUTHORIZED VEHICLE PATH</text>
          <circle cx="126" cy="136" r="7" fill="#e9b864" />
          <circle cx="300" cy="122" r="7" fill="#e9b864" />
          <circle cx="342" cy="116" r="7" fill="#ff5a4d" />
          <circle cx="512" cy="102" r="7" fill="#ff5a4d" />
        </svg>
        <div className="gc-mp">
          <div className="gc-mp-k">Active rules</div>
          <div className="gc-mp-v">18</div>
          <div className="gc-mp-row"><span>Zones</span><b>06</b></div>
          <div className="gc-mp-row"><span>Shift</span><b>Night</b></div>
        </div>
        <div className="gc-hud">
          <span><b>Site logic armed</b> · after-hours rules active</span>
          <span>6 zones watched</span>
        </div>
      </div>
    </div>
  );
}

function BehaviorVisual() {
  return (
    <div className="gc-surv" aria-label="Behavior intelligence camera dashboard">
      <div className="gc-surv-top">
        <span><strong>BEHAVIOR</strong> · Lot B Loading Dock</span>
        <span className="gc-surv-live">Live</span>
      </div>
      <div className="gc-surv-scene">
        <svg viewBox="0 0 640 512" role="img" aria-label="Behavior intelligence view with dwell and movement path">
          <rect width="640" height="512" fill="#0b0b09" />
          <g opacity={0.34} stroke="rgba(255,255,255,.055)" strokeWidth={1}>
            <line x1="0" y1="118" x2="640" y2="118" />
            <line x1="0" y1="206" x2="640" y2="206" />
            <line x1="0" y1="294" x2="640" y2="294" />
            <line x1="0" y1="382" x2="640" y2="382" />
            <line x1="96" y1="0" x2="96" y2="512" />
            <line x1="224" y1="0" x2="224" y2="512" />
            <line x1="352" y1="0" x2="352" y2="512" />
            <line x1="480" y1="0" x2="480" y2="512" />
          </g>
          <rect x="54" y="74" width="512" height="186" rx="2" fill="#181812" stroke="#2f2f27" strokeWidth={1.2} />
          <rect x="86" y="108" width="150" height="152" fill="#0e0e0b" stroke="#34342a" />
          <rect x="264" y="108" width="150" height="152" fill="#0e0e0b" stroke="#34342a" />
          <rect x="442" y="108" width="84" height="152" fill="#11110d" stroke="#34342a" />
          <polygon fill="#0d0d0b" stroke="#25251f" strokeWidth={1} points="0,272 640,236 640,512 0,512" />
          <path d="M128 412 C210 356 246 390 308 318 C362 254 430 286 516 228" fill="none" stroke="rgba(233,184,100,.75)" strokeWidth={3} strokeDasharray="10 7" />
          <circle cx="308" cy="318" r="86" fill="rgba(255,90,77,.08)" stroke="rgba(255,90,77,.46)" strokeWidth={1.5} strokeDasharray="7 8" />
          <ellipse cx="321" cy="388" rx="62" ry="17" fill="rgba(0,0,0,.32)" />
          <g transform="translate(298 212)">
            <circle cx="18" cy="18" r="14" fill="#d8d0bb" stroke="#fff3cd" strokeWidth={0.8} />
            <path d="M4 38 H31 C38 38 42 44 41 51 L35 103 H0 L-6 51 C-7 44 -3 38 4 38Z" fill="#d8d0bb" stroke="#fff3cd" strokeWidth={0.8} />
            <path d="M5 103 L-6 158 H9 L18 106 Z" fill="#d8d0bb" stroke="#fff3cd" strokeWidth={0.8} />
            <path d="M31 103 L47 158 H31 L20 106 Z" fill="#d8d0bb" stroke="#fff3cd" strokeWidth={0.8} />
          </g>
          <rect x="270" y="196" width="102" height="194" fill="none" stroke="#ff5a4d" strokeWidth={2} strokeDasharray="7 5" />
          <text x="392" y="234" fill="#ff5a4d" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="12" letterSpacing="1.5">DWELL · 02:41</text>
          <text x="392" y="254" fill="#e9b864" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="11" letterSpacing="1.3">RE-ENTRY WINDOW ACTIVE</text>
        </svg>
        <div className="gc-mp">
          <div className="gc-mp-k">Risk score</div>
          <div className="gc-mp-v">82%</div>
          <div className="gc-mp-row"><span>Dwell</span><b>02:41</b></div>
          <div className="gc-mp-row"><span>Pattern</span><b>Repeat</b></div>
        </div>
        <div className="gc-hud">
          <span><b>Behavior pattern detected</b> · repeated dock presence</span>
          <span className="gc-h-alert">High context</span>
        </div>
      </div>
    </div>
  );
}

function ResponseVisual() {
  return (
    <div className="gc-cmap" aria-label="Response orchestration workflow dashboard">
      <div className="gc-mtop">
        <span>Response Workflow · CAM-04</span>
        <span><b>Running</b></span>
      </div>
      <div className="gc-mstage">
        <div className="gc-mcanvas">
          <svg viewBox="0 0 500 470" role="img" aria-label="Event workflow routed from detection to resolution">
            <defs>
              <filter id="gc-glow-response">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect x="48" y="56" width="156" height="64" rx="2" fill="#11110d" stroke="#e9b864" strokeWidth={1.5} />
            <rect x="286" y="56" width="156" height="64" rx="2" fill="#11110d" stroke="#34342a" />
            <rect x="48" y="188" width="156" height="64" rx="2" fill="#11110d" stroke="#34342a" />
            <rect x="286" y="188" width="156" height="64" rx="2" fill="#11110d" stroke="#34342a" />
            <rect x="166" y="320" width="170" height="64" rx="2" fill="#11110d" stroke="#e9b864" strokeWidth={1.5} />
            <path d="M204 88 H286" stroke="#e9b864" strokeWidth={3} strokeDasharray="9 7" filter="url(#gc-glow-response)" />
            <path d="M364 120 V188" stroke="#e9b864" strokeWidth={3} strokeDasharray="9 7" filter="url(#gc-glow-response)" />
            <path d="M286 220 H204" stroke="#e9b864" strokeWidth={3} strokeDasharray="9 7" filter="url(#gc-glow-response)" />
            <path d="M126 252 C126 304 166 304 166 352" stroke="#e9b864" strokeWidth={3} strokeDasharray="9 7" filter="url(#gc-glow-response)" />
            <g fontFamily="var(--font-mono), 'JetBrains Mono', monospace" style={{ textTransform: "uppercase" }}>
              <text x="68" y="84" fill="#e9b864" fontSize="11" letterSpacing="1.4">01 DETECT</text>
              <text x="68" y="104" fill="#a8a08e" fontSize="9" letterSpacing="1.1">perimeter crossed</text>
              <text x="306" y="84" fill="#f1ecdf" fontSize="11" letterSpacing="1.4">02 NOTIFY</text>
              <text x="306" y="104" fill="#a8a08e" fontSize="9" letterSpacing="1.1">assigned guard</text>
              <text x="68" y="216" fill="#f1ecdf" fontSize="11" letterSpacing="1.4">04 VERIFY</text>
              <text x="68" y="236" fill="#a8a08e" fontSize="9" letterSpacing="1.1">clip + note</text>
              <text x="306" y="216" fill="#f1ecdf" fontSize="11" letterSpacing="1.4">03 ESCALATE</text>
              <text x="306" y="236" fill="#a8a08e" fontSize="9" letterSpacing="1.1">if ignored</text>
              <text x="190" y="348" fill="#e9b864" fontSize="11" letterSpacing="1.4">05 RESOLVE</text>
              <text x="190" y="368" fill="#a8a08e" fontSize="9" letterSpacing="1.1">audit trail saved</text>
            </g>
          </svg>
        </div>
        <aside className="gc-mside">
          <div className="gc-side-title">Workflow state</div>
          <div className="gc-side-stat"><div className="gc-big">03</div><div className="gc-small">Active steps</div></div>
          <div className="gc-side-stat"><div className="gc-big">12s</div><div className="gc-small">Response age</div></div>
          <div className="gc-rlist">
            <div className="gc-ritem"><span>Detect</span><b>Done</b></div>
            <div className="gc-ritem"><span>Notify</span><b>Sent</b></div>
            <div className="gc-ritem"><span>Guard</span><b>Ack</b></div>
            <div className="gc-ritem"><span>Report</span><b>Queued</b></div>
          </div>
        </aside>
        <div className="gc-mfooter">
          <span>Event status <b>acknowledged</b></span>
          <span>Evidence <b>attached</b></span>
        </div>
      </div>
    </div>
  );
}

function EvidenceVisual() {
  return (
    <div className="gc-surv" aria-label="Evidence compiler client report dashboard">
      <div className="gc-surv-top">
        <span><strong>EVIDENCE</strong> · Daily Intelligence Packet</span>
        <span style={{ color: "var(--gold)" }}>Compiled</span>
      </div>
      <div className="gc-surv-scene">
        <svg viewBox="0 0 640 512" role="img" aria-label="Evidence compiler report with events, clips, and audit trail">
          <rect width="640" height="512" fill="#0b0b09" />
          <rect x="54" y="54" width="528" height="358" rx="2" fill="#11110d" stroke="#303028" />
          <line x1="54" y1="122" x2="582" y2="122" stroke="#2e2e26" />
          <text x="82" y="92" fill="#f1ecdf" fontFamily="var(--font-serif), 'Instrument Serif', serif" fontSize="30">Westmark Logistics · Intelligence Report</text>
          <text x="82" y="146" fill="#e9b864" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="11" letterSpacing="1.5">EVIDENCE PACKETS</text>
          <g fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="10" letterSpacing="1.1">
            <rect x="82" y="168" width="476" height="54" fill="#0d0d0b" stroke="#2e2e26" />
            <text x="104" y="199" fill="#a8a08e">23:14 · CAM-04 · PERIMETER CROSSED</text>
            <text x="458" y="199" fill="#e9b864">RESOLVED</text>
            <rect x="82" y="238" width="476" height="54" fill="#0d0d0b" stroke="#2e2e26" />
            <text x="104" y="269" fill="#a8a08e">01:42 · LOT B · BEHAVIOR PATTERN</text>
            <text x="458" y="269" fill="#e9b864">CLEARED</text>
            <rect x="82" y="308" width="476" height="54" fill="#0d0d0b" stroke="#2e2e26" />
            <text x="104" y="339" fill="#a8a08e">04:08 · PATROL · ROUTE VERIFIED</text>
            <text x="458" y="339" fill="#e9b864">VERIFIED</text>
          </g>
          <g>
            <rect x="82" y="384" width="110" height="70" fill="rgba(233,184,100,.08)" stroke="rgba(233,184,100,.42)" />
            <text x="106" y="425" fill="#e9b864" fontFamily="var(--font-serif), 'Instrument Serif', serif" fontSize="32">14</text>
            <text x="82" y="472" fill="#a8a08e" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="9" letterSpacing="1.2">PATROLS VERIFIED</text>
            <rect x="242" y="384" width="110" height="70" fill="rgba(233,184,100,.08)" stroke="rgba(233,184,100,.42)" />
            <text x="284" y="425" fill="#e9b864" fontFamily="var(--font-serif), 'Instrument Serif', serif" fontSize="32">3</text>
            <text x="254" y="472" fill="#a8a08e" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="9" letterSpacing="1.2">EVENTS FLAGGED</text>
            <rect x="402" y="384" width="110" height="70" fill="rgba(233,184,100,.08)" stroke="rgba(233,184,100,.42)" />
            <text x="428" y="425" fill="#e9b864" fontFamily="var(--font-serif), 'Instrument Serif', serif" fontSize="32">100%</text>
            <text x="408" y="472" fill="#a8a08e" fontFamily="var(--font-mono), 'JetBrains Mono', monospace" fontSize="9" letterSpacing="1.2">AUDIT COVERAGE</text>
          </g>
        </svg>
        <div className="gc-hud">
          <span><b>Evidence compiled</b> · 4,812 frames reviewed</span>
          <span>Client-ready</span>
        </div>
      </div>
    </div>
  );
}
