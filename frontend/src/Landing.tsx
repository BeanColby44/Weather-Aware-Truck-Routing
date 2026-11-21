import { FormEvent, useState } from "react";
import "./landing.css";

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

  function onReview(event: FormEvent) {
    event.preventDefault();
    const text = reviewText.trim();
    if (!text) return;
    const next = [
      {
        id: String(Date.now()),
        name: reviewName.trim() || "Driver",
        text,
        stars,
        at: new Date().toISOString(),
      },
      ...reviews,
    ];
    setReviews(next);
    writeNotes("landing-reviews", next);
    setReviewText("");
    setReviewSent(true);
  }

  return (
    <div className="land">
      <div
        className="hero"
        role="img"
        aria-label="Weather-Aware Truck Routing on a laptop, with a truck on a mountain highway"
      />
      <div className="hero-cta">
          <button type="button" className="land-start" onClick={onStart}>
            Start
          </button>
          <div className="hero-actions">
            <button type="button" className="land-ghost" onClick={() => go("contact")}>
              Contact
            </button>
            <button type="button" className="land-ghost" onClick={() => go("feedback")}>
              Feedback
            </button>
            <button type="button" className="land-ghost" onClick={() => go("review")}>
              Review
            </button>
          </div>
          <p className="hero-contact">
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            <a href={PHONE_HREF}>{PHONE_LABEL}</a>
          </p>
      </div>

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
        <p>Tell me what worked on a trip and what should change.</p>
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
          {feedbackSent && <p className="land-note">Feedback saved. Thank you.</p>}
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
          <fieldset className="stars">
            <legend>Stars</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= stars ? "star on" : "star"}
                aria-pressed={value <= stars}
                onClick={() => setStars(value)}
              >
                {value === 1 ? "1 star" : `${value} stars`}
              </button>
            ))}
          </fieldset>
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
            Post review
          </button>
          {reviewSent && <p className="land-note">Review posted. Thank you.</p>}
        </form>
        {reviews.length === 0 ? (
          <p className="land-note">No reviews yet.</p>
        ) : (
          <ul className="note-list">
            {reviews.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.name} · {item.stars === 1 ? "1 star" : `${item.stars} stars`}
                </strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
