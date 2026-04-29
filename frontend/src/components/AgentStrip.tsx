import React from 'react';
import { View, Text, ScrollView, StyleSheet, Animated } from 'react-native';
import { SwarmAgent } from '../types';
import { COLORS } from '../utils/theme';

interface Props {
  agents: SwarmAgent[];
  typingAgents: Set<string>;
}

export default function AgentStrip({ agents, typingAgents }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {agents.map(agent => (
          <AgentPill key={agent.id} agent={agent} isTyping={typingAgents.has(agent.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

function AgentPill({ agent, isTyping }: { agent: SwarmAgent; isTyping: boolean }) {
  return (
    <View style={[styles.pill, { borderColor: agent.colorHex + '40' }]}>
      <View style={[styles.dot, { backgroundColor: isTyping ? agent.colorHex : agent.colorHex + '50' }]}>
        {isTyping && <View style={[styles.pulse, { backgroundColor: agent.colorHex + '30' }]} />}
      </View>
      <Text style={[styles.name, { color: isTyping ? agent.colorHex : COLORS.muted }]}>
        {agent.name.toUpperCase()}
      </Text>
      {isTyping && (
        <Text style={[styles.thinking, { color: agent.colorHex }]}>...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 8,
  },
  scroll: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'relative',
  },
  pulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    top: -3,
    left: -3,
  },
  name: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  thinking: {
    fontSize: 12,
    letterSpacing: 2,
  },
});
