import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import type { Checkpoint, HeatmapResponse, Place, RoutePlan } from "../types";
import { RISK_COLOR, RISK_LABEL, ROUTE_COLOR, formatWhen, weatherPhrase } from "../format";
import RiskProfile from "../RiskProfile";
import { geometryMiles, mileAtLatLng, pointAtMile, routePositions } from "../lines";

type MapViewProps = {
  routes: RoutePlan[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  origin: Place | null;
  destination: Place | null;
  planning: boolean;
  heatmap: HeatmapResponse | null;
  heatmapLoading: boolean;
  heatmapError: string | null;
  timelineOpen: boolean;
  onTimelineOpen: (open: boolean) => void;
  heatmapOn: boolean;
  onHeatmapOn: (on: boolean) => void;
  playbackSpeed: 1 | 2;
  onPlaybackSpeed: (speed: 1 | 2) => void;
  departure: string | null;
};

type RoutePick = {
  lat: number;
  lon: number;
  mile: number;
  bearing: number;
  eta: string;
  checkpoint: Checkpoint;
};

const US_CENTER: [number, number] = [39.8, -98.6];

export default function MapView(props: MapViewProps) {
  const [routesOpen, setRoutesOpen] = useState(true);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<RoutePick | null>(null);
  const selectedRoute = props.routes.find((route) => route.id === props.selectedId) ?? null;
  const followHour = useCallback((update: number | ((current: number) => number)) => {
    setPicked(null);
    setHour(update);
  }, []);
  const setPlayingFromBar = useCallback((next: boolean) => {
    if (next) setPicked(null);
    setPlaying(next);
  }, []);

  function choosePoint(routeId: string, lat: number, lon: number) {
    props.onSelect(routeId);
    const route = props.routes.find((item) => item.id === routeId);
    if (!route || !props.departure || !route.checkpoints.length) return;
    const mile = mileAtLatLng(route, lat, lon);
    const point = pointAtMile(route, mile);
    const length = geometryMiles(route);
    const fraction = length <= 0 ? 0 : Math.min(1, point.mile / length);
    const etaMs = new Date(props.departure).getTime() + route.duration_seconds * 1000 * fraction;
    const checkpoint = route.checkpoints.reduce((best, item) =>
      Math.abs(item.mile - point.mile) < Math.abs(best.mile - point.mile) ? item : best,
    );
    setPlaying(false);
    setPicked({
      lat: point.lat,
      lon: point.lon,
      mile: point.mile,
      bearing: point.bearing,
      eta: new Date(etaMs).toISOString(),
      checkpoint,
    });
    if (props.heatmap) {
      const index = Math.round((etaMs - new Date(props.heatmap.start_time).getTime()) / 3_600_000);
      if (index >= 0 && index <= 48) setHour(index);
    }
  }

  return (
    <div className="map-wrap" id="map">
      <MapContainer center={US_CENTER} zoom={4} zoomControl={false} className="map">
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoutes routes={props.routes} />
        <ResizeMap />
        {props.routes
          .map((route, index) => ({ route, index }))
          .sort((a, b) => Number(a.route.id === props.selectedId) - Number(b.route.id === props.selectedId))
          .map(({ route, index }) => (
          <RouteLayer
            key={route.id}
            route={route}
            color={ROUTE_COLOR[index % ROUTE_COLOR.length]}
            selected={route.id === props.selectedId}
            onSelect={props.onSelect}
            onPick={choosePoint}
          />
        ))}
        {props.origin && <EndPin place={props.origin} kind="start" />}
        {props.destination && <EndPin place={props.destination} kind="end" />}
        {selectedRoute && props.departure && (
          <TruckMarker
            route={selectedRoute}
            departure={props.departure}
            forecastStart={props.heatmap?.start_time ?? null}
            hour={hour}
            picked={picked}
          />
        )}
        <ForecastOverlay
          heatmap={props.heatmap}
          planning={props.planning}
          loading={props.heatmapLoading}
          error={props.heatmapError}
          open={props.timelineOpen}
          onOpenChange={props.onTimelineOpen}
          heatmapOn={props.heatmapOn}
          onHeatmapOn={props.onHeatmapOn}
          speed={props.playbackSpeed}
          onSpeed={props.onPlaybackSpeed}
          hour={hour}
          onHour={followHour}
          playing={playing}
          onPlaying={setPlayingFromBar}
        />
      </MapContainer>
      {!props.routes.length && !props.planning && (
        <div className="map-empty">
          <p>Search for a trip to see routes here.</p>
        </div>
      )}
      {(props.planning || props.heatmapLoading) && (
        <div className="load-card" role="status">
          <h2>{props.planning ? "Finding routes" : "Loading the 48-hour forecast"}</h2>
          <p>
            {props.planning
              ? "Checking roads, then the weather at each stop."
              : "Sampling the corridor for the next 48 hours."}
          </p>
          <div className="load-track" aria-hidden="true">
            <span className={props.planning ? "load-bar" : "load-bar late"} />
          </div>
          <ul className="load-steps">
            <li className={props.planning ? "active" : "done"}>Routes and stop weather</li>
            <li className={props.heatmapLoading ? "active" : ""}>48-hour forecast</li>
          </ul>
        </div>
      )}
      <div className="legend-card">
        <p>Weather risk</p>
        <ul className="legend" aria-label="Risk colors">
          {(Object.keys(RISK_LABEL) as (keyof typeof RISK_LABEL)[]).map((level) => (
            <li key={level}>
              <span style={{ background: RISK_COLOR[level] }} />
              {RISK_LABEL[level]}
            </li>
          ))}
        </ul>
      </div>
      {props.routes.length > 0 && routesOpen && (
        <aside className="compare-card">
          <div className="panel-head">
            <p>Route comparison</p>
            <button type="button" className="icon-btn" aria-label="Hide route comparison" onClick={() => setRoutesOpen(false)}>
              <IconClose />
            </button>
          </div>
          {props.routes.map((route, index) => (
            <button
              key={route.id}
              type="button"
              className={route.id === props.selectedId ? "compare-row selected" : "compare-row"}
              onClick={() => props.onSelect(route.id)}
            >
              <i className="swatch" style={{ background: ROUTE_COLOR[index % ROUTE_COLOR.length] }} />
              <span className="compare-copy">
                <strong>{route.label}</strong>
                <span>
                  {route.distance_miles.toFixed(0)} mi · {route.duration_label}
                </span>
                <RiskProfile segments={route.segments} />
              </span>
              <span className="score">
                <strong>{route.risk_summary.average_risk.toFixed(1)}</strong>
                <small>{route.risk_summary.average_label}</small>
              </span>
            </button>
          ))}
        </aside>
      )}
      {props.routes.length > 0 && !routesOpen && (
        <button type="button" className="dock-btn compare-dock" aria-label="Show route comparison" onClick={() => setRoutesOpen(true)}>
          <IconRoutes />
        </button>
      )}
    </div>
  );
}

function EndPin({ place, kind }: { place: Place; kind: "start" | "end" }) {
  const name = shortPlace(place.query || place.label);
  const icon = useMemo(() => endpointIcon(kind, name), [kind, name]);
  return (
    <Marker
      position={[place.lat, place.lon]}
      icon={icon}
      title={kind === "start" ? `Start, ${name}` : `End, ${name}`}
      zIndexOffset={900}
    />
  );
}

function shortPlace(name: string): string {
  const part = name.split(",")[0]?.trim();
  return part || name;
}

function endpointIcon(kind: "start" | "end", name: string) {
  const color = kind === "start" ? "#1faf6a" : "#e23d3d";
  const safe = name.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
  return L.divIcon({
    className: "endpoint-icon",
    html: `<span class="endpoint"><svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path d="M16 40.5C16 40.5 29 24.5 29 15.2A13 13 0 1 0 3 15.2C3 24.5 16 40.5 16 40.5Z" fill="${color}" stroke="#ffffff" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="#ffffff"/></svg><span class="pin-label">${safe}</span></span>`,
    iconSize: [160, 42],
    iconAnchor: [16, 40],
  });
}

function FitRoutes({ routes }: { routes: RoutePlan[] }) {
  const map = useMap();
  const signature = routes.map((route) => route.id).join("|");
  useEffect(() => {
    if (!routes.length) return;
    const bounds = L.latLngBounds(
      routes.flatMap((route) => route.geometry.coordinates.map((pair) => L.latLng(pair[1], pair[0]))),
    );
    if (!bounds.isValid()) return;
    const short = map.getContainer().clientHeight < 640;
    map.fitBounds(bounds, {
      paddingTopLeft: [56, short ? 80 : 48],
      paddingBottomRight: [88, short ? 136 : 72],
      maxZoom: 9,
    });
  }, [map, signature, routes]);
  return null;
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function RouteLayer({
  route,
  color,
  selected,
  onSelect,
  onPick,
}: {
  route: RoutePlan;
  color: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onPick: (routeId: string, lat: number, lon: number) => void;
}) {
  const outline = useMemo(() => routePositions(route), [route]);
  const pick = (lat: number, lon: number) => {
    onSelect(route.id);
    onPick(route.id, lat, lon);
  };

  return (
    <>
      <Polyline
        positions={outline}
        pathOptions={{
          color: "#ffffff",
          weight: selected ? 10 : 6,
          opacity: 0.9,
        }}
      />
      <Polyline
        positions={outline}
        pathOptions={{
          color,
          weight: selected ? 6 : 4,
          opacity: selected ? 1 : 0.9,
        }}
      />
      <Polyline
        positions={outline}
        pathOptions={{ color, weight: 18, opacity: 0 }}
        eventHandlers={{ click: (event) => pick(event.latlng.lat, event.latlng.lng) }}
      />
      {route.checkpoints.map((checkpoint) => (
        <CircleMarker
          key={`${route.id}-${checkpoint.mile}`}
          center={[checkpoint.lat, checkpoint.lon]}
          radius={selected ? 7 : 4}
          pathOptions={{
            color: "#fffdf8",
            weight: 2,
            fillColor: RISK_COLOR[checkpoint.level],
            fillOpacity: selected ? 1 : 0.75,
          }}
          eventHandlers={{ click: () => pick(checkpoint.lat, checkpoint.lon) }}
        />
      ))}
    </>
  );
}

function TruckMarker({
  route,
  departure,
  forecastStart,
  hour,
  picked,
}: {
  route: RoutePlan;
  departure: string;
  forecastStart: string | null;
  hour: number;
  picked: RoutePick | null;
}) {
  const spot = useMemo(() => {
    if (picked) return { ...picked, label: `Mile ${Math.round(picked.mile)}` };
    return positionForHour(route, departure, forecastStart, hour);
  }, [route, departure, forecastStart, hour, picked]);
  const checkpoint = picked?.checkpoint ?? nearestCheckpoint(route, spot.mile);
  const icon = useMemo(
    () => truckIcon(Math.round(spot.bearing), spot.label),
    [spot.bearing, spot.label],
  );
  const markerRef = useRef<L.Marker>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    if (picked) marker.openPopup();
    else marker.closePopup();
  }, [picked, spot.lat, spot.lon]);

  return (
    <Marker
      ref={markerRef}
      position={[spot.lat, spot.lon]}
      icon={icon}
      zIndexOffset={1200}
      title={`Truck, ${spot.label}`}
    >
      <Popup autoPan={false}>
        <strong>
          Mile {spot.mile.toFixed(0)} · {route.label}
        </strong>
        <br />
        ETA {formatWhen(spot.eta)}
        <br />
        {weatherPhrase(checkpoint)}
        {Math.abs(checkpoint.mile - spot.mile) > 1 && <> · sampled at mile {checkpoint.mile.toFixed(0)}</>}
        <br />
        Wind {checkpoint.wind_mph.toFixed(0)} mph · Rain {checkpoint.rain_in_hr.toFixed(2)} in/hr · Snow{" "}
        {checkpoint.snow_in_hr.toFixed(2)} in/hr
        <br />
        Risk: {RISK_LABEL[checkpoint.level]}
        {checkpoint.load_rule_applied && " · Load rule"}
        <br />
        {checkpoint.reason}
      </Popup>
    </Marker>
  );
}

