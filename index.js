(function (exports, vendetta) {
  "use strict";

  const { after } = vendetta.patcher;
  const { findByName, findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const { Animated } = ReactNative;

  let unpatches = [];

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

  // Discord часто переименовывает внутренний модуль, который рендерит
  // строку сообщения, поэтому вместо одного жёсткого имени перебираем
  // несколько известных вариантов.
  const NAME_CANDIDATES = ["ChatRow", "RowManager", "MessageContent", "MessageItem", "Message"];
  // Запасной поиск по набору характерных свойств, если ни одно имя не подошло.
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

  const plugin = {
    onLoad() {
      unpatches = [];
      const rowModule = resolveRowModule();

      if (!rowModule) {
        log(
          "не удалось найти модуль строки сообщения — ни одно из известных имён не подошло. " +
            "Анимации работать не будут, пока плагин не обновят под текущую версию Discord."
        );
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
            } else {
              log("сообщение не извлечено из пропсов, анимация пропущена", args?.[0]);
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
    },
  };

  exports.default = plugin;
  Object.defineProperty(exports, "__esModule", { value: true });
  return exports;
})({}, vendetta);
