import { NavigationBar } from 'expo-navigation-bar';
import { Platform, StatusBar } from 'react-native';

/**
 * Configure the Android navigation bar to match the app's theme
 * This fixes the white button issue that appears in Expo v54
 */
export const configureNavigationBar = async (colorScheme: 'light' | 'dark' | null) => {
    if (Platform.OS !== 'android') {
        return; // Only configure on Android
    }

    try {
        console.log('Configuring navigation bar for theme:', colorScheme);

        NavigationBar.setStyle(colorScheme === 'dark' ? 'dark' : 'light');

    } catch (error) {
        console.error('Navigation bar configuration failed after all retries:', error);
    }
};

/**
 * Force refresh the navigation bar configuration
 * This can be called when the theme changes or when the app resumes
 */
export const refreshNavigationBar = async (colorScheme: 'light' | 'dark' | null) => {
    if (Platform.OS !== 'android') {
        return;
    }

    try {
        // Add a longer delay to ensure the theme change has been processed
        setTimeout(async () => {
            await configureNavigationBar(colorScheme);
        }, 300);
    } catch (error) {
        console.error('Navigation bar refresh failed:', error);
    }
};

/**
 * Alternative method using StatusBar for navigation bar
 */
export const configureNavigationBarAlternative = async (colorScheme: 'light' | 'dark' | null) => {
    if (Platform.OS !== 'android') {
        return;
    }

    try {
        console.log('Using alternative navigation bar configuration for theme:', colorScheme);

        if (colorScheme === 'dark') {
            // Try multiple approaches
            NavigationBar.setStyle('dark');

            // Also try setting StatusBar
            StatusBar.setBackgroundColor('#0f0e11', true);
            StatusBar.setBarStyle('light-content', true);

            console.log('Alternative dark mode configuration applied');
        } else {
            NavigationBar.setStyle('light');

            // Also try setting StatusBar
            StatusBar.setBackgroundColor('#F9F9F9', true);
            StatusBar.setBarStyle('dark-content', true);

            console.log('Alternative light mode configuration applied');
        }

        console.log('Alternative navigation bar configuration completed');
    } catch (error) {
        console.error('Alternative navigation bar configuration failed:', error);
    }
};

/**
 * Debug function to check current navigation bar state
 */
export const debugNavigationBar = async () => {
    if (Platform.OS !== 'android') {
        console.log('Navigation bar debug: Not on Android platform');
        return;
    }

    try {
        console.log('=== Navigation Bar Debug Info ===');
        console.log('Platform:', Platform.OS);
        console.log('Platform Version:', Platform.Version);

        console.log('Navigation bar style API is configured for the current theme.');

        console.log('=== End Debug Info ===');
    } catch (error) {
        console.error('Navigation bar debug failed:', error);
    }
};
