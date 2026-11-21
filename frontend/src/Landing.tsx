import { FormEvent, useEffect, useRef, useState } from "react";
import "./landing.css";

const OWNER_PASSWORD = "colbyleebean";
const EMAIL = "colbybean321@gmail.com";
const PHONE_LABEL = "+1 (689) 260-2573";
const PHONE_HREF = "tel:+16892602573";

type Note = {
  id: string;
  name: string;
  text: string;
  at: string;
  stars?: number;
};

function readNotes(key: string): Note[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Note[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeNotes(key: string, notes: Note[]) {
  localStorage.setItem(key, JSON.stringify(notes));
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6 14.8 8.3 21 9.2 16.5 13.6 17.6 19.8 12 16.9 6.4 19.8 7.5 13.6 3 9.2 9.2 8.3 12 2.6Z" />
    </svg>
  );
}

function Stars({ value, onPick }: { value: number; onPick?: (value: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = onPick ? hover || value : value;
  return (
    <div
      className={onPick ? "star-row" : "star-row show"}
      role={onPick ? "radiogroup" : "img"}
      aria-label={onPick ? undefined : `${value} out of 5 stars`}
      aria-labelledby={onPick ? "rating-label" : undefined}
      onMouseLeave={onPick ? () => setHover(0) : undefined}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button
            key={n}
            type="button"
            className={n <= shown ? "star-ico on" : "star-ico"}
            role="radio"
            aria-checked={value === n}
            aria-label={n === 1 ? "1 star" : `${n} stars`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onPick(n)}
          >
            <StarIcon />
          </button>
        ) : (
          <span key={n} className={n <= shown ? "star-ico on" : "star-ico"}>
            <StarIcon />
          </span>
        ),
      )}
    </div>
  );
}

