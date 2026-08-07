(function (exports, vendetta) {
  "use strict";

  const { after } = vendetta.patcher;
  const { findByName, findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const { Animated } = ReactNative;

  let unpatches = [];
  const restoreFns = [];
  const seenComponents = new Set();

  function log(...args) {
    try {
      console.log("[MessageAnimations]", ...args);
    } catch {}
  }

  const AnimatedMessage = function ({ original, messageId }) {
    const value = React.useRef(new Animated.Value(0)).current;
    React.useEffect(function () {
      value.setValue(0);
      Animated.spring(value, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }, [messageId]);
    const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
    return React.createElement(
      Animated.View,
      { style: { opacity: value, transform: [{ translateY }], width: "100%" } },
      original
    );
  };

  const NAME_CANDIDATES = ["ChatRow", "RowManager", "MessageContent", "MessageItem", "Message"];
  const PROP_CANDIDATES = [["renderMessage"], ["default", "generate"]];

  function resolveRowModule() {
    for (const name of NAME_CANDIDATES) {
      try {
        const mod = findByName(name);
        if (mod && typeof mod.default === "function") {
          log(`найден модуль по имени "${name}"`);
          return mod;
        }
      } catch (e) {
        log(`ошибка при поиске "${name}"`, e);
      }
    }
    for (const props of PROP_CANDIDATES) {
      try {
        const mod = findByProps(...props);
        if (mod && typeof mod.default === "function") {
          log(`найден модуль по свойствам [${props.join(", ")}]`);
          return mod;
        }
      } catch (e) {
        log(`ошибка при поиске по свойствам [${props.join(", ")}]`, e);
      }
    }
    return null;
  }

  function extractMessage(args) {
    const props = (args && args[0]) || {};
    return props.message || props.row?.message || props.item?.message || props.rowMessage;
  }

  // Похоже ли props на что-то, содержащее объект сообщения (id + content/timestamp)?
  function looksLikeMessageProps(props) {
    if (!props || typeof props !== "object") return null;
    for (const key of Object.keys(props)) {
      const val = props[key];
      if (val && typeof val === "object" && typeof val.id !== "undefined") {
        if ("content" in val || "timestamp" in val || "author" in val) {
          return { key, id: val.id };
        }
      }
    }
    return null;
  }

  function reportIfMessage(type, props) {
    try {
      const hit = looksLikeMessageProps(props);
      if (!hit) return;
      const name =
        (type && (type.displayName || type.name)) ||
        (typeof type === "string" ? type : String(type));
      const tag = `${name}::${hit.key}`;
      if (!seenComponents.has(tag)) {
        seenComponents.add(tag);
        log("НАЙДЕН компонент с проп-объектом сообщения:", name, "| проп:", hit.key, "| type:", type);
      }
    } catch {}
  }

  function installDiagnostics() {
    // 1. React.createElement (старый JSX-транспайл)
    const originalCreateElement = React.createElement;
    React.createElement = function (type, props, ...children) {
      reportIfMessage(type, props);
      return originalCreateElement.apply(this, [type, props, ...children]);
    };
    restoreFns.push(() => (React.createElement = originalCreateElement));

    // 2. Новый автоматический JSX-рантайм (jsx/jsxs/jsxDEV), если он есть отдельным модулем
    try {
      const jsxRuntime = findByProps("jsx", "jsxs");
      if (jsxRuntime) {
        for (const fnName of ["jsx", "jsxs", "jsxDEV"]) {
          if (typeof jsxRuntime[fnName] !== "function") continue;
          const original = jsxRuntime[fnName];
          jsxRuntime[fnName] = function (type, props, ...rest) {
            reportIfMessage(type, props);
            return original.apply(this, [type, props, ...rest]);
          };
          restoreFns.push(() => (jsxRuntime[fnName] = original));
        }
        log("jsx-runtime модуль найден и запатчен для диагностики");
      } else {
        log("отдельный jsx-runtime модуль не найден (возможно, используется другой механизм рендера)");
      }
    } catch (e) {
      log("ошибка при поиске jsx-runtime", e);
    }

    log("диагностика запущена — откройте чат, полистайте сообщения и посмотрите логи");
  }

  function removeDiagnostics() {
    for (const restore of restoreFns) {
      try {
        restore();
      } catch {}
    }
    restoreFns.length = 0;
    seenComponents.clear();
  }

  const plugin = {
    onLoad() {
      unpatches = [];
      const rowModule = resolveRowModule();

      if (!rowModule) {
        log(
          "не удалось найти модуль строки сообщения по известным именам. " +
            "Включаю расширенную диагностику (React.createElement + jsx-runtime)."
        );
        installDiagnostics();
        return;
      }

      try {
        const unpatch = after("default", rowModule, (args, returnValue) => {
          try {
            const message = extractMessage(args);
            if (message && message.id && returnValue) {
              return React.createElement(AnimatedMessage, {
                original: returnValue,
                messageId: message.id,
              });
            }
          } catch (e) {
            log("ошибка в колбэке патча", e);
          }
          return returnValue;
        });
        unpatches.push(unpatch);
      } catch (e) {
        log("не удалось запатчить модуль строки сообщения", e);
      }
    },
    onUnload() {
      for (const unpatch of unpatches) {
        if (typeof unpatch === "function") unpatch();
      }
      unpatches = [];
      removeDiagnostics();
    },
  };

  exports.default = plugin;
  Object.defineProperty(exports, "__esModule", { value: true });
  return exports;
})({}, vendetta);
