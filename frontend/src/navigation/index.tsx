import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../utils/theme';

import ChatHub from '../screens/ChatHub';
import TasksScreen from '../screens/TasksScreen';
import AgentsScreen from '../screens/AgentsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ label, color, focused }: { label: string; color: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Chat: '◈',
    Tasks: '▣',
    Agents: '◉',
    Settings: '◎',
  };
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabIconText, { color: focused ? color : COLORS.muted }]}>
        {icons[label] || '●'}
      </Text>
      <Text
        numberOfLines={1}
        ellipsizeMode="clip"
        style={[styles.tabLabel, { color: focused ? color : COLORS.muted }]}
      >
        {label}
      </Text>
    </View>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          ...styles.tabBar,
          height: 56 + bottomPad,
          paddingBottom: bottomPad,
        },
        tabBarShowLabel: false,
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tab.Screen
        name="Chat"
        component={ChatHub}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Chat" color={COLORS.red} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Tasks" color={COLORS.blue} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Agents"
        component={AgentsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Agents" color={COLORS.green} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Settings" color={COLORS.purple} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    minWidth: 80,
  },
  tabIconText: {
    fontSize: 18,
    lineHeight: 22,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 2,
    includeFontPadding: false,
  },
});
