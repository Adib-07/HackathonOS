import { Link } from "wouter";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/workspace";

const checkpoints = [
  [
    "01",
    "Capture the rules",
    "Keep the official brief, tracks, and required deliverables together.",
  ],
  [
    "02",
    "Build a deadline-aware plan",
    "Turn a real deadline and available hours into ordered work.",
  ],
  [
    "03",
    "Verify before you claim",
    "Track evidence separately. Unchecked is not the same as passed.",
  ],
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <Brand />
        <div className="landing-header-right">
          <span className="private-note">
            <span /> PRIVATE BY DESIGN
          </span>
          <Link
            href="/sign-in"
            className="button button-secondary"
            data-testid="link-sign-in"
          >
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-grid grid-wash" />
          <div className="hero-content reveal">
            <div className="hero-kicker">
              <span className="kicker-line" /> PERSONAL HACKATHON CONTROL PLANE
            </div>
            <h1>
              From rules
              <br />
              to <em>ready.</em>
            </h1>
            <p className="hero-copy">
              One private workspace for the brief, the deadline, and the work
              that gets you across the finish line.
            </p>
            <div className="hero-actions">
              <Link
                href="/sign-up"
                className="button button-primary button-large"
                data-testid="link-get-started"
              >
                Start a workspace <ArrowRight size={16} />
              </Link>
              <span className="hero-caption">
                <ShieldCheck size={14} /> Your competition data stays yours.
              </span>
            </div>
          </div>
          <div
            className="terminal-preview reveal"
            aria-label="HackathonOS workspace preview"
          >
            <div className="terminal-bar">
              <div className="terminal-controls">
                <i />
                <i />
                <i />
              </div>
              <span className="mono">hackathonos / plan</span>
              <span className="terminal-live">
                <span /> EXAMPLE DATA
              </span>
            </div>
            <div className="preview-body">
              <div className="preview-sidebar">
                <div className="preview-brand">
                  <span>H</span> workspace
                </div>
                <div className="preview-nav active">
                  <span className="preview-square" /> Overview
                </div>
                <div className="preview-nav">
                  <span className="preview-square" /> Competitions
                </div>
                <div className="preview-divider" />
                <div className="preview-caption">PLAN STATUS</div>
                <div className="preview-status">
                  <span /> Plan available
                </div>
              </div>
              <div className="preview-content">
                <div className="preview-topline">
                  <div>
                    <small>ACTIVE COMPETITION</small>
                    <strong>Build for Tomorrow</strong>
                  </div>
                  <span className="preview-status-chip">IN PROGRESS</span>
                </div>
                <div className="preview-deadline">
                  <div>
                    <small>TIME TO SUBMISSION</small>
                    <strong>
                      02<span>d</span> 14<span>h</span>
                    </strong>
                  </div>
                  <div className="preview-progress">
                    <div />
                    <span>4 of 11 tasks complete</span>
                  </div>
                </div>
                <div className="preview-task-head">
                  <span>UP NEXT</span>
                  <span>EST.</span>
                </div>
                <div className="preview-task">
                  <span className="task-marker marker-active" />
                  <div>
                    <strong>Validate problem framing</strong>
                    <small>Problem definition · Critical</small>
                  </div>
                  <span className="mono">45m</span>
                </div>
                <div className="preview-task">
                  <span className="task-marker" />
                  <div>
                    <strong>Lock the project scope</strong>
                    <small>Specification · High priority</small>
                  </div>
                  <span className="mono">60m</span>
                </div>
                <div className="preview-task preview-task-muted">
                  <span className="task-marker" />
                  <div>
                    <strong>Confirm required deliverables</strong>
                    <small>Submission · Mandatory</small>
                  </div>
                  <span className="mono">20m</span>
                </div>
              </div>
            </div>
            <div className="preview-footnote">
              <span className="mono">ILLUSTRATIVE</span> · Example layout only;
              no live competition data is connected
            </div>
          </div>
          <div className="hero-coordinate mono">
            01 / 03
            <br />
            COMMAND CENTER
          </div>
        </section>
        <section className="landing-proof">
          <div className="proof-lead">
            <span className="proof-number mono">01</span>
            <p>
              A clearer way to
              <br />
              work under a deadline.
            </p>
          </div>
          <div className="proof-stat">
            <strong>
              <Clock3 size={16} /> DEADLINE-AWARE
            </strong>
            <span>
              Plans are scheduled against
              <br />
              the time you actually have.
            </span>
          </div>
          <div className="proof-stat">
            <strong>
              <FileCheck2 size={16} /> RULES IN CONTEXT
            </strong>
            <span>
              Official links and deliverables
              <br />
              stay close to the plan.
            </span>
          </div>
          <div className="proof-stat">
            <strong>
              <ShieldCheck size={16} /> EVIDENCE FIRST
            </strong>
            <span>
              Quality signals stay unverified
              <br />
              until evidence exists.
            </span>
          </div>
        </section>
        <section className="landing-process">
          <div className="process-heading">
            <span className="eyebrow">A SMALLER SURFACE AREA</span>
            <h2>
              Keep the work
              <br />
              in view.
            </h2>
            <p>
              HackathonOS is a focused command center, not a noisy AI cockpit.
              It helps you see what matters next and what is still unproven.
            </p>
          </div>
          <div className="process-list">
            {checkpoints.map(([index, title, copy]) => (
              <div className="process-row" key={index}>
                <span className="process-index mono">{index}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
                <ChevronRight size={17} />
              </div>
            ))}
          </div>
        </section>
        <section className="landing-guardrail">
          <div className="guardrail-symbol">
            <GitBranch size={21} />
          </div>
          <div className="guardrail-copy">
            <span className="eyebrow">A NOTE ON EVIDENCE</span>
            <h2>
              Plans are useful.
              <br />
              <em>Proof is better.</em>
            </h2>
            <p>
              Builds, tests, browser checks, security reviews, and submission
              readiness begin as <code>not_run</code>. HackathonOS will not
              claim a check passed until real evidence is connected.
            </p>
          </div>
          <div className="guardrail-state">
            <span>
              <i /> application build <b>not_run</b>
            </span>
            <span>
              <i /> automated tests <b>not_run</b>
            </span>
            <span>
              <i /> submission readiness <b>not_run</b>
            </span>
          </div>
        </section>
        <section className="landing-cta">
          <div>
            <span className="eyebrow">START WITH THE BRIEF</span>
            <h2>
              Bring one competition
              <br />
              into focus.
            </h2>
          </div>
          <Link
            href="/sign-up"
            className="button button-primary button-large"
            data-testid="link-create-account"
          >
            Create your account <ArrowRight size={16} />
          </Link>
          <div className="cta-index mono">
            HOS / 001
            <br />
            PRIVATE WORKSPACE
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand compact />
        <span>
          HackathonOS <span className="footer-separator">/</span> Personal
          competition planning
        </span>
        <span className="mono">BUILT FOR THE BUILD WINDOW</span>
      </footer>
    </div>
  );
}

export function PublicSignInLink() {
  return (
    <Link
      href="/sign-in"
      className="text-link"
      data-testid="link-public-sign-in"
    >
      Sign in to continue <Check size={14} />
    </Link>
  );
}
