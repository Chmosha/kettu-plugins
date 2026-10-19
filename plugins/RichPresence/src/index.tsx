import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher, React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";

// Глобальное состояние (сохраняется при закрытии настроек)
let activeIntervals: Record<string, any> = {};
let activeQuestId: string | null = null;
let uiUpdateCallback: (() => void) | null = null;

function notifyUI() {
    if (uiUpdateCallback) {
        try {
            uiUpdateCallback();
        } catch {}
    }
}

// Безопасное получение внутренних модулей Discord только в момент вызова
function getModules() {
    const QuestsStore = findByStoreName("QuestsStore");
    const RunningGameStore = findByStoreName("RunningGameStore");
    const apiModule =
        findByProps("getAPIBaseURL", "post") ||
        findByProps("HTTP") ||
        findByProps("get", "post", "put", "patch", "del");
    const RestAPI = apiModule?.HTTP ?? apiModule;

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
    } catch {}
    showToast("Выполнение квеста остановлено.");
    notifyUI();
}

async function enrollQuest(questId: string) {
    const { RestAPI } = getModules();
    if (!RestAPI) {
        showToast("Ошибка: не найден модуль RestAPI.");
        return;
    }
    try {
        await RestAPI.post({
            url: `/quests/${questId}/enroll`,
            body: { location: 11 }
        });
        showToast("Квест принят!");
        notifyUI();
    } catch (e) {
        logger.error("Enroll error:", e);
        showToast("Не удалось принять квест тут. Примите его в меню Discord.");
    }
}

