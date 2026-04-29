import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, StyleSheet } from 'react-native';
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
      <Text style={[styles.tabLabel, { color: focused ? color : COLORS.muted }]}>{label}</Text>
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  tabIconText: {
    fontSize: 18,
    lineHeight: 22,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
