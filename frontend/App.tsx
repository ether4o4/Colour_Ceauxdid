import 'react-native-gesture-handler';
import React from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import Navigation from './src/navigation';

// Top-level error screen: if anything throws during render, show it on screen
// instead of letting the app silently close. Uses only core RN primitives so
// the boundary itself can never fail.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const e = this.state.error;
      const detail =
        e && (e.stack || e.message) ? e.stack || e.message : String(e);
      return (
        <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
          <Text style={styles.title}>Colour Ceauxdid hit an error</Text>
          <Text style={styles.hint}>Screenshot this and send it over.</Text>
          <Text style={styles.body}>{detail}</Text>
        </ScrollView>
      );
    }
    return this.props.children as any;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <Navigation />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { padding: 20, paddingTop: 70 },
  title: { color: '#ff5555', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  hint: { color: '#ffe53b', fontSize: 12, marginBottom: 16 },
  body: { color: '#dddddd', fontSize: 12, lineHeight: 18 },
});