function positionForHour(route: RoutePlan, departure: string, forecastStart: string | null, hour: number) {
  const length = geometryMiles(route);
  const depart = new Date(departure).getTime();
  const duration = route.duration_seconds * 1000;
  const time = forecastStart ? new Date(forecastStart).getTime() + hour * 3_600_000 : depart;
  let mile = 0;
  if (duration > 0 && time > depart) {
    mile = time >= depart + duration ? length : length * ((time - depart) / duration);
  }
  const point = pointAtMile(route, mile);
  const fraction = length <= 0 ? 0 : point.mile / length;
  let label = `Mile ${Math.round(point.mile)}`;
  if (time < depart) label = "Start";
  else if (duration > 0 && time >= depart + duration) label = "Arrived";
  return { ...point, eta: new Date(depart + duration * fraction).toISOString(), label };
}

function nearestCheckpoint(route: RoutePlan, mile: number): Checkpoint {
  return route.checkpoints.reduce((best, item) =>
    Math.abs(item.mile - mile) < Math.abs(best.mile - mile) ? item : best,
  );
}

function truckIcon(bearing: number, label: string) {
  const safe = label.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
  return L.divIcon({
    className: "truck-icon",
    iconSize: [150, 32],
    iconAnchor: [16, 16],
    html: `<span class="truck-mark"><span class="truck-glyph" style="transform:rotate(${bearing}deg)"><svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect x="11" y="3" width="10" height="9" rx="2" fill="#2477F2" stroke="#fff" stroke-width="1.4"/><rect x="8" y="12" width="16" height="15" rx="2" fill="#19283D" stroke="#fff" stroke-width="1.4"/><rect x="13" y="5" width="2.4" height="3" fill="#d7e6ff"/><rect x="16.6" y="5" width="2.4" height="3" fill="#d7e6ff"/></svg></span><span class="truck-label">${safe}</span></span>`,
  });
}

