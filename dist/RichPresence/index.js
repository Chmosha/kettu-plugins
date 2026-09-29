var RichPresence = (function (common, metro, plugin, _vendetta, components, storage) {
  'use strict';

  const { View, ScrollView, TouchableOpacity } = common.ReactNative;
  const { FormText, FormInput, FormRow, FormSwitchRow, FormSection } = components.Forms;
  function Settings() {
    storage.useProxy(plugin.storage);
    const profile = plugin.storage.selections?.[plugin.storage.selected];
    if (!profile) return null;
    const restart = () => {
      try {
        index.onUnload();
        index.onLoad();
      } catch (error) {
        _vendetta.logger.error("[Rich Presence] Failed to refresh", error);
      }
    };
    return /* @__PURE__ */ common.React.createElement(ScrollView, { style: { paddingBottom: 24 } }, /* @__PURE__ */ common.React.createElement(View, { style: { padding: 16 } }, /* @__PURE__ */ common.React.createElement(FormText, { style: { marginBottom: 12 } }, "Configure your custom Rich Presence."), /* @__PURE__ */ common.React.createElement(
      TouchableOpacity,
      {
        style: { backgroundColor: "#5865F2", padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 16 },
        onPress: restart
      },
      /* @__PURE__ */ common.React.createElement(FormText, { style: { color: "white" } }, "Update Presence")
    ), /* @__PURE__ */ common.React.createElement(FormSection, { title: "Basic" }, /* @__PURE__ */ common.React.createElement(FormInput, { title: "Application Name", value: profile.name || "", onChange: (value) => profile.name = value }), /* @__PURE__ */ common.React.createElement(FormInput, { title: "Application ID", value: String(profile.application_id || ""), onChange: (value) => profile.application_id = value, keyboardType: "numeric" }), /* @__PURE__ */ common.React.createElement(FormInput, { title: "Activity Type (0-5)", value: String(profile.type ?? 0), onChange: (value) => profile.type = Number(value), keyboardType: "numeric" }), /* @__PURE__ */ common.React.createElement(FormInput, { title: "Details", value: profile.details || "", onChange: (value) => profile.details = value }), /* @__PURE__ */ common.React.createElement(FormInput, { title: "State", value: profile.state || "", onChange: (value) => profile.state = value })), /* @__PURE__ */ common.React.createElement(FormSection, { title: "Timestamps" }, /* @__PURE__ */ common.React.createElement(FormSwitchRow, { label: "Enable timestamps", value: !!profile.timestamps?._enabled, onValueChange: (value) => {
      profile.timestamps._enabled = value;
      restart();
    } }), /* @__PURE__ */ common.React.createElement(FormSwitchRow, { label: "Real-time timestamp", value: !!profile.timestamps?._realtime, disabled: !profile.timestamps?._enabled, onValueChange: (value) => {
      profile.timestamps._realtime = value;
      restart();
    } }), /* @__PURE__ */ common.React.createElement(FormInput, { title: "Start (ms)", value: String(profile.timestamps?.start ?? ""), disabled: !profile.timestamps?._enabled || !!profile.timestamps?._realtime, onChange: (value) => profile.timestamps.start = Number(value), keyboardType: "numeric" }), /* @__PURE__ */ common.React.createElement(FormInput, { title: "End (ms)", value: String(profile.timestamps?.end ?? ""), disabled: !profile.timestamps?._enabled || !!profile.timestamps?._realtime, onChange: (value) => profile.timestamps.end = Number(value), keyboardType: "numeric" }), /* @__PURE__ */ common.React.createElement(FormRow, { label: "Use current time", subLabel: "Set the current time as the start timestamp", disabled: !profile.timestamps?._enabled || !!profile.timestamps?._realtime, trailing: FormRow.Arrow, onPress: () => {
      profile.timestamps.start = Date.now();
      restart();
    } }), /* @__PURE__ */ common.React.createElement(FormText, { style: { marginLeft: 16, marginTop: 8 } }, "Real-time mode refreshes from your device clock every minute."))));
  }

  function isValid(value) {
    if (value === false || value === 0) return true;
    if (value === null || value === void 0) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }
  function cloneAndFilter(object) {
    const replacer = (key, value) => {
      if (key.startsWith("_")) return void 0;
      return isValid(value) ? value : void 0;
    };
    return JSON.parse(JSON.stringify(object, replacer));
  }

  const assetManager = metro.findByProps("getAssetIds");
  const pluginStartSince = Date.now();
  let realtimeTimer = null;
  let realtimeTimeout = null;
  function createDefaultSelection() {
    return {
      name: "Discord",
      application_id: "1054951789318909972",
      flags: 0,
      type: 0,
      timestamps: { _enabled: false, _realtime: false, start: pluginStartSince },
      assets: {},
      buttons: [{}, {}]
    };
  }
  function ensureStorage() {
    var _a, _b, _c, _d, _e, _f;
    if (!plugin.storage.selected || typeof plugin.storage.selected !== "string") {
      plugin.storage.selected = "default";
    }
    (_a = plugin.storage).selections ?? (_a.selections = {});
    (_b = plugin.storage.selections)[_c = plugin.storage.selected] ?? (_b[_c] = createDefaultSelection());
    const profile = plugin.storage.selections[plugin.storage.selected];
    profile.name ?? (profile.name = "Discord");
    profile.application_id ?? (profile.application_id = "1054951789318909972");
    profile.flags ?? (profile.flags = 0);
    profile.type ?? (profile.type = 0);
    profile.timestamps ?? (profile.timestamps = { _enabled: false, _realtime: false, start: pluginStartSince });
    (_d = profile.timestamps)._enabled ?? (_d._enabled = false);
    (_e = profile.timestamps)._realtime ?? (_e._realtime = false);
    (_f = profile.timestamps).start ?? (_f.start = pluginStartSince);
    profile.assets ?? (profile.assets = {});
    profile.buttons ?? (profile.buttons = [{}, {}]);
  }
  async function sendRequest(input) {
    if (!input) {
      common.FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: null,
        pid: 1608,
        socketId: "RichPresence@Vendetta"
      });
      return;
    }
    const timestampEnabled = !!input.timestamps?._enabled;
    let activity = cloneAndFilter(input);
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
        _vendetta.logger.error("[Rich Presence] Asset lookup failed", error);
      }
    }
    if (Array.isArray(activity.buttons)) {
      activity.buttons = activity.buttons.filter((button) => button?.label);
      if (activity.buttons.length) {
        activity.metadata = {
          button_urls: activity.buttons.map((button) => button.url)
        };
        activity.buttons = activity.buttons.map((button) => button.label);
      } else {
        delete activity.buttons;
      }
    }
    common.FluxDispatcher.dispatch({
      type: "LOCAL_ACTIVITY_UPDATE",
      activity,
      pid: 1608,
      socketId: "RichPresence@Vendetta"
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
    const current = plugin.storage.selections?.[plugin.storage.selected];
    if (!current?.timestamps?._enabled || !current.timestamps?._realtime) return;
    const update = () => {
      const latest = plugin.storage.selections?.[plugin.storage.selected];
      if (!latest?.timestamps?._enabled || !latest.timestamps?._realtime) {
        stopRealtimeTimer();
        return;
      }
      sendRequest(latest).catch(
        (error) => _vendetta.logger.error("[Rich Presence] Realtime update failed", error)
      );
    };
    const delay = 6e4 - Date.now() % 6e4;
    realtimeTimeout = setTimeout(() => {
      update();
      realtimeTimer = setInterval(update, 6e4);
    }, delay);
  }
  ensureStorage();
  var index = {
    onLoad() {
      try {
        ensureStorage();
        const current = plugin.storage.selections?.[plugin.storage.selected];
        if (!current) {
          _vendetta.logger.error("[Rich Presence] No active profile");
          return;
        }
        sendRequest(current).catch(
          (error) => _vendetta.logger.error("[Rich Presence] Failed to load", error)
        );
        startRealtimeTimer();
      } catch (error) {
        _vendetta.logger.error("[Rich Presence] onLoad failed", error);
      }
    },
    onUnload() {
      stopRealtimeTimer();
      try {
        sendRequest(null).catch(
          (error) => _vendetta.logger.error("[Rich Presence] Failed to clear activity", error)
        );
      } catch (error) {
        _vendetta.logger.error("[Rich Presence] onUnload failed", error);
      }
    },
    settings: Settings
  };

  return index;

})(vendetta.metro/common, vendetta.metro, vendetta.plugin, vendetta, vendetta.ui/components, vendetta.storage);