async function startQuest(quest: any) {
    const { RestAPI, RunningGameStore } = getModules();
    if (!RestAPI) {
        showToast("Ошибка: не найден модуль RestAPI.");
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
    const taskName = [
        "WATCH_VIDEO",
        "PLAY_ON_DESKTOP",
        "PLAY_ACTIVITY",
        "STREAM_ON_DESKTOP",
        "WATCH_VIDEO_ON_MOBILE"
    ].find((x) => taskConfig?.tasks?.[x] != null);

    if (!taskName) {
        showToast(`Неизвестный тип задачи для ${appName}`);
        return;
    }

    const secondsNeeded = taskConfig.tasks[taskName].target ?? 900;
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    activeQuestId = quest.id;
    notifyUI();
    showToast(`Запуск: ${appName}`);

    // 1. Логика для видео-квестов
    if (taskName.includes("WATCH_VIDEO")) {
        const step = 15;
        for (let time = secondsDone; time <= secondsNeeded; time += step) {
            if (activeQuestId !== quest.id) break;
            try {
                await RestAPI.post({
                    url: `/quests/${quest.id}/video-progress`,
                    body: { timestamp: Math.min(secondsNeeded, time + Math.random()) }
                });
                notifyUI();
            } catch (err) {
                logger.error("Video progress error:", err);
            }
            await new Promise((r) => setTimeout(r, 1500));
        }
        activeQuestId = null;
        showToast(`Видео-квест "${appName}" завершен!`);
        notifyUI();
        return;
    }

    // 2. Логика для ПК-квестов (PLAY_ON_DESKTOP / PLAY_ACTIVITY)
    const fakePid = Math.floor(Math.random() * 30000) + 1000;
    const cleanName = String(appName).toLowerCase().replace(/\s+/g, "");
    const fakeGame = {
        cmdLine: `C:\\Program Files\\${appName}\\${cleanName}.exe`,
        exeName: `${cleanName}.exe`,
        exePath: `c:/program files/${cleanName}/${cleanName}.exe`,
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
    } catch {}

    const sendHeartbeat = async (isTerminal = false) => {
        try {
            const res = await RestAPI.post({
                url: `/quests/${quest.id}/heartbeat`,
                body: {
                    stream_key: `call:${quest.id}:${fakePid}`,
                    terminal: isTerminal
                }
            });

            secondsDone =
                res?.body?.progress?.[taskName]?.value ??
                res?.body?.userStatus?.progress?.[taskName]?.value ??
                secondsDone + 20;

            showToast(`${appName}: ${Math.floor(secondsDone)} / ${secondsNeeded} сек.`);
            notifyUI();

            if (secondsDone >= secondsNeeded && !isTerminal) {
                stopQuest(quest.id);
                await RestAPI.post({
                    url: `/quests/${quest.id}/heartbeat`,
                    body: {
                        stream_key: `call:${quest.id}:${fakePid}`,
                        terminal: true
                    }
                });
                showToast(`Квест "${appName}" полностью выполнен!`);
                notifyUI();
            }
        } catch (e) {
            logger.error("Heartbeat error:", e);
            showToast("Ошибка отправки Heartbeat. Остановка.");
            stopQuest(quest.id);
        }
    };

    await sendHeartbeat(false);
    activeIntervals[quest.id] = setInterval(() => sendHeartbeat(false), 20000);
}

// Компонент настроек (рендерится только при открытии шестеренки)
function SettingsPanel() {
    const { ScrollView, View, Text, TouchableOpacity } = ReactNative;
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

    React.useEffect(() => {
        uiUpdateCallback = forceUpdate;
        return () => {
            uiUpdateCallback = null;
        };
    }, []);

    const { QuestsStore } = getModules();
    let rawQuests: any[] = [];

    if (QuestsStore?.quests) {
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

    return (
        <ScrollView style={{ flex: 1, padding: 14 }}>
            <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
                Активные квесты Discord ({validQuests.length})
            </Text>

            {validQuests.length === 0 ? (
                <View style={{ backgroundColor: "rgba(255,255,255,0.05)", padding: 16, borderRadius: 10 }}>
                    <Text style={{ color: "#b5bac1", fontSize: 14 }}>
                        Квесты не найдены или еще не прогрузились. Зайдите в раздел «Настройки → Склад подарков / Quests», чтобы Discord загрузил список, затем вернитесь сюда.
                    </Text>
                </View>
            ) : (
                validQuests.map((quest: any) => {
                    const appName =
                        quest.config?.messages?.gameTitle ||
                        quest.config?.messages?.questName ||
                        quest.config?.application?.name ||
                        "Неизвестная игра";
                    const isEnrolled = Boolean(quest.userStatus?.enrolledAt);
                    const isCompleted = Boolean(quest.userStatus?.completedAt);
                    const isRunning = activeQuestId === quest.id;

                    const taskConfig = quest.config?.taskConfig ?? quest.config?.taskConfigV2;
                    const taskName = [
                        "WATCH_VIDEO",
                        "PLAY_ON_DESKTOP",
                        "PLAY_ACTIVITY",
                        "STREAM_ON_DESKTOP",
                        "WATCH_VIDEO_ON_MOBILE"
                    ].find((x) => taskConfig?.tasks?.[x] != null);

                    const target = taskName ? (taskConfig.tasks[taskName].target ?? 1) : 1;
                    const progress = taskName ? (quest.userStatus?.progress?.[taskName]?.value ?? 0) : 0;
                    const percent = Math.min(100, Math.floor((progress / target) * 100));

                    return (
                        <View
                            key={String(quest.id)}
                            style={{
                                backgroundColor: "rgba(255, 255, 255, 0.06)",
                                borderRadius: 10,
                                padding: 14,
                                marginBottom: 12
                            }}
                        >
                            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>
                                {appName}
                            </Text>
                            <Text style={{ color: "#b5bac1", fontSize: 13, marginBottom: 8 }}>
                                {isCompleted
                                    ? "✅ Выполнен"
                                    : isEnrolled
                                    ? `В процессе: ${Math.floor(progress)} / ${target} сек. (${percent}%)`
                                    : "Не принят"}
                            </Text>

                            {!isEnrolled && !isCompleted && (
                                <TouchableOpacity
                                    style={{
                                        backgroundColor: "#4e5058",
                                        paddingVertical: 10,
                                        borderRadius: 6,
                                        alignItems: "center"
                                    }}
                                    onPress={() => enrollQuest(quest.id)}
                                >
                                    <Text style={{ color: "#ffffff", fontWeight: "bold" }}>Принять квест</Text>
                                </TouchableOpacity>
                            )}

                            {isEnrolled && !isCompleted && (
                                <TouchableOpacity
                                    style={{
                                        backgroundColor: isRunning ? "#da373c" : "#5865f2",
                                        paddingVertical: 10,
                                        borderRadius: 6,
                                        alignItems: "center"
                                    }}
                                    onPress={() => (isRunning ? stopQuest(quest.id) : startQuest(quest))}
                                >
                                    <Text style={{ color: "#ffffff", fontWeight: "bold" }}>
                                        {isRunning ? "Остановить" : "Запустить выполнение"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })
            )}
        </ScrollView>
    );
}

export default {
    onLoad: () => {
        logger.log("AutoQuest UI успешно запущен");
    },
    onUnload: () => {
        Object.keys(activeIntervals).forEach(stopQuest);
    },
    settings: SettingsPanel
};
