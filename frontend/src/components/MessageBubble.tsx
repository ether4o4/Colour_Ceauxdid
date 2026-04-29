import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SwarmMessage } from '../types';
import { COLORS } from '../utils/theme';

interface Props {
  message: SwarmMessage;
  isStreaming?: boolean;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message, isStreaming }: Props) {
  const isUser = !message.isAgent;

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
          <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.agentRow}>
      <View style={styles.agentHeader}>
        <View style={[styles.agentDot, { backgroundColor: message.senderColor }]} />
        <Text style={[styles.agentName, { color: message.senderColor }]}>
          {message.senderName.toUpperCase()}
        </Text>
        <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
      </View>
      <View style={[styles.agentBubble, {
        borderLeftColor: message.senderColor,
        backgroundColor: message.senderColor + '18',
      }]}>
        <Text style={styles.agentText}>
          {message.text}
          {isStreaming && <Text style={[styles.cursor, { color: message.senderColor }]}>▋</Text>}
        </Text>
      </View>
    </View>
  );
}

function TypingBubble({ agent }: { agent: { name: string; colorHex: string } }) {
  return (
    <View style={styles.agentRow}>
      <View style={styles.agentHeader}>
        <View style={[styles.agentDot, { backgroundColor: agent.colorHex }]} />
        <Text style={[styles.agentName, { color: agent.colorHex }]}>{agent.name.toUpperCase()}</Text>
      </View>
      <View style={[styles.agentBubble, {
        borderLeftColor: agent.colorHex,
        backgroundColor: agent.colorHex + '18',
      }]}>
        <Text style={[styles.typingDots, { color: agent.colorHex }]}>● ● ●</Text>
      </View>
    </View>
  );
}

export { TypingBubble };

const styles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  userBubble: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  agentRow: {
    marginVertical: 4,
    paddingHorizontal: 12,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  agentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  agentName: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  agentBubble: {
    backgroundColor: COLORS.surface,
    borderLeftWidth: 2,
    borderRadius: 4,
    borderTopLeftRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '90%',
  },
  agentText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
  },
  cursor: {
    fontSize: 14,
  },
  timestamp: {
    color: COLORS.muted,
    fontSize: 10,
    marginLeft: 4,
  },
  typingDots: {
    fontSize: 12,
    letterSpacing: 4,
  },
});
