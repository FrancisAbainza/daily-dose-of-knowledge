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
  Platform,
} from 'react-native';
import { Quote, CheckCircle2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fetchQuote, QuoteItem } from '../api/content';
import { getDateString, isToday } from '../utils/dailyContent';

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

export default function QuotesScreen() {
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatingRef = useRef(false);

  const generateIfNeeded = useCallback(async () => {
    if (!enabled || generatingRef.current) return;

    const today = getDateString();
    const lastGeneratedDate = await AsyncStorage.getItem(STORAGE_KEY_LAST_GENERATED_DATE);
    if (lastGeneratedDate === today) return;

    generatingRef.current = true;
    setIsGenerating(true);
    setError(null);

    try {
      const recentQuotes = history.map((item) => item.quote);
      const quotes = await fetchQuote(recentQuotes, QUOTES_PER_DAY);
      const now = Date.now();

      const newEntries: QuoteHistoryEntry[] = quotes.map((quote, index) => ({
        ...quote,
        id: `${now}-${index}`,
        fetchedAt: now,
      }));

      const updatedHistory = [...newEntries, ...history].slice(0, MAX_HISTORY);
      setHistory(updatedHistory);

      await AsyncStorage.multiSet([
        [STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory)],
        [STORAGE_KEY_LAST_GENERATED_DATE, today],
      ]);
    } catch (err) {
      console.warn('Failed to generate quotes:', err);
      setError('Could not generate today\u2019s quotes. Please try again later.');
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  }, [enabled, history]);

  useEffect(() => {
    async function initialize() {
      try {
        const [storedEnabled, storedHistory] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ENABLED),
          AsyncStorage.getItem(STORAGE_KEY_HISTORY),
        ]);

        if (storedEnabled !== null) setEnabled(JSON.parse(storedEnabled));
        if (storedHistory !== null) setHistory(JSON.parse(storedHistory));
      } catch (err) {
        console.warn('Failed to load quote data:', err);
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    if (enabled) generateIfNeeded();
  }, [enabled, generateIfNeeded]);

  useEffect(() => {
    function handleAppStateChange(nextState: AppStateStatus) {
      if (nextState === 'active') generateIfNeeded();
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [generateIfNeeded]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(enabled)).catch((err) => {
      console.warn('Failed to save quote setting:', err);
    });
  }, [enabled]);

  useEffect(() => {
    const syncNotification = async () => {
      try {
        await Notifications.cancelScheduledNotificationAsync(QUOTES_NOTIFICATION_ID);
        if (!enabled) return;

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let status = existingStatus;
        if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted') return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('quotes-daily', {
            name: 'Daily quotes',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        await Notifications.scheduleNotificationAsync({
          identifier: QUOTES_NOTIFICATION_ID,
          content: {
            title: 'Quote of the day \u2728',
            body: `Your ${QUOTES_PER_DAY} daily quotes are ready.`,
            ...(Platform.OS === 'android' && { channelId: 'quotes-daily' }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour: 0,
            minute: 0,
            repeats: true,
          },
        });
      } catch (err) {
        console.warn('Failed to sync quote notification:', err);
      }
    };

    syncNotification();
  }, [enabled]);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.titleRow}>
        <Quote size={22} color="#dc2626" />
        <Text style={styles.screenTitle}>Quotes</Text>
      </View>
      <Text style={styles.screenDescription}>
        Get {QUOTES_PER_DAY} inspirational quotes generated automatically every day.
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
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: '#d1d5db', true: '#fca5a5' }}
            thumbColor={enabled ? '#dc2626' : '#f4f3f4'}
          />
        </View>
      </View>

      {enabled && (
        <View style={styles.statusRow}>
          {isGenerating ? (
            <>
              <ActivityIndicator color="#dc2626" size="small" />
              <Text style={styles.statusText}>Generating today's quotes</Text>
            </>
          ) : (
            <>
              <CheckCircle2 size={16} color="#16a34a" />
              <Text style={styles.statusText}>Today's quotes are ready</Text>
            </>
          )}
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

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
                {item.quote}
              </Text>
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
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  todayBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dc2626',
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
    color: '#7f1d1d',
    fontWeight: '700',
  },
  historyAnswer: {
    fontSize: 14,
    color: '#4b5563',
  },
});