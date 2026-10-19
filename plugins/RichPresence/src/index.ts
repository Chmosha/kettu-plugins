import { findByStoreName, findByProps } from "@vendetta/metro";
import { FluxDispatcher, React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { Forms } from "@vendetta/ui/components";
import { logger } from "@vendetta";

const { ScrollView, View, Text, TouchableOpacity, StyleSheet } = ReactNative;
const { FormSection, FormRow, FormDivider } = Forms;

const QuestsStore = findByStoreName("QuestsStore");
const RunningGameStore = findByStoreName("RunningGameStore");
const RestAPI = findByProps("get", "post", "put");

// Глобальное состояние для фоновой работы (сохраняется при закрытии меню настроек)
let activeIntervals: Record<string, any> = {};
let activeQuestId: string | null = null;
let uiUpdateCallback: (() => void) | null = null;

function notifyUI() {
    if (uiUpdateCallback) uiUpdateCallback();
}

export function stopQuest(questId: string) {
    if (activeIntervals[questId]) {
        clearInterval(activeIntervals[questId]);
        delete activeIntervals[questId];
    }
    if (activeQuestId === questId) {
        activeQuestId = null;
    }
    if (RunningGameStore) {
        FluxDispatcher.dispatch({
            type: "RUNNING_GAMES_CHANGE",
            removed: [],
            added: [],
            games: []
        });
    }
    showToast("Выполнение квеста остановлено.");
    notifyUI();
}

export async function enrollQuest(questId: string) {
    try {
        await RestAPI.post({
            url: `/quests/${questId}/enroll`,
            body: { location: 11 } // Имитация принятия из настроек
        });
        showToast("Квест успешно принят!");
        notifyUI();
    } catch (e) {
        logger.error("Ошибка принятия квеста:", e);
        showToast("Не удалось принять квест (возможно, требуется Desktop-заголовок).");
    }
}

export async function startQuest(quest: any) {
    if (!RestAPI) {
        showToast("Ошибка: не найден модуль RestAPI.");
        return;
    }

    // Если уже запущен другой квест — останавливаем его
    if (activeQuestId && activeQuestId !== quest.id) {
        stopQuest(activeQuestId);
    }

    const appName = quest.config?.messages?.gameTitle || quest.config?.application?.name || "Квест";
    const appId = quest.config?.application?.id;
    const taskConfig = quest.config?.taskConfig ?? quest.config?.taskConfigV2;
    const taskName = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "PLAY_ACTIVITY", "STREAM_ON_DESKTOP", "WATCH_VIDEO_ON_MOBILE"].find(
        (x) => taskConfig?.tasks?.[x] != null
    );

    if (!taskName) {
        showToast(`Неизвестный тип задачи для ${appName}`);
        return;
    }

    const secondsNeeded = taskConfig.tasks[taskName].target;
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    activeQuestId = quest.id;
    notifyUI();
    showToast(`Запущен квест: ${appName}`);

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
                logger.error("Ошибка видео-прогресса:", err);
            }
            await new Promise((r) => setTimeout(r, 1500));
        }
        activeQuestId = null;
        showToast(`Видео-квест "${appName}" завершен!`);
        notifyUI();
        return;
    }

    // 2. Логика для игровых квестов (PLAY_ON_DESKTOP / PLAY_ACTIVITY)
    const fakePid = Math.floor(Math.random() * 30000) + 1000;
    const fakeGame = {
        cmdLine: `C:\\Program Files\\${appName}\\${appName}.exe`,
        exeName: `${appName.toLowerCase().replace(/\s+/g, "")}.exe`,
        exePath: `c:/program files/${appName.toLowerCase()}/${appName.toLowerCase()}.exe`,
        hidden: false,
        isLauncher: false,
        id: appId,
        name: appName,
        pid: fakePid,
        pidPath: [fakePid],
        processName: appName,
        start: Date.now()
    };

    if (RunningGameStore) {
        FluxDispatcher.dispatch({
            type: "RUNNING_GAMES_CHANGE",
            removed: [],
            added: [fakeGame],
            games: [fakeGame]
        });
    }

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
                showToast(`🎉 Квест "${appName}" полностью выполнен!`);
                notifyUI();
            }
        } catch (e) {
            logger.error("Ошибка Heartbeat:", e);
            showToast("Ошибка отправки сигнала. Остановка.");
            stopQuest(quest.id);
        }
    };

    await sendHeartbeat(false);
    activeIntervals[quest.id] = setInterval(() => sendHeartbeat(false), 20000);
}

