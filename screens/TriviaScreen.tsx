import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Switch, TextInput } from 'react-native';
import { Brain } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY_ENABLED = '@trivia_daily_enabled';
const STORAGE_KEY_INTERVAL = '@trivia_interval_hours';

const DEFAULT_INTERVAL_HOURS = '12';
const TRIVIA_NOTIFICATION_ID = 'trivia-daily-notification';

// Dummy trivia content — swap for a real question source later.
const DUMMY_TRIVIA = {
  title: 'Trivia time! 🧠',
  body: 'Which planet in our solar system has the most moons?',
};

export default function TriviaScreen() {
  const [dailyTriviaEnabled, setDailyTriviaEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(DEFAULT_INTERVAL_HOURS);

  const hasLoaded = useRef(false);
  const lastValidInterval = useRef(DEFAULT_INTERVAL_HOURS);

  // Load persisted settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedEnabled, storedInterval] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ENABLED),
          AsyncStorage.getItem(STORAGE_KEY_INTERVAL),
        ]);

        if (storedEnabled !== null) {
          setDailyTriviaEnabled(JSON.parse(storedEnabled));
        }
        if (storedInterval !== null) {
          setIntervalHours(storedInterval);
          lastValidInterval.current = storedInterval;
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

      const seconds = parseInt(intervalHours, 10) * 3600;

      await Notifications.scheduleNotificationAsync({
        identifier: TRIVIA_NOTIFICATION_ID,
        content: {
          title: DUMMY_TRIVIA.title,
          body: DUMMY_TRIVIA.body,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds,
          repeats: true,
        },
      });
    };

    syncNotification();
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
});