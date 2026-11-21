import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { fetchHeatmap, planTrip } from "./api";
import MapView from "./components/MapView";
import PlaceField from "./components/PlaceField";
import RouteDetail from "./components/RouteDetail";
import { RISK_COLOR, RISK_LABEL, formatClock, formatWhen, weatherPhrase } from "./format";
import { readSaved, tripKey, writeSaved, type SavedTrip } from "./saved";
import { asSample, readSettings, writeSettings, type RouteSort } from "./settings";
import type { HeatmapResponse, PlanResponse, RiskLevel, RoutePlan } from "./types";

const PRESETS = [
  {
    id: "heavy",
    label: "Chicago → St. Louis · 42,000 lb",
    origin: "Chicago, IL",
    destination: "St. Louis, MO",
    load: "42000",
    sample: 25,
  },
  {
    id: "light",
    label: "Dallas → Oklahoma City · 18,000 lb",
    origin: "Dallas, TX",
    destination: "Oklahoma City, OK",
    load: "18000",
    sample: 25,
  },
];

export default function App({ onHome }: { onHome: () => void }) {
  const [origin, setOrigin] = useState("Chicago, IL");
  const [destination, setDestination] = useState("St. Louis, MO");
  const [departure, setDeparture] = useState(defaultDeparture);
  const [load, setLoad] = useState(() => readSettings().load);
  const [sample, setSample] = useState(() => readSettings().sample);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(() => readSettings().timelineOpen);
  const [heatmapOn, setHeatmapOn] = useState(() => readSettings().heatmapOn);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(() => readSettings().playbackSpeed);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [detailOpen, setDetailOpen] = useState(false);
  const [routeSort, setRouteSort] = useState<RouteSort>(() => readSettings().routeSort);
  const [section, setSection] = useState<"plan" | "saved" | "weather" | "settings">("plan");
  const [guideOpen, setGuideOpen] = useState(false);
  const [saved, setSaved] = useState<SavedTrip[]>(() => readSaved());
  const [justSaved, setJustSaved] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const storedSample = sample === 10 || sample === 50 ? sample : 25;
    writeSettings({
      load,
      sample: storedSample,
      routeSort,
      timelineOpen,
      heatmapOn,
      playbackSpeed,
    });
  }, [load, sample, routeSort, timelineOpen, heatmapOn, playbackSpeed]);

  useEffect(() => {
    setJustSaved(false);
  }, [origin, destination, departure, load, sample, plan]);

  const selected = useMemo(
    () => plan?.routes.find((route) => route.id === selectedId) ?? null,
    [plan, selectedId],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const loadWeight = Number(load);
    if (!origin.trim() || !destination.trim()) {
      setError("Enter both an origin and a destination.");
      return;
    }
    if (!departure) {
      setError("Enter a departure date and time.");
      return;
    }
    if (!Number.isFinite(loadWeight) || loadWeight <= 0) {
      setError("Enter load weight in pounds.");
      return;
    }
    const departureDate = new Date(departure);
    if (Number.isNaN(departureDate.getTime())) {
      setError("Enter a valid departure date and time.");
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);
    setHeatmap(null);
    setHeatmapLoading(false);
    setHeatmapError(null);
    try {
      const next = await planTrip({
        origin: origin.trim(),
        destination: destination.trim(),
        departure: departureDate.toISOString(),
        load_weight_lb: loadWeight,
        sample_miles: sample,
      });
      if (requestId.current !== id) return;
      setPlan(next);
      setSelectedId(next.recommended_route_id);
      setLoading(false);
      void loadHeatmap(id, loadWeight, next.routes);
    } catch (err) {
      if (requestId.current !== id) return;
      setLoading(false);
      setError(err instanceof Error ? err.message : "The trip could not be planned.");
    }
  }

  async function loadHeatmap(id: number, loadWeight: number, routes: RoutePlan[]) {
    setHeatmapLoading(true);
    try {
      const next = await fetchHeatmap(loadWeight, routes);
      if (requestId.current !== id) return;
      setHeatmap(next);
      setHeatmapLoading(false);
    } catch (err) {
      if (requestId.current !== id) return;
      setHeatmapLoading(false);
      setHeatmapError(err instanceof Error ? err.message : "Could not load the forecast.");
    }
  }

  function remember(next: SavedTrip[]) {
    setSaved(next);
    writeSaved(next);
  }

  function saveCurrentTrip() {
    if (!plan) return;
    const draft: SavedTrip = {
      id: String(Date.now()),
      savedAt: new Date().toISOString(),
      origin,
      destination,
      departureLocal: departure,
      load,
      sample,
      selectedId,
      plan,
    };
    const key = tripKey(draft);
    const existing = saved.find((trip) => tripKey(trip) === key);
    const next = existing
      ? saved.map((trip) => (trip.id === existing.id ? { ...draft, id: existing.id } : trip))
      : [draft, ...saved];
    remember(next);
    setJustSaved(true);
  }

  function openSaved(trip: SavedTrip) {
    setOrigin(trip.origin);
    setDestination(trip.destination);
    setDeparture(trip.departureLocal);
    setLoad(trip.load);
    setSample(asSample(trip.sample));
    setPlan(trip.plan);
    setSelectedId(trip.selectedId ?? trip.plan.recommended_route_id);
    setError(null);
    setHeatmap(null);
    setHeatmapError(null);
    setDetailOpen(false);
    setSection("plan");
    const id = requestId.current + 1;
    requestId.current = id;
    const weight = Number(trip.load);
    if (Number.isFinite(weight) && weight > 0) void loadHeatmap(id, weight, trip.plan.routes);
  }

  function removeSaved(id: string) {
    remember(saved.filter((trip) => trip.id !== id));
  }

  const fastestId = plan
    ? plan.routes.reduce((best, route) => (route.duration_seconds < best.duration_seconds ? route : best)).id
    : null;
  const shownRoutes = useMemo(() => {
    if (!plan) return [];
    const routes = [...plan.routes];
    if (routeSort === "risk") {
      routes.sort((a, b) =>
        a.risk_summary.no_travel_miles - b.risk_summary.no_travel_miles
        || a.risk_summary.severe_miles - b.risk_summary.severe_miles
        || a.risk_summary.high_miles - b.risk_summary.high_miles
        || a.risk_summary.average_risk - b.risk_summary.average_risk
        || a.duration_seconds - b.duration_seconds,
      );
    }
    if (routeSort === "time") routes.sort((a, b) => a.duration_seconds - b.duration_seconds);
    if (routeSort === "distance") routes.sort((a, b) => a.distance_miles - b.distance_miles);
    return routes;
  }, [plan, routeSort]);

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" aria-label="Back to home" onClick={onHome}>
          <img src="/mark.png?v=2" alt="Colby Weather-Aware Truck Routing" />
          <span>
            Weather-Aware
            <br />
            Truck Routing
          </span>
        </button>
        <nav className="main-nav" aria-label="Primary">
          <button
            type="button"
            className={section === "plan" ? "nav-item active" : "nav-item"}
            onClick={() => setSection("plan")}
          >
            Plan route
          </button>
          <button
            type="button"
            className={section === "saved" ? "nav-item active" : "nav-item"}
            onClick={() => setSection("saved")}
          >
            Saved routes
          </button>
          <button
            type="button"
            className={section === "weather" ? "nav-item active" : "nav-item"}
            onClick={() => setSection("weather")}
          >
            Weather
          </button>
          <button
            type="button"
            className={section === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => setSection("settings")}
          >
            Settings
          </button>
        </nav>
        <div className="top-actions">
          <button type="button" className="theme" onClick={() => setGuideOpen(true)}>
            How to use
          </button>
          <button type="button" className="theme" aria-pressed={dark} onClick={() => setDark((value) => !value)}>
            {dark ? "Light" : "Dark"}
          </button>
        </div>
      </header>
      {guideOpen && <HowToGuide onClose={() => setGuideOpen(false)} />}
      <div className="workspace">
      <aside className="sidebar">
        <div className="side-switch">
          <button type="button" className={section === "plan" ? "chip on" : "chip"} onClick={() => setSection("plan")}>
            Plan
          </button>
          <button type="button" className={section === "saved" ? "chip on" : "chip"} onClick={() => setSection("saved")}>
            Saved{saved.length ? ` (${saved.length})` : ""}
          </button>
          <button type="button" className={section === "weather" ? "chip on" : "chip"} onClick={() => setSection("weather")}>
            Weather
          </button>
          <button type="button" className={section === "settings" ? "chip on" : "chip"} onClick={() => setSection("settings")}>
            Settings
          </button>
        </div>
        {section === "saved" ? (
          <section className="block saved-panel" id="saved">
            <div className="section-head">
              <h2>Saved routes ({saved.length})</h2>
              <button type="button" className="ghost" onClick={() => setSection("plan")}>
                Plan route
              </button>
            </div>
            {saved.length === 0 ? (
              <p className="hint">No saved trips yet. Plan a route, then choose Save trip.</p>
            ) : (
              <div className="cards saved-list">
                {saved.map((trip) => {
                  const recommended = trip.plan.routes.find((route) => route.id === trip.plan.recommended_route_id);
                  return (
                    <article key={trip.id} className="saved-card">
                      <strong>
                        {trip.origin} → {trip.destination}
                      </strong>
                      <span>
                        {formatWhen(trip.plan.departure)} · {Number(trip.load).toLocaleString()} lb · every {trip.sample} mi
                      </span>
                      {recommended && (
                        <span>
                          {recommended.label} · {recommended.risk_summary.average_label} · {recommended.duration_label}
                        </span>
                      )}
                      <span className="saved-actions">
                        <button type="button" className="primary saved-open" onClick={() => openSaved(trip)}>
                          Open
                        </button>
                        <button type="button" className="ghost" onClick={() => removeSaved(trip.id)}>
                          Remove
                        </button>
                      </span>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : section === "weather" ? (
          <WeatherPanel
            plan={plan}
            route={selected}
            heatmap={heatmap}
            heatmapLoading={heatmapLoading}
            onSelect={setSelectedId}
            onBack={() => setSection("plan")}
          />
        ) : section === "settings" ? (
          <SettingsPanel
            dark={dark}
            onDark={setDark}
            load={load}
            onLoad={setLoad}
            sample={sample}
            onSample={(value) => setSample(asSample(value))}
            routeSort={routeSort}
            onSort={setRouteSort}
            timelineOpen={timelineOpen}
            onTimeline={setTimelineOpen}
            heatmapOn={heatmapOn}
            onHeatmap={setHeatmapOn}
            speed={playbackSpeed}
            onSpeed={setPlaybackSpeed}
            savedCount={saved.length}
            onClearSaved={() => remember([])}
            onBack={() => setSection("plan")}
          />
        ) : (
        <>
        <form className="trip" id="plan" onSubmit={onSubmit}>
          <h2>Route planning</h2>
          <PlaceField label="From" value={origin} placeholder="Chicago, IL" onChange={setOrigin} />
          <PlaceField label="To" value={destination} placeholder="St. Louis, MO" onChange={setDestination} />
          <label>
            Departure time
            <input type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} />
          </label>
          <p className="hint">Weather is for the ETA at each stop.</p>
          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Loading routes…" : "Find routes"}
          </button>
          {error && <p className="banner" role="alert">{error}</p>}
          <details className="advanced">
            <summary>Advanced options</summary>
            <div className="presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setOrigin(preset.origin);
                    setDestination(preset.destination);
                    setLoad(preset.load);
                    setSample(asSample(preset.sample));
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="split">
              <label>
                Load weight (lb)
                <input inputMode="decimal" value={load} onChange={(event) => setLoad(event.target.value)} />
              </label>
              <label>
                Sample every
                <select value={sample} onChange={(event) => setSample(asSample(Number(event.target.value)))}>
                  <option value={10}>10 miles</option>
                  <option value={25}>25 miles</option>
                  <option value={50}>50 miles</option>
                </select>
              </label>
            </div>
          </details>
        </form>

        {plan && (
          <>
            <section className="block" id="routes">
              <div className="section-head">
                <h2>Route options ({plan.routes.length})</h2>
                <button type="button" className="ghost" onClick={saveCurrentTrip}>
                  {justSaved ? "Saved" : "Save trip"}
                </button>
              </div>
              <label className="sort-line">
                Sort by
                <select value={routeSort} onChange={(event) => setRouteSort(event.target.value as RouteSort)}>
                  <option value="risk">Total risk</option>
                  <option value="time">Drive time</option>
                  <option value="distance">Distance</option>
                </select>
              </label>
              <p className="recommend">{plan.recommendation}</p>
              {plan.routing_note && <p className="banner">{plan.routing_note}</p>}
              {plan.forecast_note && <p className="banner">{plan.forecast_note}</p>}
              {plan.routes.length < 3 && (
                <p className="hint">Found {plan.routes.length} route{plan.routes.length === 1 ? "" : "s"}.</p>
              )}
            </section>

            <div className="cards">
                {shownRoutes.map((route) => {
                  const level = levelForLabel(route.risk_summary.average_label);
                  return (
                  <button
                    key={route.id}
                    type="button"
                    className={route.id === selectedId ? "card selected" : "card"}
                    onClick={() => setSelectedId(route.id)}
                  >
                    <span className="card-top">
                      <strong>{route.label}</strong>
                      {route.recommended && <em>Lowest risk</em>}
                      {!route.recommended && route.id === fastestId && <em className="alt">Faster</em>}
                    </span>
                    <span className="card-meta">
                      <span>
                        <MetaIcon kind="pin" />
                        {Math.round(route.distance_miles).toLocaleString()} mi
                      </span>
                      <span>
                        <MetaIcon kind="clock" />
                        {route.duration_label}
                      </span>
                    </span>
                    <span className="card-risk">
                      <span>Weather risk</span>
                      <strong style={{ color: RISK_COLOR[level] }}>{RISK_LABEL[level]}</strong>
                      <span className={`score-pill ${level}`}>{route.risk_summary.average_risk.toFixed(1)}</span>
                    </span>
                  </button>
                  );
                })}
              </div>
          </>
        )}
        </>
        )}

      </aside>
      <div className={timelineOpen ? "map-column" : "map-column timeline-hidden"}>
      <MapView
        routes={plan?.routes ?? []}
        selectedId={selectedId}
        onSelect={setSelectedId}
        origin={plan?.origin ?? null}
        destination={plan?.destination ?? null}
        planning={loading}
        heatmap={heatmap}
        heatmapLoading={heatmapLoading}
        heatmapError={heatmapError}
        timelineOpen={timelineOpen}
        onTimelineOpen={setTimelineOpen}
        heatmapOn={heatmapOn}
        onHeatmapOn={setHeatmapOn}
        playbackSpeed={playbackSpeed}
        onPlaybackSpeed={setPlaybackSpeed}
        departure={plan?.departure ?? null}
      />
      {plan && selected && detailOpen && <RouteDetail plan={plan} route={selected} onClose={() => setDetailOpen(false)} />}
      {plan && selected && !detailOpen && (
        <button type="button" className="details-dock" id="details" onClick={() => setDetailOpen(true)}>
          <span className="details-dock-copy">
            <strong>{selected.label}</strong>
            <span>
              {selected.distance_miles.toFixed(0)} mi · {selected.duration_label} · {selected.risk_summary.average_label}
            </span>
          </span>
          <span className="details-dock-action">Route details</span>
        </button>
      )}
      </div>
      </div>
      <nav className="phone-nav" aria-label="Sections">
        <button type="button" onClick={() => jumpTo("plan")}>Plan</button>
        <button type="button" onClick={() => jumpTo("routes")}>Routes</button>
        <button type="button" onClick={() => jumpTo("map")}>Map</button>
        <button type="button" onClick={() => setDetailOpen(true)}>Details</button>
      </nav>
    </div>
  );
}

function HowToGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="guide-backdrop" onMouseDown={onClose}>
      <section
        className="guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="guide-head">
          <h2 id="how-to-title">How to use</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <ol className="guide-steps">
          <li>Enter From and To. After two letters, pick a suggested place, or type a city and state.</li>
          <li>Set the departure time. Each stop uses the forecast for when the truck is expected there.</li>
          <li>Open Advanced options for load weight and sample spacing: every 10, 25, or 50 miles.</li>
          <li>Choose Find routes. Up to three roads are compared.</li>
          <li>
            The recommended road has the fewest no-travel miles, then fewest severe, then fewest high, then the lowest
            average risk, then the shortest time.
          </li>
          <li>Select a route to read its checkpoints. Move the 0–48 hour slider to recolor the corridor. The slider does not send a new request.</li>
          <li>Save the comparison and open it again from Saved routes.</li>
        </ol>
        <h3>How risk is scored</h3>
        <p className="hint">A checkpoint takes the worst of wind, rain, and snow. A value on a shared boundary uses the higher band.</p>
        <ul className="guide-bands">
          <li>
            <strong>Wind</strong>
            <span>Low under 25 mph · Moderate 25–34 · High 35–44 · Severe 45–54 · No Travel at 55 or more</span>
          </li>
          <li>
            <strong>Rain</strong>
            <span>Low under 0.10 in/hr · Moderate 0.10–0.25 · High 0.25–0.50 · Severe 0.50–1.00 · No Travel over 1.00</span>
          </li>
          <li>
            <strong>Snow</strong>
            <span>Low under 0.5 in/hr · Moderate 0.5–1.0 · High 1.0–2.0 · Severe 2.0–3.0 · No Travel over 3.0</span>
          </li>
        </ul>
        <h3>Load changes the wind band</h3>
        <ul className="guide-load">
          <li>55 mph or more is No Travel for any load.</li>
          <li>45–54 mph is No Travel above 30,000 lb. Exactly 30,000 lb stays Severe.</li>
          <li>35–44 mph is Severe above 40,000 lb. Exactly 40,000 lb stays High.</li>
          <li>Miles between two checkpoints use the worse of the two ends.</li>
        </ul>
      </section>
    </div>
  );
}

function SettingsPanel({
  dark,
  onDark,
  load,
  onLoad,
  sample,
  onSample,
  routeSort,
  onSort,
  timelineOpen,
  onTimeline,
  heatmapOn,
  onHeatmap,
  speed,
  onSpeed,
  savedCount,
  onClearSaved,
  onBack,
}: {
  dark: boolean;
  onDark: (dark: boolean) => void;
  load: string;
  onLoad: (load: string) => void;
  sample: number;
  onSample: (sample: number) => void;
  routeSort: RouteSort;
  onSort: (sort: RouteSort) => void;
  timelineOpen: boolean;
  onTimeline: (open: boolean) => void;
  heatmapOn: boolean;
  onHeatmap: (on: boolean) => void;
  speed: 1 | 2;
  onSpeed: (speed: 1 | 2) => void;
  savedCount: number;
  onClearSaved: () => void;
  onBack: () => void;
}) {
  return (
    <section className="block saved-panel" id="settings">
      <div className="section-head">
        <h2>Settings</h2>
        <button type="button" className="ghost" onClick={onBack}>
          Plan route
        </button>
      </div>
      <div className="settings-list">
        <label>
          Appearance
          <select value={dark ? "dark" : "light"} onChange={(event) => onDark(event.target.value === "dark")}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label>
          Load weight (lb)
          <input inputMode="decimal" value={load} onChange={(event) => onLoad(event.target.value)} />
        </label>
        <label>
          Sample every
          <select value={sample} onChange={(event) => onSample(Number(event.target.value))}>
            <option value={10}>10 miles</option>
            <option value={25}>25 miles</option>
            <option value={50}>50 miles</option>
          </select>
        </label>
        <label>
          Sort routes by
          <select value={routeSort} onChange={(event) => onSort(event.target.value as RouteSort)}>
            <option value="risk">Total risk</option>
            <option value="time">Drive time</option>
            <option value="distance">Distance</option>
          </select>
        </label>
        <label className="check-line">
          <input type="checkbox" checked={timelineOpen} onChange={(event) => onTimeline(event.target.checked)} />
          Show the hour slider
        </label>
        <label className="check-line">
          <input type="checkbox" checked={heatmapOn} onChange={(event) => onHeatmap(event.target.checked)} />
          Show the corridor heatmap
        </label>
        <label>
          Playback speed
          <select value={speed} onChange={(event) => onSpeed(event.target.value === "2" ? 2 : 1)}>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
      </div>
      <p className="hint">Load weight and sample interval are used the next time you find routes. The choices stay on this browser.</p>
      <button
        type="button"
        className="ghost settings-clear"
        disabled={savedCount === 0}
        onClick={() => {
          if (savedCount > 0 && window.confirm("Remove every saved trip from this browser?")) onClearSaved();
        }}
      >
        Clear saved routes{savedCount ? ` (${savedCount})` : ""}
      </button>
    </section>
  );
}

function WeatherPanel({
  plan,
  route,
  heatmap,
  heatmapLoading,
  onSelect,
  onBack,
}: {
  plan: PlanResponse | null;
  route: RoutePlan | null;
  heatmap: HeatmapResponse | null;
  heatmapLoading: boolean;
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="block saved-panel" id="weather">
      <div className="section-head">
        <h2>Weather</h2>
        <button type="button" className="ghost" onClick={onBack}>
          Plan route
        </button>
      </div>
      {!plan || !route ? (
        <p className="hint">Find routes to see wind, rain, and snow at each stop.</p>
      ) : (
        <>
          <p className="hint">
            {plan.origin.query} → {plan.destination.query}. Each stop uses the forecast at the truck’s ETA, every{" "}
            {plan.sample_miles} miles.
          </p>
          <div className="weather-routes">
            {plan.routes.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === route.id ? "chip on" : "chip"}
                onClick={() => onSelect(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="recommend">
            {route.label}: {route.risk_summary.average_label} · score {route.risk_summary.average_risk.toFixed(1)}
          </p>
          {heatmapLoading && <p className="hint">Loading the 48-hour corridor forecast.</p>}
          {heatmap && (
            <p className="hint">
              The map corridor starts {formatWhen(heatmap.start_time)} and covers {heatmap.hours} hours.
            </p>
          )}
          {plan.forecast_note && <p className="banner">{plan.forecast_note}</p>}
          <div>
            {route.checkpoints.map((stop, index) => {
              const place =
                index === 0
                  ? plan.origin.query
                  : index === route.checkpoints.length - 1
                    ? plan.destination.query
                    : `Mile ${Math.round(stop.mile)}`;
              return (
                <article key={`${stop.mile}-${index}`} className="weather-stop">
                  <div className="weather-stop-top">
                    <strong>{place}</strong>
                    <span
                      className="pill"
                      style={{
                        background: RISK_COLOR[stop.level],
                        color: stop.level === "moderate" ? "#1c2430" : "#fff",
                      }}
                    >
                      {RISK_LABEL[stop.level]}
                    </span>
                  </div>
                  <p>
                    {formatClock(stop.eta)} · {weatherPhrase(stop)}
                  </p>
                  <p className="weather-nums">
                    Wind {stop.wind_mph.toFixed(0)} mph · Rain {stop.rain_in_hr.toFixed(2)} in/hr · Snow{" "}
                    {stop.snow_in_hr.toFixed(2)} in/hr
                    {stop.load_rule_applied ? " · Load rule" : ""}
                    {stop.forecast_outside_window ? " · Outside the 7-day forecast" : ""}
                  </p>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function jumpTo(id: string) {
  const node = document.getElementById(id) ?? document.getElementById("plan");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function levelForLabel(label: string): RiskLevel {
  const match = (Object.keys(RISK_LABEL) as RiskLevel[]).find((key) => RISK_LABEL[key] === label);
  return match ?? "low";
}

function MetaIcon({ kind }: { kind: "pin" | "clock" }) {
  if (kind === "clock") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14.2S3.2 9.4 3.2 6.4a4.8 4.8 0 1 1 9.6 0c0 3-4.8 7.8-4.8 7.8z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="6.3" r="1.5" fill="currentColor" />
    </svg>
  );
}

function defaultDeparture(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
