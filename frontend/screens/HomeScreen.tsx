import { StatusBar } from 'expo-status-bar';
import { Brain, BookOpen, Quote } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type RootStackParamList = {
  Home: undefined;
  Trivia: undefined;
  Vocabulary: undefined;
  Quotes: undefined;
};

type Option = {
  id: string;
  title: string;
  icon: ReactElement;
  route: keyof RootStackParamList;
};

const options: Option[] = [
  { id: '1', title: 'Trivia', icon: <Brain size={22} color="#2563eb" />, route: 'Trivia' },
  { id: '2', title: 'Vocabulary', icon: <BookOpen size={22} color="#7c3aed" />, route: 'Vocabulary' },
  { id: '3', title: 'Quotes', icon: <Quote size={22} color="#dc2626" />, route: 'Quotes' },
];

function OptionItem({ item, onPress }: { item: Option; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.optionCard} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.optionContent}>
        {item.icon}
        <Text style={styles.optionText}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }: { navigation: any }) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Image source={require('../assets/ddok_logo.png')} style={styles.logo} />
        <Text style={styles.header}>Daily Dose of Knowledge</Text>
      </View>
      <Text style={styles.subtitle}>Choose a category</Text>

      <FlatList
        data={options}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OptionItem item={item} onPress={() => navigation.navigate(item.route)} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fc',
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  header: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  list: {
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 14,
  },
  logo: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
  },
  optionCard: {
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 12,
  },
});