type HeatCanvas = L.Layer & { setHour: (hour: number) => void };

function ForecastOverlay({
  heatmap,
  planning,
  loading,
  error,
  open,
  onOpenChange,
  heatmapOn,
  onHeatmapOn,
  speed,
  onSpeed,
  hour,
  onHour,
  playing,
  onPlaying,
}: {
  heatmap: HeatmapResponse | null;
  planning: boolean;
  loading: boolean;
  error: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heatmapOn: boolean;
  onHeatmapOn: (on: boolean) => void;
  speed: 1 | 2;
  onSpeed: (speed: 1 | 2) => void;
  hour: number;
  onHour: (update: number | ((current: number) => number)) => void;
  playing: boolean;
  onPlaying: (playing: boolean) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onHour(0);
    onPlaying(false);
  }, [heatmap, onHour, onPlaying]);

  useEffect(() => {
    if (!playing || !open || !heatmap) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      onHour((current) => (current >= 48 ? 0 : current + 1));
    }, speed === 2 ? 500 : 1000);
    const onHide = () => {
      if (document.hidden) onPlaying(false);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [playing, open, heatmap, speed, onHour, onPlaying]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // The control sits inside the map. Without this, a drag on the thumb pans the map
    // and the range input never receives the move.
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.disableScrollPropagation(bar);
  }, [open]);

  const label = heatmap
    ? formatWhen(new Date(new Date(heatmap.start_time).getTime() + hour * 3600_000).toISOString())
    : "";

  return (
    <>
      {heatmapOn && heatmap && <HeatCanvasLayer points={heatmap.points} hour={hour} />}
      {open ? (
        <div className="forecast-bar" ref={barRef}>
          <div className="forecast-head">
            <h2>48-hour forecast</h2>
            <div className="forecast-actions">
              <button type="button" className="ghost" onClick={() => onHeatmapOn(!heatmapOn)} disabled={!heatmap}>
                {heatmapOn ? "Hide heatmap" : "Show heatmap"}
              </button>
              <button type="button" className="icon-btn" aria-label="Hide hour slider" onClick={() => { onPlaying(false); onOpenChange(false); }}>
                <IconClose />
              </button>
            </div>
          </div>
          <p className="forecast-status">
            {planning && "Finding routes…"}
            {!planning && loading && "Loading forecast…"}
            {!planning && !loading && error && error}
            {!planning && !loading && !error && !heatmap && "Search for a trip to load the forecast."}
            {!planning && !loading && !error && heatmap && (heatmapOn ? label : "Heatmap is off.")}
          </p>
          <div className="timeline-row">
            <button
              type="button"
              className="play-btn"
              aria-label={playing ? "Pause forecast" : "Play forecast"}
              disabled={!heatmap}
              onClick={() => {
                if (!playing) onHeatmapOn(true);
                onPlaying(!playing);
              }}
            >
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <label className="slider-label">
              <span>Hour {hour}</span>
              <input
                type="range"
                min={0}
                max={48}
                step={1}
                value={hour}
                aria-label="Forecast hour"
                disabled={!heatmap}
                onChange={(event) => {
                  onHour(Number(event.target.value));
                  onHeatmapOn(true);
                  onPlaying(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Home") {
                    event.preventDefault();
                    onHour(0);
                    onHeatmapOn(true);
                  }
                  if (event.key === "End") {
                    event.preventDefault();
                    onHour(48);
                    onHeatmapOn(true);
                  }
                }}
              />
              <span>+48h</span>
            </label>
            <select
              className="speed"
              aria-label="Playback speed"
              value={speed}
              disabled={!heatmap}
              onChange={(event) => onSpeed(Number(event.target.value) === 2 ? 2 : 1)}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
            </select>
          </div>
          <div className="ticks" aria-hidden="true">
            <span>0</span>
            <span>12</span>
            <span>24</span>
            <span>36</span>
            <span>48</span>
          </div>
        </div>
      ) : (
        <div className="forecast-dock" ref={barRef}>
          <button type="button" className="dock-btn" aria-label="Show hour slider" onClick={() => onOpenChange(true)}>
            <IconSlider />
          </button>
        </div>
      )}
    </>
  );
}

