import { FluxDispatcher } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import Settings from "./Settings";
import { cloneAndFilter } from "./utils";

const assetManager = findByProps("getAssetIds");
const pluginStartSince = Date.now();
let realtimeTimer: ReturnType<typeof setInterval> | null = null;

function createDefaultSelection(): Activity {
  return {
    name: "Discord",
    application_id: "1054951789318909972",
    flags: 0,
    type: 0,
    timestamps: { _enabled: false, _realtime: false, start: pluginStartSince },
    assets: {},
    buttons: [{}, {}],
  };
}

if (!storage.selected || typeof storage.selected !== "string") {
  storage.selected = "default";
  storage.selections = { default: createDefaultSelection() };
}

async function sendRequest(activity: Activity | null): Promise<Activity | null> {
  if (activity === null) {
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null, pid: 1608, socketId: "RPC@Reveg" });
    return null;
  }

  const realtime = activity.timestamps?._realtime;
  const enabled = activity.timestamps?._enabled;
  activity = cloneAndFilter(activity);

  if (enabled) {
    if (realtime) activity.timestamps.start = Date.now();
    if (typeof activity.timestamps.end !== "number" || activity.timestamps.end === 0) delete activity.timestamps.end;
  } else {
    delete activity.timestamps;
  }

  if (activity.assets) {
    try {
      const args = [activity.application_id, [activity.assets.large_image, activity.assets.small_image]];
      let ids = assetManager.getAssetIds(...args);
      if (!ids.length) ids = await assetManager.fetchAssetIds(...args);
      activity.assets.large_image = ids[0] ?? activity.assets.large_image;
      activity.assets.small_image = ids[1] ?? activity.assets.small_image;
    } catch (e) { logger.error("[Rich Presence] Asset lookup failed:", e); }
  }

  if (activity.buttons?.length) {
    activity.buttons = activity.buttons.filter(x => x && x.label);
    if (activity.buttons.length) {
      Object.assign(activity, {
        metadata: { button_urls: activity.buttons.map(x => x.url) },
        buttons: activity.buttons.map(x => x.label),
      });
    } else delete activity.buttons;
  } else delete activity.buttons;

  FluxDispatcher.dispatch({
    type: "LOCAL_ACTIVITY_UPDATE",
    activity,
    pid: 1608,
    socketId: "RichPresence@Vendetta",
  });
  return activity;
}

function stopRealtimeTimer() {
  if (realtimeTimer !== null) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
}

function startRealtimeTimer() {
  stopRealtimeTimer();
  const current = storage.selections?.[storage.selected];
  if (!current?.timestamps?._enabled || !current.timestamps?._realtime) return;

  const delay = 60000 - (Date.now() % 60000);
  setTimeout(() => {
    const update = () => {
      const latest = storage.selections?.[storage.selected];
      if (!latest?.timestamps?._enabled || !latest.timestamps?._realtime) return stopRealtimeTimer();
      sendRequest(latest).catch(e => logger.error("[Rich Presence] Realtime update failed:", e));
    };
    update();
    realtimeTimer = setInterval(update, 60000);
  }, delay);
}

export default {
  onLoad() {
    const current = storage.selections?.[storage.selected];
    if (!current) return;
    sendRequest(current).catch(e => logger.error("[Rich Presence] Send failed:", e));
    startRealtimeTimer();
  },
  onUnload() {
    stopRealtimeTimer();
    sendRequest(null);
  },
  settings: Settings,
};
