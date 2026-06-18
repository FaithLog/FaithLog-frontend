import {SafeAreaView, ScrollView, StyleSheet, Text, View} from 'react-native';

type AppState =
  | {status: 'ready'; message: string}
  | {status: 'error'; message: string};

const initialState: AppState = {
  status: 'ready',
  message: 'FaithLog frontend is ready.',
};

function renderStatus(state: AppState) {
  switch (state.status) {
    case 'ready':
      return state.message;
    case 'error':
      return state.message;
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled app state: ${String(value)}`);
}

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>FaithLog</Text>
          <Text style={styles.title}>Frontend</Text>
          <Text style={styles.description}>{renderStatus(initialState)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f8fa',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 24,
    shadowColor: '#1f2937',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  eyebrow: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
  },
  description: {
    color: '#4b5563',
    fontSize: 16,
    lineHeight: 24,
  },
});
