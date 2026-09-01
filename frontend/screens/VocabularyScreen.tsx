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
import { BookOpen, CheckCircle2 } from 'lucide-react-native';
import { fetchVocabulary, VocabularyItem } from '../api/content';
import { getDateString, isToday } from '../utils/dailyContent';

const STORAGE_KEY_ENABLED = '@vocabulary_daily_enabled';
const STORAGE_KEY_HISTORY = '@vocabulary_history';
const STORAGE_KEY_LAST_GENERATED_DATE = '@vocabulary_last_generated_date';

const VOCABULARY_NOTIFICATION_ID = 'vocabulary-daily-notification';
const VOCABULARY_CHANNEL_ID = 'vocabulary-daily';
const WORDS_PER_DAY = 5;
const MAX_HISTORY = 50;

type VocabularyHistoryEntry = VocabularyItem & {
  id: string;
  fetchedAt: number;
};

export default function VocabularyScreen() {
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<VocabularyHistoryEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const historyRef = useRef<VocabularyHistoryEntry[]>([]);

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
      const recentWords = currentHistory.map((item) => item.word);
      const words = await fetchVocabulary(
        recentWords,
        WORDS_PER_DAY
      );
      const now = Date.now();

      const newEntries: VocabularyHistoryEntry[] = words.map(
        (word, index) => ({
          ...word,
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
      console.warn('Failed to generate vocabulary:', err);
      setError('Could not generate today\u2019s words. Please try again later.');
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
        console.warn('Failed to load vocabulary data:', err);
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
      console.warn('Failed to save vocabulary setting:', err);
    });
  }, [enabled]);

  useEffect(() => {
    const syncNotification = async () => {
      try {
        await Notifications.cancelScheduledNotificationAsync(VOCABULARY_NOTIFICATION_ID);
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
          await Notifications.setNotificationChannelAsync(VOCABULARY_CHANNEL_ID, {
            name: 'Daily vocabulary',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
          });
        }
        await Notifications.scheduleNotificationAsync({
          identifier: VOCABULARY_NOTIFICATION_ID,
          content: {
            title: 'Word of the day \ud83d\udcda',
            body: `Your ${WORDS_PER_DAY} daily vocabulary words are ready.`,
            ...(Platform.OS === 'android' && { channelId: VOCABULARY_CHANNEL_ID }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 0,
            minute: 0,
          }
        });
      } catch (err) {
        console.warn('Failed to sync vocabulary notification:', err);
      }
    };

    syncNotification();
  }, [enabled]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.titleRow}>
        <BookOpen size={22} color="#7c3aed" />
        <Text style={styles.screenTitle}>Vocabulary</Text>
      </View>
      <Text style={styles.screenDescription}>
        Get {WORDS_PER_DAY} vocabulary words generated automatically every day.
      </Text>

      <View style={styles.settingsSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelContainer}>
            <Text style={styles.settingLabel}>Daily word notification</Text>
            <Text style={styles.settingSubtext}>
              Get notified when today's {WORDS_PER_DAY} words are ready.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
            thumbColor={enabled ? '#7c3aed' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.statusRow}>
        {isGenerating ? (
          <>
            <ActivityIndicator color="#7c3aed" size="small" />
            <Text style={styles.statusText}>Generating today's words</Text>
          </>
        ) : (
          <>
            <CheckCircle2 size={16} color="#16a34a" />
            <Text style={styles.statusText}>Today's words are ready</Text>
          </>
        )}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.historyTitle}>Recent Words</Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.historyList}
        contentContainerStyle={history.length === 0 && styles.historyEmptyContainer}
        ListEmptyComponent={
          <Text style={styles.historyEmptyText}>
            No words yet — check back soon.
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
                {item.word}
              </Text>
              <Text style={styles.historyAnswer}>{item.definition}</Text>
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
    backgroundColor: '#f5f3ff',
    borderWidth: 1.5,
    borderColor: '#7c3aed',
    shadowColor: '#7c3aed',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  todayBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#7c3aed',
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
    color: '#4c1d95',
    fontWeight: '700',
  },
  historyAnswer: {
    fontSize: 14,
    color: '#4b5563',
  },
});