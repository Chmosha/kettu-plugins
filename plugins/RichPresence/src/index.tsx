import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher, React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";

let activeIntervals: Record<string, any> = {};
let activeQuestId: string | null = null;
let uiUpdate: (() => void) | null = null;

function refreshUI() {
    if (uiUpdate) {
        try {
            uiUpdate();
        } catch (e) {}
    }
}

function getModules() {
    const QuestsStore = findByStoreName("QuestsStore");
    const RunningGameStore = findByStoreName("RunningGameStore");
    const apiMod =
        findByProps("getAPIBaseURL", "post") ||
        findByProps("HTTP") ||
        findByProps("get", "post", "put");
    const RestAPI = apiMod?.HTTP ?? apiMod;
    return { QuestsStore, RunningGameStore, RestAPI };
}

function stopQuest(questId: string) {
    if (activeIntervals[questId]) {
        clearInterval(activeIntervals[questId]);
        delete activeIntervals[questId];
    }
    if (activeQuestId === questId) {
        activeQuestId = null;
    }
    try {
        const { RunningGameStore } = getModules();
        if (RunningGameStore && FluxDispatcher) {
            FluxDispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                removed: [],
                added: [],
                games: []
            });
        }
    } catch (e) {}
    showToast("Выполнение остановлено");
    refreshUI();
}

function enrollQuest(questId: string) {
    const { RestAPI } = getModules();
    if (!RestAPI || !RestAPI.post) {
        showToast("Ошибка: не найден модуль RestAPI");
        return;
    }
    RestAPI.post({
        url: "/quests/" + questId + "/enroll",
        body: { location: 11 }
    })
        .then(() => {
            showToast("Квест принят!");
            refreshUI();
        })
        .catch(() => {
            showToast("Примите квест вручную в настройках Discord");
        });
}

function startQuest(quest: any) {
    const { RestAPI, RunningGameStore } = getModules();
    if (!RestAPI || !RestAPI.post) {
        showToast("Ошибка: не найден модуль RestAPI");
        return;
    }

    if (activeQuestId && activeQuestId !== quest.id) {
        stopQuest(activeQuestId);
    }

    const appName =
        quest.config?.messages?.gameTitle ||
        quest.config?.messages?.questName ||
        quest.config?.application?.name ||
        "Quest";
    const appId = quest.config?.application?.id || "0";
    const taskConfig = quest.config?.taskConfig ?? quest.config?.taskConfigV2;
    const taskTypes = [
        "WATCH_VIDEO",
        "PLAY_ON_DESKTOP",
        "PLAY_ACTIVITY",
        "STREAM_ON_DESKTOP",
        "WATCH_VIDEO_ON_MOBILE"
    ];
    const taskName = taskTypes.find((x) => taskConfig?.tasks?.[x] != null);

    if (!taskName) {
        showToast("Неизвестный тип задачи для " + appName);
        return;
    }

    const secondsNeeded = taskConfig.tasks[taskName].target ?? 900;
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    activeQuestId = quest.id;
    refreshUI();
    showToast("Запущен: " + appName);

    // 1. Логика для видео-квестов
    if (taskName.indexOf("WATCH_VIDEO") !== -1) {
        let current = secondsDone;
        activeIntervals[quest.id] = setInterval(() => {
            if (activeQuestId !== quest.id) {
                stopQuest(quest.id);
                return;
            }
            current = Math.min(secondsNeeded, current + 15 + Math.random());
            RestAPI.post({
                url: "/quests/" + quest.id + "/video-progress",
                body: { timestamp: current }
            })
                .then(() => {
                    showToast(appName + ": " + Math.floor(current) + " / " + secondsNeeded + " сек.");
                    refreshUI();
                    if (current >= secondsNeeded) {
                        stopQuest(quest.id);
                        showToast("Видео-квест выполнен!");
                    }
                })
                .catch(() => {
                    stopQuest(quest.id);
                    showToast("Ошибка отправки прогресса видео");
                });
        }, 2000);
        return;
    }

    // 2. Логика для ПК-квестов
    const fakePid = Math.floor(Math.random() * 30000) + 1000;
    const cleanName = String(appName).toLowerCase().replace(/\s+/g, "");
    const fakeGame = {
        cmdLine: "C:\\Program Files\\" + appName + "\\" + cleanName + ".exe",
        exeName: cleanName + ".exe",
        exePath: "c:/program files/" + cleanName + "/" + cleanName + ".exe",
        hidden: false,
        isLauncher: false,
        id: appId,
        name: appName,
        pid: fakePid,
        pidPath: [fakePid],
        processName: appName,
        start: Date.now()
    };

    try {
        if (RunningGameStore && FluxDispatcher) {
            FluxDispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                removed: [],
                added: [fakeGame],
                games: [fakeGame]
            });
        }
    } catch (e) {}

    const sendBeat = (isTerminal: boolean) => {
        RestAPI.post({
            url: "/quests/" + quest.id + "/heartbeat",
            body: {
                stream_key: "call:" + quest.id + ":" + fakePid,
                terminal: isTerminal
            }
        })
            .then((res: any) => {
                secondsDone =
                    res?.body?.progress?.[taskName]?.value ??
                    res?.body?.userStatus?.progress?.[taskName]?.value ??
                    secondsDone + 20;

                showToast(appName + ": " + Math.floor(secondsDone) + " / " + secondsNeeded + " сек.");
                refreshUI();

                if (secondsDone >= secondsNeeded && !isTerminal) {
                    stopQuest(quest.id);
                    RestAPI.post({
                        url: "/quests/" + quest.id + "/heartbeat",
                        body: {
                            stream_key: "call:" + quest.id + ":" + fakePid,
                            terminal: true
                        }
                    });
                    showToast("Квест " + appName + " полностью выполнен!");
                    refreshUI();
                }
            })
            .catch(() => {
                showToast("Ошибка Heartbeat. Остановка.");
                stopQuest(quest.id);
            });
    };

    sendBeat(false);
    activeIntervals[quest.id] = setInterval(() => sendBeat(false), 20000);
}

