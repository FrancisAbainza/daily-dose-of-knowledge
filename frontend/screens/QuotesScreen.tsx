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
import { Quote, CheckCircle2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fetchQuote, QuoteItem } from '../api/content';

const STORAGE_KEY_ENABLED = '@quotes_daily_enabled';
const STORAGE_KEY_HISTORY = '@quotes_history';
const STORAGE_KEY_LAST_GENERATED_DATE = '@quotes_last_generated_date';

const QUOTES_NOTIFICATION_ID = 'quotes-daily-notification';
const QUOTES_PER_DAY = 5;
const MAX_HISTORY = 50;

type QuoteHistoryEntry = QuoteItem & {
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

export default function QuotesScreen() {
  const [dailyQuoteEnabled, setDailyQuoteEnabled] = useState(false);
  const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedToday, setGeneratedToday] = useState(false);

  const hasLoaded = useRef(false);
  const historyRef = useRef<QuoteHistoryEntry[]>([]);
  const lastGeneratedDateRef = useRef<string | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Generates QUOTES_PER_DAY new quotes and appends them to history. Also
  // stamps today's date so this can't run again until tomorrow. This is
  // the ONLY way quotes get created — there is no manual "generate"
  // action available to the user.
  const generateDailyQuotes = useCallback(async () => {
    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const recentQuotes = historyRef.current.map((item) => item.quote);
      const quotes = await fetchQuote(recentQuotes, QUOTES_PER_DAY);

      const newEntries: QuoteHistoryEntry[] = quotes.map((quote, i) => ({
        id: `${Date.now()}-${i}`,
        quote: quote.quote,
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
      console.warn('Failed to generate daily quotes:', error);
      setErrorMsg('Could not generate today\u2019s quotes. Will retry next time the app opens.');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // If daily quotes are enabled and we haven't generated for today's
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

      await generateDailyQuotes();
    },
    [generateDailyQuotes]
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
        setDailyQuoteEnabled(enabled);

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
        console.warn('Failed to load quote settings:', error);
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
        checkAndGenerateIfDue(dailyQuoteEnabled);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [checkAndGenerateIfDue, dailyQuoteEnabled]);

  // Persist "enabled" whenever the user changes it, and re-check in case
  // today hasn't generated yet.
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(dailyQuoteEnabled)).catch((error) => {
      console.warn('Failed to save quote enabled setting:', error);
    });
    checkAndGenerateIfDue(dailyQuoteEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyQuoteEnabled]);

  // Schedule/cancel the repeating midnight local notification whenever
  // "enabled" changes. The notification just alerts the user that new
  // quotes are ready — actual generation happens on app open via
  // checkAndGenerateIfDue, since a local notification can't run app code
  // to fetch fresh content while the app is closed.
  useEffect(() => {
    if (!hasLoaded.current) return;

    const syncNotification = async () => {
      await Notifications.cancelScheduledNotificationAsync(QUOTES_NOTIFICATION_ID).catch(() => {});

      if (!dailyQuoteEnabled) return;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Notification permission not granted; quote notifications disabled.');
        return;
      }

      await Notifications.scheduleNotificationAsync({
        identifier: QUOTES_NOTIFICATION_ID,
        content: {
          title: 'Quote of the day \u2728',
          body: `Your ${QUOTES_PER_DAY} daily quotes are ready. Open the app to see them.`,
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
  }, [dailyQuoteEnabled]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.titleRow}>
        <Quote size={22} color="#dc2626" />
        <Text style={styles.screenTitle}>Quotes</Text>
      </View>
      <Text style={styles.screenDescription}>
        Get {QUOTES_PER_DAY} inspirational quotes generated automatically every day at midnight.
      </Text>

      <View style={styles.settingsSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelContainer}>
            <Text style={styles.settingLabel}>Daily dose of quotes</Text>
            <Text style={styles.settingSubtext}>
              Automatically generate {QUOTES_PER_DAY} quotes once per day.
            </Text>
          </View>
          <Switch
            value={dailyQuoteEnabled}
            onValueChange={setDailyQuoteEnabled}
            trackColor={{ false: '#d1d5db', true: '#fca5a5' }}
            thumbColor={dailyQuoteEnabled ? '#dc2626' : '#f4f3f4'}
          />
        </View>
      </View>

      {dailyQuoteEnabled && (
        <View style={styles.statusRow}>
          {isGenerating ? (
            <>
              <ActivityIndicator color="#dc2626" size="small" />
              <Text style={styles.statusText}>Generating today's quotes\u2026</Text>
            </>
          ) : generatedToday ? (
            <>
              <CheckCircle2 size={16} color="#16a34a" />
              <Text style={styles.statusText}>Today's quotes are ready</Text>
            </>
          ) : (
            <Text style={styles.statusText}>Today's quotes haven't generated yet</Text>
          )}
        </View>
      )}

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <Text style={styles.historyTitle}>Recent Quotes</Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.historyList}
        contentContainerStyle={history.length === 0 && styles.historyEmptyContainer}
        ListEmptyComponent={
          <Text style={styles.historyEmptyText}>
            No quotes yet — enable daily quotes above.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.historyItem}>
            <Text style={styles.historyQuestion}>{item.quote}</Text>
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