export default function Landing({ onStart }: { onStart: () => void }) {
  const [feedback, setFeedback] = useState<Note[]>(() => readNotes("landing-feedback"));
  const [reviews, setReviews] = useState<Note[]>(() => readNotes("landing-reviews"));
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [reviewName, setReviewName] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [stars, setStars] = useState(5);
  const [reviewSent, setReviewSent] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [gate, setGate] = useState<{ kind: "edit"; item: Note } | { kind: "remove"; id: string } | null>(null);
  const [password, setPassword] = useState("");
  const [passwordWrong, setPasswordWrong] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onFeedback(event: FormEvent) {
    event.preventDefault();
    const text = feedbackText.trim();
    if (!text) return;
    const next = [
      { id: String(Date.now()), name: feedbackName.trim() || "Driver", text, at: new Date().toISOString() },
      ...feedback,
    ];
    setFeedback(next);
    writeNotes("landing-feedback", next);
    setFeedbackText("");
    setFeedbackSent(true);
  }

  function resetReviewForm() {
    setEditingReviewId(null);
    setReviewName("");
    setReviewText("");
    setStars(5);
  }

  function onReview(event: FormEvent) {
    event.preventDefault();
    const text = reviewText.trim();
    if (!text) return;
    const note = {
      name: reviewName.trim() || "Driver",
      text,
      stars,
      at: new Date().toISOString(),
    };
    const next = editingReviewId
      ? reviews.map((item) => (item.id === editingReviewId ? { ...item, ...note } : item))
      : [{ id: String(Date.now()), ...note }, ...reviews];
    setReviews(next);
    writeNotes("landing-reviews", next);
    resetReviewForm();
    setReviewSent(true);
  }

  useEffect(() => {
    if (gate) passwordRef.current?.focus();
  }, [gate]);

  function editReview(item: Note) {
    setEditingReviewId(item.id);
    setReviewName(item.name);
    setReviewText(item.text);
    setStars(item.stars ?? 5);
    setReviewSent(false);
    document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function removeReview(id: string) {
    const next = reviews.filter((item) => item.id !== id);
    setReviews(next);
    writeNotes("landing-reviews", next);
    if (editingReviewId === id) resetReviewForm();
  }

  function closeGate() {
    setGate(null);
    setPassword("");
    setPasswordWrong(false);
  }

  function onPassword(event: FormEvent) {
    event.preventDefault();
    if (password !== OWNER_PASSWORD) {
      setPasswordWrong(true);
      return;
    }
    const pending = gate;
    closeGate();
    if (pending?.kind === "edit") editReview(pending.item);
    if (pending?.kind === "remove") removeReview(pending.id);
  }

  return (
    <div className="land">
      <div className="land-hero-wrap">
      <header className="land-nav">
        <nav className="land-nav-actions" aria-label="Landing">
          <button type="button" className="land-ghost" onClick={() => go("contact")}>
            Contact
          </button>
          <button type="button" className="land-ghost" onClick={() => go("feedback")}>
            Feedback
          </button>
          <button type="button" className="land-ghost" onClick={() => go("review")}>
            Review
          </button>
          <button type="button" className="land-start" onClick={onStart}>
            Start
          </button>
        </nav>
      </header>

      <div
        className="hero"
        role="img"
        aria-label="Weather-Aware Truck Routing on a laptop, with a truck on a mountain highway"
      />
      </div>

      <section className="feature-band" aria-label="What the planner checks">
        <article>
          <h2>Weather risk</h2>
          <p>Each stop takes the worst of wind, rain, and snow: Low, Moderate, High, Severe, or No Travel.</p>
        </article>
        <article>
          <h2>Load-aware wind</h2>
          <p>A heavier load tightens the wind rules. Above 40,000 lb, strong wind can move from High to Severe.</p>
        </article>
        <article>
          <h2>Three routes</h2>
          <p>Roads are ordered by no-travel miles, then severe, high, average risk, and finally drive time.</p>
        </article>
        <article>
          <h2>48-hour timeline</h2>
          <p>The slider recolors the corridor from the forecast already on the page. It does not send a new request.</p>
        </article>
      </section>

      <section className="steps">
        <h2>How a trip is planned</h2>
        <ol>
          <li>Enter From and To. After two letters, pick a suggested place, then set departure and load weight.</li>
          <li>Choose Start, then Find routes. Open a route to read miles, arrival, wind, rain, and snow.</li>
          <li>Save the comparison and open it again later. Contact, feedback, and reviews stay on this page.</li>
        </ol>
      </section>

      <section className="land-block" id="contact">
        <h2>Contact</h2>
        <p>Reach Colby about routes, a demo, or a question.</p>
        <div className="contact-cards">
          <a className="contact-card" href={`mailto:${EMAIL}`}>
            <span>Email</span>
            <strong>{EMAIL}</strong>
          </a>
          <a className="contact-card" href={PHONE_HREF}>
            <span>Phone</span>
            <strong>{PHONE_LABEL}</strong>
          </a>
        </div>
      </section>

      <section className="land-block" id="feedback">
        <h2>Feedback</h2>
        <p>
          Tell me what worked on a trip and what should change. It is saved in this browser only and is not sent to an
          email address.
        </p>
        <form className="land-form" onSubmit={onFeedback}>
          <label>
            Name
            <input value={feedbackName} onChange={(event) => setFeedbackName(event.target.value)} placeholder="Your name" />
          </label>
          <label>
            Message
            <textarea
              required
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              placeholder="What should be easier?"
              rows={4}
            />
          </label>
          <button type="submit" className="land-start">
            Send feedback
          </button>
          {feedbackSent && <p className="land-note">Saved in this browser. Nothing was emailed.</p>}
        </form>
        {feedback.length > 0 && (
          <ul className="note-list">
            {feedback.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="land-block" id="review">
        <h2>Review</h2>
        <p>Rate the planner after a route comparison.</p>
        <form className="land-form" onSubmit={onReview}>
          <div className="stars">
            <span id="rating-label">Rating</span>
            <Stars value={stars} onPick={setStars} />
            <span className="star-count">{stars} of 5</span>
          </div>
          <label>
            Name
            <input value={reviewName} onChange={(event) => setReviewName(event.target.value)} placeholder="Your name" />
          </label>
          <label>
            Review
            <textarea
              required
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
              placeholder="How did the route comparison go?"
              rows={4}
            />
          </label>
          <button type="submit" className="land-start">
            {editingReviewId ? "Save changes" : "Post review"}
          </button>
          {editingReviewId && (
            <button type="button" className="land-ghost" onClick={resetReviewForm}>
              Cancel
            </button>
          )}
          {reviewSent && <p className="land-note">Saved in this browser.</p>}
        </form>
        {reviews.length === 0 ? (
          <p className="land-note">No reviews yet.</p>
        ) : (
          <ul className="note-list">
            {reviews.map((item) => (
              <li key={item.id}>
                <div className="note-head">
                  <strong>{item.name}</strong>
                  <Stars value={item.stars ?? 0} />
                  <div className="note-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setPassword("");
                        setPasswordWrong(false);
                        setGate({ kind: "edit", item });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPassword("");
                        setPasswordWrong(false);
                        setGate({ kind: "remove", id: item.id });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {gate && (
        <div className="lock-back" onClick={closeGate}>
          <form
            className="lock-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lock-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={onPassword}
          >
            <h2 id="lock-title">{gate.kind === "remove" ? "Remove this review" : "Edit this review"}</h2>
            <p>Enter the owner password. Other people cannot change a review.</p>
            <label>
              Password
              <input
                ref={passwordRef}
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordWrong(false);
                }}
              />
            </label>
            {passwordWrong && <p className="lock-error">Wrong password.</p>}
            <div className="lock-actions">
              <button type="button" className="land-ghost" onClick={closeGate}>
                Cancel
              </button>
              <button type="submit" className="land-start">
                Continue
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