function HeatCanvasLayer({ points, hour }: { points: HeatmapResponse["points"]; hour: number }) {
  const map = useMap();
  const layerRef = useRef<HeatCanvas | null>(null);

  useEffect(() => {
    const layer = createHeatLayer(points) as HeatCanvas;
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, points]);

  useEffect(() => {
    layerRef.current?.setHour(hour);
  }, [hour]);

  return null;
}

const FORECAST_FADE_MS = 200;

function createHeatLayer(points: HeatmapResponse["points"]) {
  const Heat = L.Layer.extend({
    initialize(this: HeatInternal) {
      this._points = points;
      this._toHour = 0;
      this._blend = 1;
      this._frame = 0;
      this._buffer = document.createElement("canvas");
    },
    onAdd(this: HeatInternal, map: L.Map) {
      this._map = map;
      this._canvas = L.DomUtil.create("canvas", "forecast-canvas") as HTMLCanvasElement;
      map.getPanes().overlayPane?.appendChild(this._canvas);
      this._onViewChange = () => {
        this._blend = 1;
        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = 0;
        this._paint();
      };
      map.on("move zoom resize", this._onViewChange);
      this._paint();
    },
    onRemove(this: HeatInternal, map: L.Map) {
      if (this._frame) cancelAnimationFrame(this._frame);
      map.off("move zoom resize", this._onViewChange);
      this._canvas.remove();
    },
    setHour(this: HeatInternal, hour: number) {
      if (!this._canvas) {
        this._toHour = hour;
        return;
      }
      if (hour === this._toHour && this._blend >= 1) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        this._toHour = hour;
        this._blend = 1;
        this._hasBuffer = false;
        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = 0;
        this._paint();
        return;
      }
      this._copyFrame();
      this._toHour = hour;
      this._blend = 0;
      const started = performance.now();
      if (this._frame) cancelAnimationFrame(this._frame);
      const step = (now: number) => {
        this._blend = Math.min(1, (now - started) / FORECAST_FADE_MS);
        this._paint();
        if (this._blend < 1) this._frame = requestAnimationFrame(step);
        else this._frame = 0;
      };
      this._frame = requestAnimationFrame(step);
    },
    _copyFrame(this: HeatInternal) {
      const canvas = this._canvas;
      if (!canvas.width || !canvas.height) return;
      this._buffer.width = canvas.width;
      this._buffer.height = canvas.height;
      this._buffer.getContext("2d")?.drawImage(canvas, 0, 0);
      this._hasBuffer = true;
    },
    _paint(this: HeatInternal) {
      const map = this._map;
      const size = map.getSize();
      const dpr = window.devicePixelRatio || 1;
      const canvas = this._canvas;
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      paintHour(ctx, map, this._points, this._toHour);
      if (this._hasBuffer && this._blend < 1) {
        const eased = 1 - (1 - this._blend) ** 3;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - eased;
        ctx.drawImage(this._buffer, 0, 0);
        ctx.globalAlpha = 1;
      }
    },
  });
  return new Heat();
}

