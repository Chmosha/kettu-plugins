import { FluxDispatcher } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { logger } from "@vendetta";
import Settings from "./Settings";
import { cloneAndFilter } from "./utils";

const assetManager = findByProps("getAssetIds");
const pluginStartSince = Date.now();
let realtimeTimer: ReturnType<typeof setInterval> | null = null;
let realtimeTimeout: ReturnType<typeof setTimeout> | null = null;

function createDefaultSelection() {
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

function ensureStorage() {
  if (!storage.selected || typeof storage.selected !== "string") {
    storage.selected = "default";
  }

  storage.selections ??= {};
  storage.selections[storage.selected] ??= createDefaultSelection();

  const profile = storage.selections[storage.selected];
  profile.name ??= "Discord";
  profile.application_id ??= "1054951789318909972";
  profile.flags ??= 0;
  profile.type ??= 0;
  profile.timestamps ??= { _enabled: false, _realtime: false, start: pluginStartSince };
  profile.timestamps._enabled ??= false;
  profile.timestamps._realtime ??= false;
  profile.timestamps.start ??= pluginStartSince;
  profile.assets ??= {};
  profile.buttons ??= [{}, {}];
}

async function sendRequest(input: any) {
  if (!input) {
    FluxDispatcher.dispatch({
      type: "LOCAL_ACTIVITY_UPDATE",
      activity: null,
      pid: 1608,
      socketId: "RichPresence@Vendetta",
    });
    return;
  }

  const timestampEnabled = !!input.timestamps?._enabled;
  let activity: any = cloneAndFilter(input);

  if (timestampEnabled) {
    if (typeof activity.timestamps.start !== "number") {
      activity.timestamps.start = pluginStartSince;
    }
    if (typeof activity.timestamps.end !== "number" || activity.timestamps.end <= 0) {
      delete activity.timestamps.end;
    }
    if (!Object.keys(activity.timestamps).length) {
      delete activity.timestamps;
    }
  } else {
    delete activity.timestamps;
  }

  if (activity.assets && assetManager) {
    try {
      const images = [activity.assets.large_image, activity.assets.small_image];
      let ids = assetManager.getAssetIds?.(activity.application_id, images) || [];
      if (!ids.length && assetManager.fetchAssetIds) {
        ids = await assetManager.fetchAssetIds(activity.application_id, images);
      }
      if (ids[0]) activity.assets.large_image = ids[0];
      if (ids[1]) activity.assets.small_image = ids[1];
    } catch (error) {
      logger.error("[Rich Presence] Asset lookup failed", error);
    }
  }

  if (Array.isArray(activity.buttons)) {
    activity.buttons = activity.buttons.filter((button: any) => button?.label);
    if (activity.buttons.length) {
      activity.metadata = {
        button_urls: activity.buttons.map((button: any) => button.url),
      };
      activity.buttons = activity.buttons.map((button: any) => button.label);
    } else {
      delete activity.buttons;
    }
  }

  FluxDispatcher.dispatch({
    type: "LOCAL_ACTIVITY_UPDATE",
    activity,
    pid: 1608,
    socketId: "RichPresence@Vendetta",
  });
}

function stopRealtimeTimer() {
  if (realtimeTimeout !== null) clearTimeout(realtimeTimeout);
  if (realtimeTimer !== null) clearInterval(realtimeTimer);
  realtimeTimeout = null;
  realtimeTimer = null;
}

function startRealtimeTimer() {
  stopRealtimeTimer();

  const current = storage.selections?.[storage.selected];
  if (!current?.timestamps?._enabled || !current.timestamps?._realtime) return;

  const update = () => {
    const latest = storage.selections?.[storage.selected];
    if (!latest?.timestamps?._enabled || !latest.timestamps?._realtime) {
      stopRealtimeTimer();
      return;
    }

    sendRequest(latest).catch((error) =>
      logger.error("[Rich Presence] Realtime update failed", error)
    );
  };

  const delay = 60000 - (Date.now() % 60000);
  realtimeTimeout = setTimeout(() => {
    update();
    realtimeTimer = setInterval(update, 60000);
  }, delay);
}

ensureStorage();

export default {
  onLoad() {
    try {
      ensureStorage();
      const current = storage.selections?.[storage.selected];

      if (!current) {
        logger.error("[Rich Presence] No active profile");
        return;
      }

      sendRequest(current).catch((error) =>
        logger.error("[Rich Presence] Failed to load", error)
      );
      startRealtimeTimer();
    } catch (error) {
      logger.error("[Rich Presence] onLoad failed", error);
    }
  },

  onUnload() {
    stopRealtimeTimer();

    try {
      sendRequest(null).catch((error) =>
        logger.error("[Rich Presence] Failed to clear activity", error)
      );
    } catch (error) {
      logger.error("[Rich Presence] onUnload failed", error);
    }
  },

  settings: Settings,
};