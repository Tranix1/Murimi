import { Platform } from 'react-native';

/**
 * Native Android navigation bar configuration
 * This uses a different approach to fix the white navigation bar issue
 */

export const configureNativeNavigationBar = async (colorScheme: 'light' | 'dark' | null) => {
    if (Platform.OS !== 'android') {
        return;
    }

    try {
        console.log('Configuring native navigation bar for theme:', colorScheme);

        // Use Expo's public module API. Expo modules are not guaranteed to be
        // exposed through React Native's NativeModules object in release builds.
        const { NavigationBar } = require('expo-navigation-bar');
        NavigationBar.setStyle(colorScheme === 'dark' ? 'dark' : 'light');
        console.log('Native navigation bar configuration completed');
    } catch (error) {
        console.error('Native navigation bar configuration failed:', error);
    }
};

/**
 * Force navigation bar configuration using a different method
 */
export const forceNavigationBarConfig = async (colorScheme: 'light' | 'dark' | null) => {
    if (Platform.OS !== 'android') {
        return;
    }

    try {
        console.log('Force configuring navigation bar for theme:', colorScheme);

        // Try multiple times with different delays
        const attempts = [0, 100, 300, 500, 1000];

        for (const delay of attempts) {
            setTimeout(async () => {
                try {
                    const { NavigationBar } = require('expo-navigation-bar');
                    NavigationBar.setStyle(colorScheme === 'dark' ? 'dark' : 'light');
                } catch (error) {
                    console.error(`Force config attempt at ${delay}ms failed:`, error);
                }
            }, delay);
        }
    } catch (error) {
        console.error('Force navigation bar configuration failed:', error);
    }
};
