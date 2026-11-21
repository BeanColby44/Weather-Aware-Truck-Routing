import { useState } from "react";
import { RISK_COLOR, RISK_LABEL, formatClock, weatherPhrase } from "../format";
import RiskProfile from "../RiskProfile";
import type { PlanResponse, RoutePlan } from "../types";

type Tab = "overview" | "waypoints" | "weather";

export default function RouteDetail({
  plan,
  route,
  onClose,
}: {
  plan: PlanResponse;
  route: RoutePlan;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("waypoints");
  const hours = route.duration_seconds / 3600;
  const avgMph = hours > 0 ? Math.round(route.distance_miles / hours) : 0;

  return (
    <section className="detail-panel" id="details">
      <header className="detail-head">
        <div>
          <h2>
            {route.label}
            {route.recommended && <em>Lowest risk</em>}
          </h2>
          <p>
            {route.distance_miles.toFixed(0)} mi · {route.duration_label} · Avg {avgMph} mph
          </p>
        </div>
        <span className="score">
          <strong>{route.risk_summary.average_risk.toFixed(1)}</strong>
          <small>{route.risk_summary.average_label}</small>
        </span>
        <button type="button" className="icon-btn" aria-label="Hide route details" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button type="button" role="tab" aria-selected={tab === "waypoints"} onClick={() => setTab("waypoints")}>
          Waypoints ({route.checkpoints.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === "weather"} onClick={() => setTab("weather")}>
          Weather
        </button>
      </div>
      {tab === "overview" && (
        <div className="detail-body">
          <RiskProfile segments={route.segments} />
          <p className="hint">
            Sampled every {plan.sample_miles} miles. Each stop uses the forecast at the truck’s ETA. The bar is the
            miles in each risk band.
          </p>
          <p className="miles">
            <span>No travel {route.risk_summary.no_travel_miles.toFixed(0)} mi</span>
            <span>Severe {route.risk_summary.severe_miles.toFixed(0)} mi</span>
            <span>High {route.risk_summary.high_miles.toFixed(0)} mi</span>
            <span>Moderate {route.risk_summary.moderate_miles.toFixed(0)} mi</span>
            <span>Low {route.risk_summary.low_miles.toFixed(0)} mi</span>
          </p>
        </div>
      )}
      {tab === "waypoints" && (
        <div className="table-wrap detail-table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Location</th>
                <th>ETA</th>
                <th>Weather</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {route.checkpoints.map((checkpoint, index) => {
                const place =
                  index === 0
                    ? plan.origin.query
                    : index === route.checkpoints.length - 1
                      ? plan.destination.query
                      : `Mile ${checkpoint.mile.toFixed(0)}`;
                return (
                  <tr key={checkpoint.mile}>
                    <td>{index + 1}</td>
                    <td>
                      <strong>{place}</strong>
                      <small>
                        Mile {checkpoint.mile.toFixed(0)} · {checkpoint.lat.toFixed(2)}, {checkpoint.lon.toFixed(2)}
                      </small>
                    </td>
                    <td>{formatClock(checkpoint.eta)}</td>
                    <td>
                      {weatherPhrase(checkpoint)}
                      <small>
                        Wind {checkpoint.wind_mph.toFixed(0)} mph · Rain {checkpoint.rain_in_hr.toFixed(2)} · Snow{" "}
                        {checkpoint.snow_in_hr.toFixed(2)}
                      </small>
                    </td>
                    <td>
                      <span
                        className="pill"
                        style={{
                          background: RISK_COLOR[checkpoint.level],
                          color: checkpoint.level === "moderate" ? "#1c2430" : "#fff",
                        }}
                      >
                        {RISK_LABEL[checkpoint.level]}
                      </span>
                      {checkpoint.load_rule_applied && <span className="tag">Load rule</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === "weather" && (
        <div className="table-wrap detail-table">
          <table>
            <thead>
              <tr>
                <th>Mile</th>
                <th>ETA</th>
                <th>Wind</th>
                <th>Rain</th>
                <th>Snow</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {route.checkpoints.map((checkpoint) => (
                <tr key={checkpoint.mile}>
                  <td>{checkpoint.mile.toFixed(0)}</td>
                  <td>{formatClock(checkpoint.eta)}</td>
                  <td>
                    {checkpoint.wind_mph.toFixed(0)} mph
                    <small>{RISK_LABEL[checkpoint.wind_level]}</small>
                  </td>
                  <td>
                    {checkpoint.rain_in_hr.toFixed(2)} in/hr
                    <small>{RISK_LABEL[checkpoint.rain_level]}</small>
                  </td>
                  <td>
                    {checkpoint.snow_in_hr.toFixed(2)} in/hr
                    <small>{RISK_LABEL[checkpoint.snow_level]}</small>
                  </td>
                  <td>
                    {RISK_LABEL[checkpoint.level]}
                    <small>{checkpoint.reason}</small>
                    {checkpoint.forecast_outside_window && <small>Outside the 7-day forecast.</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
