import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from './screens/HomeScreen';
import TriviaScreen from './screens/TriviaScreen';
import VocabularyScreen from './screens/VocabularyScreen';
import QuotesScreen from './screens/QuotesScreen';
import BibleVerseScreen from './screens/BibleVerseScreen';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type RootStackParamList = {
  Home: undefined;
  Trivia: undefined;
  Vocabulary: undefined;
  Quotes: undefined;
  BibleVerse: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerStyle: { backgroundColor: '#f7f9fc' }, headerTintColor: '#111827' }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Trivia" component={TriviaScreen} />
        <Stack.Screen name="Vocabulary" component={VocabularyScreen} />
        <Stack.Screen name="Quotes" component={QuotesScreen} />
        <Stack.Screen name="BibleVerse" component={BibleVerseScreen} options={{ title: 'Bible Verse' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
