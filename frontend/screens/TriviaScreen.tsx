import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Switch,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Brain, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fetchTrivia, TriviaItem } from '../api/content'; // adjust path as needed

const STORAGE_KEY_ENABLED = '@trivia_daily_enabled';
const STORAGE_KEY_INTERVAL = '@trivia_interval_hours';
const STORAGE_KEY_HISTORY = '@trivia_history';

const DEFAULT_INTERVAL_HOURS = '12';
const TRIVIA_NOTIFICATION_ID = 'trivia-daily-notification';
const MAX_HISTORY = 20;

type TriviaHistoryEntry = TriviaItem & {
  id: string;
  fetchedAt: number;
};

export default function TriviaScreen() {
  const [dailyTriviaEnabled, setDailyTriviaEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(DEFAULT_INTERVAL_HOURS);
  const [history, setHistory] = useState<TriviaHistoryEntry[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasLoaded = useRef(false);
  const lastValidInterval = useRef(DEFAULT_INTERVAL_HOURS);
  const historyRef = useRef<TriviaHistoryEntry[]>([]);

  // keep a ref in sync so async callbacks always see latest history
  // without needing to be re-created on every history change
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Load persisted settings + history on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedEnabled, storedInterval, storedHistory] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ENABLED),
          AsyncStorage.getItem(STORAGE_KEY_INTERVAL),
          AsyncStorage.getItem(STORAGE_KEY_HISTORY),
        ]);

        if (storedEnabled !== null) {
          setDailyTriviaEnabled(JSON.parse(storedEnabled));
        }
        if (storedInterval !== null) {
          setIntervalHours(storedInterval);
          lastValidInterval.current = storedInterval;
        }
        if (storedHistory !== null) {
          const parsed = JSON.parse(storedHistory);
          setHistory(parsed);
          historyRef.current = parsed;
        }
      } catch (error) {
        console.warn('Failed to load trivia settings:', error);
      } finally {
        hasLoaded.current = true;
      }
    };

    loadSettings();
  }, []);

  // Persist "enabled" whenever the user changes it
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(dailyTriviaEnabled)).catch((error) => {
      console.warn('Failed to save trivia enabled setting:', error);
    });
  }, [dailyTriviaEnabled]);

  // Persist interval whenever the user changes it.
  useEffect(() => {
    if (!hasLoaded.current) return;
    if (intervalHours === '') return;

    lastValidInterval.current = intervalHours;
    AsyncStorage.setItem(STORAGE_KEY_INTERVAL, intervalHours).catch((error) => {
      console.warn('Failed to save trivia interval setting:', error);
    });
  }, [intervalHours]);

  // Fetch a new trivia from the backend, save it into history (capped at 20),
  // and return the new entry so callers (e.g. notification scheduling) can use it.
  const getNewTrivia = async (): Promise<TriviaHistoryEntry | null> => {
    setIsFetching(true);
    setErrorMsg(null);

    try {
      const recentQuestions = historyRef.current.map((item) => item.question);
      const trivia = await fetchTrivia(recentQuestions);

      const entry: TriviaHistoryEntry = {
        id: `${Date.now()}`,
        question: trivia.question,
        answer: trivia.answer,
        fetchedAt: Date.now(),
      };

      const updatedHistory = [entry, ...historyRef.current].slice(0, MAX_HISTORY);
      historyRef.current = updatedHistory;
      setHistory(updatedHistory);

      AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory)).catch((error) => {
        console.warn('Failed to save trivia history:', error);
      });

      return entry;
    } catch (error) {
      console.warn('Failed to fetch trivia:', error);
      setErrorMsg('Could not fetch a new trivia. Please try again.');
      return null;
    } finally {
      setIsFetching(false);
    }
  };

  // Schedule/reschedule the repeating notification whenever the enabled
  // flag or interval changes (after initial load, and skipping the
  // transient empty-string typing state).
  useEffect(() => {
    if (!hasLoaded.current) return;
    if (intervalHours === '') return;

    const syncNotification = async () => {
      // Always clear any existing schedule first, so toggling off or
      // changing the interval doesn't leave a stale notification behind.
      await Notifications.cancelScheduledNotificationAsync(TRIVIA_NOTIFICATION_ID).catch(() => {});

      if (!dailyTriviaEnabled) return;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Notification permission not granted; trivia notifications disabled.');
        return;
      }

      // Fetch a fresh trivia to use as the notification content.
      // Note: because this is a REPEATING local notification, it will keep
      // reusing this same question on every future occurrence — Expo local
      // notifications can't fetch new content each time they fire. To get a
      // genuinely new question every time, you'd need a background fetch task
      // or to reschedule from within the app each time it's opened.
      const entry = await getNewTrivia();
      const seconds = parseInt(intervalHours, 10) * 3600;

      await Notifications.scheduleNotificationAsync({
        identifier: TRIVIA_NOTIFICATION_ID,
        content: {
          title: 'Trivia time! 🧠',
          body: entry?.question ?? 'Which planet in our solar system has the most moons?',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          repeats: true,
        },
      });
    };

    syncNotification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyTriviaEnabled, intervalHours]);

  const handleIntervalChange = (value: string) => {
    if (value === '') {
      setIntervalHours('');
      return;
    }

    if (!/^\d+$/.test(value)) {
      return;
    }

    const numericValue = parseInt(value, 10);
    const clampedValue = Math.min(24, Math.max(1, numericValue));
    setIntervalHours(String(clampedValue));
  };

  const handleIntervalBlur = () => {
    if (intervalHours === '') {
      setIntervalHours(lastValidInterval.current);
    }
  };

  return (
    <View style={styles.screenContainer}>
      <View style={styles.titleRow}>
        <Brain size={22} color="#2563eb" />
        <Text style={styles.screenTitle}>Trivia</Text>
      </View>
      <Text style={styles.screenDescription}>Test your knowledge with daily trivia.</Text>

      <View style={styles.settingsSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelContainer}>
            <Text style={styles.settingLabel}>Daily dose of trivia</Text>
            <Text style={styles.settingSubtext}>Get a trivia question sent to you periodically.</Text>
          </View>
          <Switch
            value={dailyTriviaEnabled}
            onValueChange={setDailyTriviaEnabled}
            trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
            thumbColor={dailyTriviaEnabled ? '#2563eb' : '#f4f3f4'}
          />
        </View>

        {dailyTriviaEnabled && (
          <View style={styles.settingRow}>
            <View style={styles.settingLabelContainer}>
              <Text style={styles.settingLabel}>Notification interval</Text>
              <Text style={styles.settingSubtext}>Every how many hours (1-24)</Text>
            </View>
            <TextInput
              style={styles.intervalInput}
              value={intervalHours}
              onChangeText={handleIntervalChange}
              onBlur={handleIntervalBlur}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.fetchButton}
        onPress={getNewTrivia}
        disabled={isFetching}
      >
        {isFetching ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <>
            <RefreshCw size={16} color="#ffffff" />
            <Text style={styles.fetchButtonText}>Get New Trivia</Text>
          </>
        )}
      </TouchableOpacity>

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <Text style={styles.historyTitle}>Recent Trivia</Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.historyList}
        contentContainerStyle={history.length === 0 && styles.historyEmptyContainer}
        ListEmptyComponent={
          <Text style={styles.historyEmptyText}>
            No trivia yet — tap "Get New Trivia" to fetch one.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.historyItem}>
            <Text style={styles.historyQuestion}>{item.question}</Text>
            <Text style={styles.historyAnswer}>{item.answer}</Text>
          </View>
        )}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
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
  intervalInput: {
    width: 56,
    height: 40,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  fetchButton: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  fetchButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
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
  historyQuestion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  historyAnswer: {
    fontSize: 14,
    color: '#4b5563',
  },
});