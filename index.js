(function (exports, vendetta) {
  "use strict";

  const { after } = vendetta.patcher;
  const { findByName } = vendetta.metro;
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

  const plugin = {
    onLoad() {
      unpatches = [];
      try {
        // ВАЖНО: второй аргумент false — берём "сырой" модуль, а не
        // автоматически развёрнутый .default. RowManager — это класс,
        // рендер происходит в методе prototype.generate, а не в самом
        // классе/конструкторе.
        const rowManagerModule = findByName("RowManager", false);

        if (!rowManagerModule || typeof rowManagerModule.default !== "function") {
          log("RowManager не найден в этой версии Discord — плагин не активирован");
          return;
        }

        const proto = rowManagerModule.default.prototype;
        if (!proto || typeof proto.generate !== "function") {
          log("метод generate не найден на RowManager.prototype — плагин не активирован");
          return;
        }

        const unpatch = after("generate", proto, (args, returnValue) => {
          try {
            const props = args[0] ? args[0] : {};
            const message = props.message;
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
        log("успешно запатчен RowManager.prototype.generate");
      } catch (e) {
        log("не удалось запатчить RowManager", e);
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
