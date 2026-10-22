import { Link } from 'wouter';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <span className="not-found-icon">
          <Compass size={22} />
        </span>
        <span className="eyebrow">404 · NOT FOUND</span>
        <h1>This page does not exist.</h1>
        <p>
          The address you followed is not part of HackathonOS. It may have been
          renamed, or the competition workspace may have been removed.
        </p>
        <div className="not-found-actions">
          <Link href="/" className="button button-primary" data-testid="link-not-found-overview">
            <ArrowLeft size={14} /> Back to overview
          </Link>
          <Link href="/competitions" className="button button-secondary" data-testid="link-not-found-competitions">
            View competitions
          </Link>
        </div>
      </div>
    </div>
  );
}
