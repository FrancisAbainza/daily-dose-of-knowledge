import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Switch,
  FlatList,
  AppState,
  AppStateStatus,
  ActivityIndicator,
} from 'react-native';
import { BookOpen, CheckCircle2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fetchVocabulary, VocabularyItem } from '../api/content';

const STORAGE_KEY_ENABLED = '@vocabulary_daily_enabled';
const STORAGE_KEY_HISTORY = '@vocabulary_history';
const STORAGE_KEY_LAST_GENERATED_DATE = '@vocabulary_last_generated_date';

const VOCABULARY_NOTIFICATION_ID = 'vocabulary-daily-notification';
const WORDS_PER_DAY = 5;
const MAX_HISTORY = 50;

type VocabularyHistoryEntry = VocabularyItem & {
  id: string;
  fetchedAt: number;
};

// Local YYYY-MM-DD, so "day" boundaries follow the device's calendar day,
// not UTC.
const getDateString = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Whether a history entry was fetched on today's local calendar date, so
// it can be visually emphasized in the list.
const isToday = (timestamp: number) => getDateString(new Date(timestamp)) === getDateString(new Date());

export default function VocabularyScreen() {
  const [dailyVocabularyEnabled, setDailyVocabularyEnabled] = useState(false);
  const [history, setHistory] = useState<VocabularyHistoryEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedToday, setGeneratedToday] = useState(false);

  const hasLoaded = useRef(false);
  const historyRef = useRef<VocabularyHistoryEntry[]>([]);
  const lastGeneratedDateRef = useRef<string | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Generates WORDS_PER_DAY new vocabulary words and appends them to
  // history. Also stamps today's date so this can't run again until
  // tomorrow. This is the ONLY way words get created — there is no
  // manual "generate" action available to the user.
  const generateDailyVocabulary = useCallback(async () => {
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const recentWords = historyRef.current.map((item) => item.word);
      const words = await fetchVocabulary(recentWords, WORDS_PER_DAY);

      const newEntries: VocabularyHistoryEntry[] = words.map((word, i) => ({
        id: `${Date.now()}-${i}`,
        word: word.word,
        definition: word.definition,
        fetchedAt: Date.now(),
      }));

      const updatedHistory = [...newEntries, ...historyRef.current].slice(0, MAX_HISTORY);
      historyRef.current = updatedHistory;
      setHistory(updatedHistory);

      const todayStr = getDateString(new Date());
      lastGeneratedDateRef.current = todayStr;
      setGeneratedToday(true);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory)),
        AsyncStorage.setItem(STORAGE_KEY_LAST_GENERATED_DATE, todayStr),
      ]);
    } catch (error) {
      console.warn('Failed to generate daily vocabulary:', error);
      setErrorMsg('Could not generate today\u2019s words. Will retry next time the app opens.');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // If daily vocabulary is enabled and we haven't generated for today's
  // calendar date yet, generate now. Since generation always happens on
  // or after midnight, there's no "time of day" check needed — a new
  // local date simply means it's due. Safe to call often; no-ops
  // otherwise.
  const checkAndGenerateIfDue = useCallback(
    async (enabled: boolean) => {
      if (!hasLoaded.current) return;
      if (!enabled) return;

      const todayStr = getDateString(new Date());

      if (lastGeneratedDateRef.current === todayStr) {
        setGeneratedToday(true);
        return;
      }
      setGeneratedToday(false);

      await generateDailyVocabulary();
    },
    [generateDailyVocabulary]
  );

  // Load persisted settings + history on mount, then run the due-check
  // once loading is complete (covers "app was closed when the day rolled
  // over and is now being opened").
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedEnabled, storedHistory, storedLastDate] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ENABLED),
          AsyncStorage.getItem(STORAGE_KEY_HISTORY),
          AsyncStorage.getItem(STORAGE_KEY_LAST_GENERATED_DATE),
        ]);

        const enabled = storedEnabled !== null ? JSON.parse(storedEnabled) : false;
        setDailyVocabularyEnabled(enabled);

        if (storedHistory !== null) {
          const parsed = JSON.parse(storedHistory);
          setHistory(parsed);
          historyRef.current = parsed;
        }

        if (storedLastDate !== null) {
          lastGeneratedDateRef.current = storedLastDate;
          setGeneratedToday(storedLastDate === getDateString(new Date()));
        }

        hasLoaded.current = true;
        await checkAndGenerateIfDue(enabled);
      } catch (error) {
        console.warn('Failed to load vocabulary settings:', error);
        hasLoaded.current = true;
      }
    };

    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check whenever the app is brought to the foreground — this is what
  // catches "user opens the app after midnight has passed".
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkAndGenerateIfDue(dailyVocabularyEnabled);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [checkAndGenerateIfDue, dailyVocabularyEnabled]);

  // Persist "enabled" whenever the user changes it, and re-check in case
  // today hasn't generated yet.
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(dailyVocabularyEnabled)).catch((error) => {
      console.warn('Failed to save vocabulary enabled setting:', error);
    });
    checkAndGenerateIfDue(dailyVocabularyEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyVocabularyEnabled]);

  // Schedule/cancel the repeating midnight local notification whenever
  // "enabled" changes. The notification just alerts the user that new
  // words are ready — actual generation happens on app open via
  // checkAndGenerateIfDue, since a local notification can't run app code
  // to fetch fresh content while the app is closed.
  useEffect(() => {
    if (!hasLoaded.current) return;

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

      await Notifications.scheduleNotificationAsync({
        identifier: VOCABULARY_NOTIFICATION_ID,
        content: {
          title: 'Word of the day \ud83d\udcda',
          body: `Your ${WORDS_PER_DAY} daily vocabulary words are ready. Open the app to see them.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: 0,
          minute: 0,
          repeats: true,
        },
      });
    };

    syncNotification();
  }, [dailyVocabularyEnabled]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.titleRow}>
        <BookOpen size={22} color="#7c3aed" />
        <Text style={styles.screenTitle}>Vocabulary</Text>
      </View>
      <Text style={styles.screenDescription}>
        Get {WORDS_PER_DAY} vocabulary words generated automatically every day at midnight.
      </Text>

      <View style={styles.settingsSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelContainer}>
            <Text style={styles.settingLabel}>Daily word reminder</Text>
            <Text style={styles.settingSubtext}>
              Automatically generate {WORDS_PER_DAY} words once per day.
            </Text>
          </View>
          <Switch
            value={dailyVocabularyEnabled}
            onValueChange={setDailyVocabularyEnabled}
            trackColor={{ false: '#d1d5db', true: '#c4b5fd' }}
            thumbColor={dailyVocabularyEnabled ? '#7c3aed' : '#f4f3f4'}
          />
        </View>
      </View>

      {dailyVocabularyEnabled && (
        <View style={styles.statusRow}>
          {isGenerating ? (
            <>
              <ActivityIndicator color="#7c3aed" size="small" />
              <Text style={styles.statusText}>Generating today's words\u2026</Text>
            </>
          ) : generatedToday ? (
            <>
              <CheckCircle2 size={16} color="#16a34a" />
              <Text style={styles.statusText}>Today's words are ready</Text>
            </>
          ) : (
            <Text style={styles.statusText}>Today's words haven't generated yet</Text>
          )}
        </View>
      )}

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <Text style={styles.historyTitle}>Recent Words</Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.historyList}
        contentContainerStyle={history.length === 0 && styles.historyEmptyContainer}
        ListEmptyComponent={
          <Text style={styles.historyEmptyText}>
            No words yet — enable daily vocabulary above.
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