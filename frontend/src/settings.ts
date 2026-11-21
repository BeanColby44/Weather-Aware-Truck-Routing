const KEY = "app-settings";

export type RouteSort = "risk" | "time" | "distance";

export type AppSettings = {
  load: string;
  sample: 10 | 25 | 50;
  routeSort: RouteSort;
  timelineOpen: boolean;
  heatmapOn: boolean;
  playbackSpeed: 1 | 2;
};

const DEFAULTS: AppSettings = {
  load: "42000",
  sample: 25,
  routeSort: "risk",
  timelineOpen: true,
  heatmapOn: true,
  playbackSpeed: 1,
};

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      load: typeof parsed.load === "string" && parsed.load.trim() ? parsed.load : DEFAULTS.load,
      sample: parsed.sample === 10 || parsed.sample === 50 ? parsed.sample : 25,
      routeSort: parsed.routeSort === "time" || parsed.routeSort === "distance" ? parsed.routeSort : "risk",
      timelineOpen: typeof parsed.timelineOpen === "boolean" ? parsed.timelineOpen : true,
      heatmapOn: typeof parsed.heatmapOn === "boolean" ? parsed.heatmapOn : true,
      playbackSpeed: parsed.playbackSpeed === 2 ? 2 : 1,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeSettings(settings: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
