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

const TRIVIA_NOTIFICATION_ID = 'trivia-daily-notification';
const TRIVIA_CHANNEL_ID = 'trivia-daily';
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

  const generatingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const historyRef = useRef<TriviaHistoryEntry[]>([]);

  const generateIfNeeded = useCallback(async () => {
    if (generatingRef.current) {
      return;
    }

    if (!isInitializedRef.current) {
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
      const currentHistory = historyRef.current;
      const questions = currentHistory.map((item) => item.question);
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
        ...currentHistory,
      ].slice(0, MAX_HISTORY);
      historyRef.current = updatedHistory;
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
      setError('Could not generate today\u2019s trivias. Please try again later.');
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        const [storedEnabled, storedHistory] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ENABLED),
          AsyncStorage.getItem(STORAGE_KEY_HISTORY),
        ]);

        if (storedEnabled !== null) {
          setEnabled(JSON.parse(storedEnabled));
        }

        if (storedHistory !== null) {
          const parsedHistory = JSON.parse(storedHistory);
          historyRef.current = parsedHistory;
          setHistory(parsedHistory);
        }
      } catch (err) {
        console.warn('Failed to load trivia data:', err);
      } finally {
        isInitializedRef.current = true;
        generateIfNeeded();
      }
    }

    initialize();
  }, [generateIfNeeded]);

  useEffect(() => {
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active') {
        generateIfNeeded();
      }
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [generateIfNeeded]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(enabled)).catch((err) => {
      console.warn('Failed to save trivia setting:', err);
    });
  }, [enabled]);

  useEffect(() => {
    const syncNotification = async () => {
      try {
        await Notifications.cancelScheduledNotificationAsync(TRIVIA_NOTIFICATION_ID);
        if (!enabled) return;
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let status = existingStatus;
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') {
          console.warn('Notification permission was not granted.');
          setEnabled(false);
          return;
        }
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(TRIVIA_CHANNEL_ID, {
            name: 'Daily trivia',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
          });
        }
        await Notifications.scheduleNotificationAsync({
          identifier: TRIVIA_NOTIFICATION_ID,
          content: {
            title: 'Trivia time! \ud83e\udde0',
            body: `Your ${TRIVIAS_PER_DAY} daily trivia questions are ready.`,
            ...(Platform.OS === 'android' && { channelId: TRIVIA_CHANNEL_ID }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 0,
            minute: 0,
          }
        });
      } catch (err) {
        console.warn('Failed to sync trivia notification:', err);
      }
    };

    syncNotification();
  }, [enabled]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.titleRow}>
        <Brain size={22} color="#2563eb" />
        <Text style={styles.screenTitle}>Trivia</Text>
      </View>
      <Text style={styles.screenDescription}>
        Get {TRIVIAS_PER_DAY} trivia questions generated automatically every day.
      </Text>

      <View style={styles.settingsSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelContainer}>
            <Text style={styles.settingLabel}>Daily trivia notification</Text>
            <Text style={styles.settingSubtext}>
              Get notified when today's {TRIVIAS_PER_DAY} questions are ready.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
            thumbColor={enabled ? '#2563eb' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.statusRow}>
        {isGenerating ? (
          <>
            <ActivityIndicator color="#2563eb" size="small" />
            <Text style={styles.statusText}>Generating today's trivias</Text>
          </>
        ) : (
          <>
            <CheckCircle2 size={16} color="#16a34a" />
            <Text style={styles.statusText}>Today's trivias are ready</Text>
          </>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.historyTitle}>Recent Trivia</Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.historyList}
        contentContainerStyle={history.length === 0 && styles.historyEmptyContainer}
        ListEmptyComponent={
          <Text style={styles.historyEmptyText}>
            No trivia yet — check back soon.
          </Text>
        }
        renderItem={({ item }) => {
          const isNew = isToday(item.fetchedAt);
          return (
            <View style={[styles.historyItem, isNew && styles.historyItemToday]}>
              {isNew && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>TODAY</Text>
                </View>
              )}
              <Text style={[styles.historyQuestion, isNew && styles.historyQuestionToday]}>
                {item.question}
              </Text>
              <Text style={styles.historyAnswer}>{item.answer}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f7f9fc',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  screenDescription: {
    fontSize: 16,
    color: '#4b5563',
  },
  settingsSection: {
    marginTop: 28,
    backgroundColor: '#ffffff',
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
  settingLabelContainer: {
    flex: 1,
    paddingRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  settingSubtext: {
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
  errorText: {
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
  historyList: {
    flex: 1,
  },
  historyEmptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  historyEmptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 14,
  },
  historyItem: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  historyItemToday: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
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
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  historyQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  historyQuestionToday: {
    color: '#1e3a8a',
    fontWeight: '700',
  },
  historyAnswer: {
    fontSize: 14,
    color: '#4b5563',
  },
});