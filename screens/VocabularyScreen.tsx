import { StyleSheet, Text, View } from 'react-native';

export default function VocabularyScreen() {
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>Vocabulary</Text>
      <Text style={styles.screenDescription}>Build your vocabulary with new words.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f7f9fc',
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
});