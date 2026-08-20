import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  FlatList,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Brain, CheckCircle2 } from 'lucide-react-native';
import { fetchTrivia, TriviaItem } from '../api/content';
import { getDateString, isToday } from '../utils/dailyContent';

const STORAGE_KEY_ENABLED = '@trivia_daily_enabled';
const STORAGE_KEY_HISTORY = '@trivia_history';
const STORAGE_KEY_LAST_GENERATED_DATE = '@trivia_last_generated_date';

const NOTIFICATION_ID = 'trivia-daily-notification';
const NOTIFICATION_CHANNEL_ID = 'trivia-daily';

const TRIVIAS_PER_DAY = 5;
const MAX_HISTORY = 50;

type TriviaHistoryEntry = TriviaItem & {
  id: string;
  fetchedAt: number;
};

export default function TriviaScreen() {
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<TriviaHistoryEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This is NOT state because the UI does not need to react to it.
  // It only prevents two async generation calls from running together.
  const generatingRef = useRef(false);

  const generateIfNeeded = useCallback(async () => {
    if (!enabled || generatingRef.current) {
      return;
    }

    const today = getDateString();

    const lastGeneratedDate = await AsyncStorage.getItem(
      STORAGE_KEY_LAST_GENERATED_DATE
    );

    if (lastGeneratedDate === today) {
      return;
    }

    generatingRef.current = true;
    setIsGenerating(true);
    setError(null);

    try {
      const questions = history.map((item) => item.question);

      const trivias = await fetchTrivia(
        questions,
        TRIVIAS_PER_DAY
      );

      const now = Date.now();

      const newEntries: TriviaHistoryEntry[] = trivias.map(
        (trivia, index) => ({
          ...trivia,
          id: `${now}-${index}`,
          fetchedAt: now,
        })
      );

      const updatedHistory = [
        ...newEntries,
        ...history,
      ].slice(0, MAX_HISTORY);

      setHistory(updatedHistory);

      await AsyncStorage.multiSet([
        [
          STORAGE_KEY_HISTORY,
          JSON.stringify(updatedHistory),
        ],
        [
          STORAGE_KEY_LAST_GENERATED_DATE,
          today,
        ],
      ]);
    } catch (err) {
      console.warn('Failed to generate trivia:', err);
      setError(
        'Could not generate today’s trivias. Please try again later.'
      );
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }, [enabled, history]);

  /*
   * INITIALIZATION
   *
   * Load everything that was persisted from the previous session.
   */
  useEffect(() => {
    async function initialize() {
      try {
        const [storedEnabled, storedHistory] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEY_ENABLED),
            AsyncStorage.getItem(STORAGE_KEY_HISTORY),
          ]);

        if (storedEnabled !== null) {
          setEnabled(JSON.parse(storedEnabled));
        }

        if (storedHistory !== null) {
          setHistory(JSON.parse(storedHistory));
        }
      } catch (err) {
        console.warn('Failed to load trivia data:', err);
      }
    }

    initialize();
  }, []);

  /*
   * GENERATE AFTER INITIALIZATION
   *
   * Once enabled/history have been loaded, this effect runs whenever
   * either changes. The date check inside generateIfNeeded prevents
   * unnecessary generation.
   */
  useEffect(() => {
    if (enabled) {
      generateIfNeeded();
    }
  }, [enabled, generateIfNeeded]);

  /*
   * APP FOREGROUND
   *
   * If the user opens the app after midnight, check whether today's
   * trivia has been generated.
   */
  useEffect(() => {
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active') {
        generateIfNeeded();
      }
    }

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => subscription.remove();
  }, [generateIfNeeded]);

  /*
   * SWITCH + NOTIFICATION
   */
  useEffect(() => {
    AsyncStorage.setItem(
      STORAGE_KEY_ENABLED,
      JSON.stringify(enabled)
    ).catch((err) => {
      console.warn('Failed to save trivia setting:', err);
    });

    async function syncNotification() {
      try {
        await Notifications.cancelScheduledNotificationAsync(
          NOTIFICATION_ID
        );

        if (!enabled) {
          return;
        }

        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();

        let status = existingStatus;

        if (status !== 'granted') {
          const result =
            await Notifications.requestPermissionsAsync();

          status = result.status;
        }

        if (status !== 'granted') {
          console.warn(
            'Notification permission was not granted.'
          );
          return;
        }

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(
            NOTIFICATION_CHANNEL_ID,
            {
              name: 'Daily trivia',
              importance: Notifications.AndroidImportance.DEFAULT,
            }
          );
        }

        await Notifications.scheduleNotificationAsync({
          identifier: NOTIFICATION_ID,
          content: {
            title: 'Trivia time! 🧠',
            body: `Your ${TRIVIAS_PER_DAY} daily trivia questions are ready.`,
            ...(Platform.OS === 'android' && {
              channelId: NOTIFICATION_CHANNEL_ID,
            }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour: 0,
            minute: 0,
            repeats: true,
          },
        });
      } catch (err) {
        console.warn(
          'Failed to sync trivia notification:',
          err
        );
      }
    }

    syncNotification();
  }, [enabled]);

  return (
    <View style={styles.screen}>
      <View style={styles.titleRow}>
        <Brain size={22} color="#2563eb" />

        <Text style={styles.title}>
          Trivia
        </Text>
      </View>

      <Text style={styles.description}>
        Get {TRIVIAS_PER_DAY} trivia questions generated
        automatically every day.
      </Text>

      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>
              Daily dose of trivia
            </Text>

            <Text style={styles.settingDescription}>
              Automatically generate {TRIVIAS_PER_DAY} questions
              once per day.
            </Text>
          </View>

          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{
              false: '#d1d5db',
              true: '#93c5fd',
            }}
            thumbColor={
              enabled ? '#2563eb' : '#f4f3f4'
            }
          />
        </View>
      </View>

      {enabled && (
        <View style={styles.statusRow}>
          {isGenerating ? (
            <>
              <ActivityIndicator
                size="small"
                color="#2563eb"
              />

              <Text style={styles.statusText}>
                Generating today's trivias...
              </Text>
            </>
          ) : (
            <>
              <CheckCircle2
                size={16}
                color="#16a34a"
              />

              <Text style={styles.statusText}>
                Today's trivias are ready
              </Text>
            </>
          )}
        </View>
      )}

      {error && (
        <Text style={styles.error}>
          {error}
        </Text>
      )}

      <Text style={styles.historyTitle}>
        Recent Trivia
      </Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={
          history.length === 0
            ? styles.emptyContainer
            : undefined
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No trivia yet — enable daily trivia above.
          </Text>
        }
        renderItem={({ item }) => {
          const today = isToday(item.fetchedAt);

          return (
            <View
              style={[
                styles.historyItem,
                today && styles.todayItem,
              ]}
            >
              {today && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>
                    TODAY
                  </Text>
                </View>
              )}

              <Text
                style={[
                  styles.question,
                  today && styles.todayQuestion,
                ]}
              >
                {item.question}
              </Text>

              <Text style={styles.answer}>
                {item.answer}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f7f9fc',
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },

  description: {
    fontSize: 16,
    color: '#4b5563',
  },

  settingsCard: {
    marginTop: 28,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },

  settingText: {
    flex: 1,
    paddingRight: 12,
  },

  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },

  settingDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },

  statusRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  statusText: {
    fontSize: 13,
    color: '#4b5563',
  },

  error: {
    color: '#dc2626',
    fontSize: 13,
    marginTop: 8,
  },

  historyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 24,
    marginBottom: 8,
  },

  list: {
    flex: 1,
  },

  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
  },

  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },

  todayItem: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 2,
  },

  todayBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },

  todayBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  question: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },

  todayQuestion: {
    color: '#1e3a8a',
    fontWeight: '700',
  },

  answer: {
    fontSize: 14,
    color: '#4b5563',
  },
});