// Рендер панели настроек через стандартный React.createElement (абсолютно стабильно)
function SettingsPanel() {
    const h = React.createElement;
    const { ScrollView, View, Text, TouchableOpacity } = ReactNative;
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

    React.useEffect(() => {
        uiUpdate = forceUpdate;
        return () => {
            uiUpdate = null;
        };
    }, []);

    const { QuestsStore } = getModules();
    let rawQuests: any[] = [];

    if (QuestsStore && QuestsStore.quests) {
        if (typeof QuestsStore.quests.values === "function") {
            rawQuests = Array.from(QuestsStore.quests.values());
        } else if (Array.isArray(QuestsStore.quests)) {
            rawQuests = QuestsStore.quests;
        } else if (typeof QuestsStore.quests === "object") {
            rawQuests = Object.values(QuestsStore.quests);
        }
    }

    const validQuests = rawQuests.filter((x: any) => {
        const exp = x?.config?.expiresAt ? new Date(x.config.expiresAt).getTime() : Infinity;
        return exp > Date.now();
    });

    const children: any[] = [
        h(
            Text,
            {
                key: "header",
                style: { color: "#ffffff", fontSize: 18, fontWeight: "bold", marginBottom: 12 }
            },
            "Активные квесты Discord (" + validQuests.length + ")"
        )
    ];

    if (validQuests.length === 0) {
        children.push(
            h(
                View,
                {
                    key: "empty",
                    style: { backgroundColor: "rgba(255,255,255,0.06)", padding: 14, borderRadius: 10 }
                },
                h(
                    Text,
                    { style: { color: "#b5bac1", fontSize: 14 } },
                    "Квесты не загружены. Откройте раздел Quests (Склад подарков) в настройках Discord, чтобы они подгрузились, и вернитесь сюда."
                )
            )
        );
    } else {
        validQuests.forEach((quest: any) => {
            const appName =
                quest.config?.messages?.gameTitle ||
                quest.config?.messages?.questName ||
                quest.config?.application?.name ||
                "Квест";
            const isEnrolled = Boolean(quest.userStatus?.enrolledAt);
            const isCompleted = Boolean(quest.userStatus?.completedAt);
            const isRunning = activeQuestId === quest.id;

            const taskConfig = quest.config?.taskConfig ?? quest.config?.taskConfigV2;
            const taskTypes = [
                "WATCH_VIDEO",
                "PLAY_ON_DESKTOP",
                "PLAY_ACTIVITY",
                "STREAM_ON_DESKTOP",
                "WATCH_VIDEO_ON_MOBILE"
            ];
            const taskName = taskTypes.find((x) => taskConfig?.tasks?.[x] != null);
            const target = taskName ? (taskConfig.tasks[taskName].target ?? 1) : 1;
            const progress = taskName ? (quest.userStatus?.progress?.[taskName]?.value ?? 0) : 0;

            const statusText = isCompleted
                ? "Выполнен"
                : isEnrolled
                ? "Прогресс: " + Math.floor(progress) + " / " + target + " сек."
                : "Не принят";

            const cardItems: any[] = [
                h(
                    Text,
                    { key: "t", style: { color: "#ffffff", fontSize: 16, fontWeight: "bold", marginBottom: 4 } },
                    appName
                ),
                h(
                    Text,
                    { key: "s", style: { color: "#b5bac1", fontSize: 13, marginBottom: 10 } },
                    statusText
                )
            ];

            if (!isEnrolled && !isCompleted) {
                cardItems.push(
                    h(
                        TouchableOpacity,
                        {
                            key: "btn-enroll",
                            style: {
                                backgroundColor: "#4e5058",
                                paddingVertical: 10,
                                borderRadius: 6,
                                alignItems: "center"
                            },
                            onPress: () => enrollQuest(quest.id)
                        },
                        h(Text, { style: { color: "#ffffff", fontWeight: "bold" } }, "Принять квест")
                    )
                );
            }

            if (isEnrolled && !isCompleted) {
                cardItems.push(
                    h(
                        TouchableOpacity,
                        {
                            key: "btn-run",
                            style: {
                                backgroundColor: isRunning ? "#da373c" : "#5865f2",
                                paddingVertical: 10,
                                borderRadius: 6,
                                alignItems: "center"
                            },
                            onPress: () => (isRunning ? stopQuest(quest.id) : startQuest(quest))
                        },
                        h(
                            Text,
                            { style: { color: "#ffffff", fontWeight: "bold" } },
                            isRunning ? "Остановить" : "Запустить выполнение"
                        )
                    )
                );
            }

            children.push(
                h(
                    View,
                    {
                        key: String(quest.id),
                        style: {
                            backgroundColor: "rgba(255,255,255,0.06)",
                            borderRadius: 10,
                            padding: 14,
                            marginBottom: 12
                        }
                    },
                    cardItems
                )
            );
        });
    }

    return h(ScrollView, { style: { flex: 1, padding: 14 } }, children);
}

export default {
    onLoad: () => {
        showToast("AutoQuest включен!");
    },
    onUnload: () => {
        Object.keys(activeIntervals).forEach(stopQuest);
    },
    settings: SettingsPanel
};