function paintHour(
  ctx: CanvasRenderingContext2D,
  map: L.Map,
  points: HeatmapResponse["points"],
  hour: number,
) {
  const radius = corridorRadius(map);
  for (const point of points) {
    const level = point.risks[hour] ?? "low";
    const color = RISK_COLOR[level];
    const pt = map.latLngToContainerPoint([point.lat, point.lon]);
    const gradient = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
    gradient.addColorStop(0, hexAlpha(color, 0.42));
    gradient.addColorStop(0.45, hexAlpha(color, 0.2));
    gradient.addColorStop(1, hexAlpha(color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

type HeatInternal = L.Layer & {
  _map: L.Map;
  _canvas: HTMLCanvasElement;
  _buffer: HTMLCanvasElement;
  _points: HeatmapResponse["points"];
  _toHour: number;
  _blend: number;
  _frame: number;
  _hasBuffer: boolean;
  _onViewChange: () => void;
  _copyFrame: () => void;
  _paint: () => void;
};

function corridorRadius(map: L.Map): number {
  const center = map.getCenter();
  const north = L.latLng(center.lat + 18 / 69, center.lng);
  const here = map.latLngToContainerPoint(center);
  const there = map.latLngToContainerPoint(north);
  return Math.max(26, Math.abs(here.y - there.y));
}

function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5v9l8-4.5-8-4.5z" fill="currentColor" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 3.5h2.2v9H4.5zm4.8 0h2.2v9H9.3z" fill="currentColor" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4 4 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconSlider() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 9h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="11" cy="9" r="2.2" fill="currentColor" />
    </svg>
  );
}

function IconRoutes() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M4 5h10M4 9h10M4 13h7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
