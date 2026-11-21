import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { suggestPlaces } from "../api";

function PlacePin() {
  return (
    <svg className="place-pin" viewBox="0 0 32 42" width="22" height="28" aria-hidden="true">
      <path
        d="M16 40.5C16 40.5 29 24.5 29 15.2A13 13 0 1 0 3 15.2C3 24.5 16 40.5 16 40.5Z"
        fill="#1faf6a"
        stroke="#ffffff"
        strokeWidth="2"
      />
      <circle cx="16" cy="15" r="5" fill="#ffffff" />
    </svg>
  );
}

function SuggestionLabel({ label, query }: { label: string; query: string }) {
  const needle = query.trim();
  const index = needle ? label.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (index < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, index)}
      <mark>{label.slice(index, index + needle.length)}</mark>
      {label.slice(index + needle.length)}
    </>
  );
}

export default function PlaceField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (query === null) return;
    const text = query.trim();
    if (text.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      suggestPlaces(text, controller.signal)
        .then((next) => {
          setItems(next);
          setActive(0);
          setOpen(next.length > 0);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setItems([]);
          setOpen(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function choose(next: string) {
    onChange(next);
    setQuery(null);
    setItems([]);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(items[active] ?? items[0]);
    }
  }

  return (
    <div className="place-field" ref={box}>
      <label>
        <PlacePin />
        <span className="place-copy">
          <span className="place-name">{label}</span>
          <input
            value={value}
            placeholder={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? `${listId}-${active}` : undefined}
            onChange={(event) => {
              onChange(event.target.value);
              setQuery(event.target.value);
            }}
            onFocus={() => {
              if (items.length > 0) setOpen(true);
            }}
            onKeyDown={onKeyDown}
          />
        </span>
      </label>
      {open && items.length > 0 && (
        <ul className="place-suggest" id={listId} role="listbox">
          {items.map((item, index) => (
            <li key={item} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listId}-${index}`}
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
              >
                <SuggestionLabel label={item} query={query ?? ""} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
