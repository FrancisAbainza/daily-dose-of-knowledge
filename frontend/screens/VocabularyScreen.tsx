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
import { BookOpen, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fetchVocabulary, VocabularyItem } from '../api/content';

const STORAGE_KEY_ENABLED = '@vocabulary_daily_enabled';
const STORAGE_KEY_INTERVAL = '@vocabulary_interval_hours';
const STORAGE_KEY_HISTORY = '@vocabulary_history';

const DEFAULT_INTERVAL_HOURS = '12';
const VOCABULARY_NOTIFICATION_ID = 'vocabulary-daily-notification';
const MAX_HISTORY = 20;

type VocabularyHistoryEntry = VocabularyItem & {
  id: string;
  fetchedAt: number;
};

export default function VocabularyScreen() {
  const [dailyVocabularyEnabled, setDailyVocabularyEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(DEFAULT_INTERVAL_HOURS);
  const [history, setHistory] = useState<VocabularyHistoryEntry[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasLoaded = useRef(false);
  const lastValidInterval = useRef(DEFAULT_INTERVAL_HOURS);
  const historyRef = useRef<VocabularyHistoryEntry[]>([]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedEnabled, storedInterval] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ENABLED),
          AsyncStorage.getItem(STORAGE_KEY_INTERVAL),
        ]);

        if (storedEnabled !== null) {
          setDailyVocabularyEnabled(JSON.parse(storedEnabled));
        }
        if (storedInterval !== null) {
          setIntervalHours(storedInterval);
          lastValidInterval.current = storedInterval;
        }
      } catch (error) {
        console.warn('Failed to load vocabulary settings:', error);
      } finally {
        hasLoaded.current = true;
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(dailyVocabularyEnabled)).catch((error) => {
      console.warn('Failed to save vocabulary enabled setting:', error);
    });
  }, [dailyVocabularyEnabled]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    if (intervalHours === '') return;

    lastValidInterval.current = intervalHours;
    AsyncStorage.setItem(STORAGE_KEY_INTERVAL, intervalHours).catch((error) => {
      console.warn('Failed to save vocabulary interval setting:', error);
    });
  }, [intervalHours]);

  const getNewVocabulary = async (): Promise<VocabularyHistoryEntry | null> => {
    setIsFetching(true);
    setErrorMsg(null);

    try {
      const recentWords = historyRef.current.map((item) => item.word);
      const vocabulary = await fetchVocabulary(recentWords);

      const entry: VocabularyHistoryEntry = {
        id: `${Date.now()}`,
        word: vocabulary.word,
        definition: vocabulary.definition,
        fetchedAt: Date.now(),
      };

      const updatedHistory = [entry, ...historyRef.current].slice(0, MAX_HISTORY);
      historyRef.current = updatedHistory;
      setHistory(updatedHistory);

      AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory)).catch((error) => {
        console.warn('Failed to save vocabulary history:', error);
      });

      return entry;
    } catch (error) {
      console.warn('Failed to fetch vocabulary:', error);
      setErrorMsg('Could not fetch a new word. Please try again.');
      return null;
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (!hasLoaded.current) return;
    if (intervalHours === '') return;

    const syncNotification = async () => {
      await Notifications.cancelScheduledNotificationAsync(VOCABULARY_NOTIFICATION_ID).catch(() => {});

      if (!dailyVocabularyEnabled) return;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Notification permission not granted; vocabulary notifications disabled.');
        return;
      }

      const entry = await getNewVocabulary();
      const seconds = parseInt(intervalHours, 10) * 3600;

      await Notifications.scheduleNotificationAsync({
        identifier: VOCABULARY_NOTIFICATION_ID,
        content: {
          title: 'Word of the day 📚',
          body: entry?.word ? `${entry.word} — ${entry.definition}` : 'Check out today\'s word of the day!',
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
  }, [dailyVocabularyEnabled, intervalHours]);

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
        <BookOpen size={22} color="#7c3aed" />
        <Text style={styles.screenTitle}>Vocabulary</Text>
      </View>
      <Text style={styles.screenDescription}>Build your vocabulary with new words.</Text>

      <View style={styles.settingsSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelContainer}>
            <Text style={styles.settingLabel}>Daily word reminder</Text>
            <Text style={styles.settingSubtext}>Receive a vocabulary word sent to you periodically.</Text>
          </View>
          <Switch
            value={dailyVocabularyEnabled}
            onValueChange={setDailyVocabularyEnabled}
            trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
            thumbColor={dailyVocabularyEnabled ? '#7c3aed' : '#f4f3f4'}
          />
        </View>

        {dailyVocabularyEnabled && (
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
        onPress={getNewVocabulary}
        disabled={isFetching}
      >
        {isFetching ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <>
            <RefreshCw size={16} color="#ffffff" />
            <Text style={styles.fetchButtonText}>Get New Word</Text>
          </>
        )}
      </TouchableOpacity>

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <Text style={styles.historyTitle}>Recent Words</Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.historyList}
        contentContainerStyle={history.length === 0 && styles.historyEmptyContainer}
        ListEmptyComponent={
          <Text style={styles.historyEmptyText}>
            No words yet — tap "Get New Word" to fetch one.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.historyItem}>
            <Text style={styles.historyQuestion}>{item.word}</Text>
            <Text style={styles.historyAnswer}>{item.definition}</Text>
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
    backgroundColor: '#7c3aed',
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