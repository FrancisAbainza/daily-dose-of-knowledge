import { StyleSheet, Text, View } from 'react-native';

export default function TriviaScreen() {
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>Trivia</Text>
      <Text style={styles.screenDescription}>Test your knowledge with daily trivia.</Text>
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