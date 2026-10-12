import { getAnalytics, logEvent, logScreenView, setUserId, setUserProperty } from '@react-native-firebase/analytics';

export async function trackScreen(screenName: string) {
    try {
        await logScreenView(getAnalytics(), {
            screen_name: screenName,
            screen_class: screenName,
        });
    } catch (e) {
        console.log('Analytics error:', e);
    }
}

export async function trackEventFirebase(
    event: string,
    params?: Record<string, any>
) {
    try {
        await logEvent(getAnalytics(), event, params);
    } catch (e) {
        console.log('Analytics error:', e);
    }
}

export async function setUserProperties(user: {
    uid: string;
    accountType?: string;
    city?: string;
    country?: string;
    verificationStatus?: string;
}) {
    try {
        const analytics = getAnalytics();
        await setUserId(analytics, user.uid);

        if (user.accountType)
            await setUserProperty(analytics, 'account_type', user.accountType);

        if (user.city)
            await setUserProperty(analytics, 'city', user.city);

        if (user.country)
            await setUserProperty(analytics, 'country', user.country);

        if (user.verificationStatus)
            await setUserProperty(analytics,
                'verification_status',
                user.verificationStatus
            );
    } catch (e) {
        console.log('Analytics error:', e);
    }
}
