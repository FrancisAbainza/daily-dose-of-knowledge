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
import { Quote, RefreshCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fetchQuote, QuoteItem } from '../api/content';

const STORAGE_KEY_ENABLED = '@quotes_daily_enabled';
const STORAGE_KEY_INTERVAL = '@quotes_interval_hours';
const STORAGE_KEY_HISTORY = '@quotes_history';

const DEFAULT_INTERVAL_HOURS = '12';
const QUOTES_NOTIFICATION_ID = 'quotes-daily-notification';
const MAX_HISTORY = 20;

type QuoteHistoryEntry = QuoteItem & {
  id: string;
  fetchedAt: number;
};

export default function QuotesScreen() {
  const [dailyQuoteEnabled, setDailyQuoteEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(DEFAULT_INTERVAL_HOURS);
  const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasLoaded = useRef(false);
  const lastValidInterval = useRef(DEFAULT_INTERVAL_HOURS);
  const historyRef = useRef<QuoteHistoryEntry[]>([]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedEnabled, storedInterval] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_ENABLED),
          AsyncStorage.getItem(STORAGE_KEY_INTERVAL),
        ]);

        if (storedEnabled !== null) {
          setDailyQuoteEnabled(JSON.parse(storedEnabled));
        }
        if (storedInterval !== null) {
          setIntervalHours(storedInterval);
          lastValidInterval.current = storedInterval;
        }
      } catch (error) {
        console.warn('Failed to load quote settings:', error);
      } finally {
        hasLoaded.current = true;
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(dailyQuoteEnabled)).catch((error) => {
      console.warn('Failed to save quote enabled setting:', error);
    });
  }, [dailyQuoteEnabled]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    if (intervalHours === '') return;

    lastValidInterval.current = intervalHours;
    AsyncStorage.setItem(STORAGE_KEY_INTERVAL, intervalHours).catch((error) => {
      console.warn('Failed to save quote interval setting:', error);
    });
  }, [intervalHours]);

  const getNewQuote = async (): Promise<QuoteHistoryEntry | null> => {
    setIsFetching(true);
    setErrorMsg(null);

    try {
      const recentQuotes = historyRef.current.map((item) => item.quote);
      const quote = await fetchQuote(recentQuotes);

      const entry: QuoteHistoryEntry = {
        id: `${Date.now()}`,
        quote: quote.quote,
        fetchedAt: Date.now(),
      };

      const updatedHistory = [entry, ...historyRef.current].slice(0, MAX_HISTORY);
      historyRef.current = updatedHistory;
      setHistory(updatedHistory);

      AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory)).catch((error) => {
        console.warn('Failed to save quote history:', error);
      });

      return entry;
    } catch (error) {
      console.warn('Failed to fetch quote:', error);
      setErrorMsg('Could not fetch a new quote. Please try again.');
      return null;
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (!hasLoaded.current) return;
    if (intervalHours === '') return;

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

      const entry = await getNewQuote();
      const seconds = parseInt(intervalHours, 10) * 3600;

      await Notifications.scheduleNotificationAsync({
        identifier: QUOTES_NOTIFICATION_ID,
        content: {
          title: 'Quote of the day ✨',
          body: entry?.quote ?? 'Check out today\'s quote!',
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
  }, [dailyQuoteEnabled, intervalHours]);

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
        <Quote size={22} color="#dc2626" />
        <Text style={styles.screenTitle}>Quotes</Text>
      </View>
      <Text style={styles.screenDescription}>Discover inspirational quotes.</Text>

      <View style={styles.settingsSection}>
        <View style={styles.settingRow}>
          <View style={styles.settingLabelContainer}>
            <Text style={styles.settingLabel}>Daily dose of quotes</Text>
            <Text style={styles.settingSubtext}>Get an uplifting quote sent to you periodically.</Text>
          </View>
          <Switch
            value={dailyQuoteEnabled}
            onValueChange={setDailyQuoteEnabled}
            trackColor={{ false: '#d1d5db', true: '#fca5a5' }}
            thumbColor={dailyQuoteEnabled ? '#dc2626' : '#f4f3f4'}
          />
        </View>

        {dailyQuoteEnabled && (
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
        onPress={getNewQuote}
        disabled={isFetching}
      >
        {isFetching ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <>
            <RefreshCw size={16} color="#ffffff" />
            <Text style={styles.fetchButtonText}>Get New Quote</Text>
          </>
        )}
      </TouchableOpacity>

      {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

      <Text style={styles.historyTitle}>Recent Quotes</Text>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        style={styles.historyList}
        contentContainerStyle={history.length === 0 && styles.historyEmptyContainer}
        ListEmptyComponent={
          <Text style={styles.historyEmptyText}>
            No quotes yet — tap "Get New Quote" to fetch one.
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
    backgroundColor: '#dc2626',
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