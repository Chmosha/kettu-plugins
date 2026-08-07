(function (exports, vendetta) {
  "use strict";

  const { after } = vendetta.patcher;
  const { findByName, findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const { Animated } = ReactNative;

  let unpatches = [];
  let originalCreateElement = null;
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

    const translateY = value.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 0],
    });

    return React.createElement(
      Animated.View,
      {
        style: {
          opacity: value,
          transform: [{ translateY }],
          width: "100%",
        },
      },
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
    return (
      props.message ||
      props.row?.message ||
      props.item?.message ||
      props.rowMessage
    );
  }

  // ДИАГНОСТИКА: перехватываем React.createElement и логируем имя ЛЮБОГО
  // компонента, который получает проп message с id. Это покажет реальный
  // компонент строки сообщения в текущей версии Discord, даже если он
  // называется иначе, чем мы предполагали.
  function installDiagnostics() {
    if (originalCreateElement) return;
    originalCreateElement = React.createElement;
    React.createElement = function (type, props, ...children) {
      try {
        const msg = props && (props.message || props.row?.message || props.item?.message);
        if (msg && msg.id) {
          const name =
            (type && (type.displayName || type.name)) ||
            (typeof type === "string" ? type : String(type));
          if (!seenComponents.has(name)) {
            seenComponents.add(name);
            log("НАЙДЕН компонент с проп message:", name, "type:", type);
          }
        }
      } catch {}
      return originalCreateElement.apply(this, [type, props, ...children]);
    };
    log("диагностика запущена — откройте любой чат и посмотрите логи");
  }

  function removeDiagnostics() {
    if (originalCreateElement) {
      React.createElement = originalCreateElement;
      originalCreateElement = null;
    }
    seenComponents.clear();
  }

  const plugin = {
    onLoad() {
      unpatches = [];
      const rowModule = resolveRowModule();

      if (!rowModule) {
        log(
          "не удалось найти модуль строки сообщения по известным именам. " +
            "Включаю диагностику: откройте любой чат и полистайте сообщения — " +
            "в логах появятся реальные имена компонентов, получающих message."
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