// Интерфейс настроек плагина
function SettingsPanel() {
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

    React.useEffect(() => {
        uiUpdateCallback = forceUpdate;
        return () => {
            uiUpdateCallback = null;
        };
    }, []);

    const quests = QuestsStore ? [...QuestsStore.quests.values()] : [];
    // Фильтруем только актуальные (не истекшие) квесты
    const validQuests = quests.filter((x: any) => new Date(x.config?.expiresAt).getTime() > Date.now());

    return (
        <ScrollView style={{ flex: 1, padding: 12 }}>
            <FormSection title="Управление квестами Discord">
                {validQuests.length === 0 ? (
                    <FormRow label="Нет доступных активных квестов в вашем клиенте." />
                ) : (
                    validQuests.map((quest: any) => {
                        const appName = quest.config?.messages?.gameTitle || quest.config?.application?.name || "Неизвестная игра";
                        const rewardName = quest.config?.rewardsConfig?.rewards?.[0]?.messages?.name || "Награда";
                        const isEnrolled = Boolean(quest.userStatus?.enrolledAt);
                        const isCompleted = Boolean(quest.userStatus?.completedAt);
                        const isRunning = activeQuestId === quest.id;

                        const taskConfig = quest.config?.taskConfig ?? quest.config?.taskConfigV2;
                        const taskName = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "PLAY_ACTIVITY", "STREAM_ON_DESKTOP", "WATCH_VIDEO_ON_MOBILE"].find(
                            (x) => taskConfig?.tasks?.[x] != null
                        );
                        const target = taskName ? taskConfig.tasks[taskName].target : 1;
                        const progress = taskName ? (quest.userStatus?.progress?.[taskName]?.value ?? 0) : 0;
                        const percent = Math.min(100, Math.floor((progress / target) * 100));

                        return (
                            <View key={quest.id} style={styles.card}>
                                <Text style={styles.title}>{appName}</Text>
                                <Text style={styles.subtitle}>🎁 Награда: {rewardName}</Text>
                                <Text style={styles.subtitle}>
                                    📊 Статус:{" "}
                                    {isCompleted
                                        ? "✅ Выполнен"
                                        : isEnrolled
                                        ? `В процессе (${Math.floor(progress)} / ${target} сек. — ${percent}%)`
                                        : "Не принят"}
                                </Text>

                                <View style={styles.buttonRow}>
                                    {!isEnrolled && !isCompleted && (
                                        <TouchableOpacity
                                            style={[styles.button, styles.btnEnroll]}
                                            onPress={() => enrollQuest(quest.id)}
                                        >
                                            <Text style={styles.btnText}>Принять квест</Text>
                                        </TouchableOpacity>
                                    )}

                                    {isEnrolled && !isCompleted && (
                                        <TouchableOpacity
                                            style={[styles.button, isRunning ? styles.btnStop : styles.btnStart]}
                                            onPress={() => (isRunning ? stopQuest(quest.id) : startQuest(quest))}
                                        >
                                            <Text style={styles.btnText}>
                                                {isRunning ? "⏹ Остановить" : "▶️ Запустить выполнение"}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        );
                    })
                )}
            </FormSection>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        borderRadius: 10,
        padding: 14,
        marginBottom: 12
    },
    title: {
        color: "#ffffff",
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 4
    },
    subtitle: {
        color: "#b5bac1",
        fontSize: 13,
        marginBottom: 4
    },
    buttonRow: {
        flexDirection: "row",
        marginTop: 10
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        flex: 1
    },
    btnEnroll: {
        backgroundColor: "#4e5058"
    },
    btnStart: {
        backgroundColor: "#5865f2"
    },
    btnStop: {
        backgroundColor: "#da373c"
    },
    btnText: {
        color: "#ffffff",
        fontWeight: "600",
        fontSize: 14
    }
});

export default {
    onLoad: () => {
        logger.log("AutoQuest UI загружен.");
    },
    onUnload: () => {
        Object.keys(activeIntervals).forEach(stopQuest);
    },
    settings: SettingsPanel
};
