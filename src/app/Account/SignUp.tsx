import React, { useState, useEffect } from 'react';
import ScreenWrapper from '@/components/ScreenWrapper';
import {
    View,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Alert, Keyboard,
    ToastAndroid
} from 'react-native';
import Input from '@/components/Input';
import {
    EvilIcons,
    Ionicons,
} from '@expo/vector-icons';
import { hp, wp } from '@/constants/common';
import { useThemeColor } from '@/hooks/useThemeColor';
import { ThemedText } from '@/components/ThemedText';
import { Image } from 'expo-image';
import { useAuth } from '@/context/AuthContext';
import { router } from 'expo-router';
import PhoneInput from '@/components/PhoneInput';
import { trackEventFirebase, trackScreen } from '@/services/analytics/firebaseAnalystics';
import { useColorScheme } from 'react-native';
import { getAuth, signInWithPhoneNumber } from "@react-native-firebase/auth";


const Index = ({ setDspLoginOrSignup, setIsSigningUp }: any) => {
    const [fullname, setFullName] = useState('');
    const [referrerCode, setReferrerCode] = useState('');
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const icon = useThemeColor('icon');
    const accent = useThemeColor('accent');
    const coolGray = useThemeColor('coolGray');

    const colorScheme = useColorScheme();


    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const [phoneNumber, setPhoneNumber] = useState('');
    const [countryCode, setCountryCode] = useState({ id: 0, name: '', countryName: '' });

    const [confirmation, setConfirmation] = useState<any>(null);

    const [verificationId, setVerificationId] = useState("");
    const [otp, setOtp] = useState("");
    const [otpSent, setOtpSent] = useState(false);

    console.log("Selected Country:", countryCode.name, countryCode.countryName);


    useEffect(() => {
        trackScreen("Signup")

        const showSub = Keyboard.addListener("keyboardDidShow", () => {
            setKeyboardVisible(true);
        });

        const hideSub = Keyboard.addListener("keyboardDidHide", () => {
            setKeyboardVisible(false);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    const { signUp, } = useAuth();

    // const verificationId = await provider.verifyPhoneNumber(
    //     phoneNumber,
    // );



    const sendPhoneOTP = async () => {
        try {
            setLoading(true);

            trackEventFirebase("otp_sent", { accountType: "tracking" }).catch(console.error);

            const length = phoneNumber.replace(/\D/g, "").length;

            if (!countryCode.name) {
                setError("Select a country code");
            setLoading(false);
                
                return;
            }

            if (countryCode.name === "+267") {
                if (length !== 8) {
                    setError("Botswana phone number must be 8 digits");
            setLoading(false);

                    return;
                }
            } else {
                if (length !== 9) {
                    setError("Phone number must be 9 digits");
            setLoading(false);

                    return;
                }
            }

           
            if (!acceptTerms) {
                setError("You must accept the terms and privacy policy");
            setLoading(false);

                return;
            }

            setError(null);
            setLoading(true);

            // Load Firebase Auth only when user requests OTP
            const confirmationResult = await signInWithPhoneNumber(
                getAuth(),
                `${countryCode.name}${phoneNumber}`
            );

            setConfirmation(confirmationResult);
            setOtpSent(true);

        } catch (error: any) {
            console.error(error);
            setError(error?.message || 'Failed to send OTP. Please try again.');
            setLoading(false);
            

            ToastAndroid.show(
                error?.message || `${error}`,
                ToastAndroid.LONG
            );

        } finally {
            setLoading(false);
        }
    };


    const verifyOTP = async (code: string) => {
        if (!phoneNumber || !fullname) {
            setError("Please fill in all fields");
            return;
        }

        if (!confirmation) {
            setError("OTP session expired. Please request a new code.");
            return;
        }

        setError(null);

        try {
            setLoading(true);
            setIsSigningUp(true);


            if (!getAuth().currentUser) {
                await confirmation.confirm(code);
            }


            const result = await signUp({
                phoneNumber: `${countryCode.name}${phoneNumber}`,
                verificationId,
                referrerCode,
                accountType: "tracking",
                displayName: fullname,
                countryCode: countryCode.name,
                countryName: countryCode.countryName || "Unknown",
            });
            
            if (result.success) {
                ToastAndroid.show("Account created successfully!", ToastAndroid.SHORT);
                router.replace("/");
            } else {
                setError(result.message || "Signup failed. Please try again.");
            }

        } catch (err: any) {
            console.error(err);
            ToastAndroid.show(
                err?.message || `${err}`,
                ToastAndroid.LONG
            );
            setError(err.message || "Signup failed. Please try again.");
        } finally {
            setLoading(false);
            setIsSigningUp(false);
        }
    };




    const onsubmit = async () => {
        await verifyOTP(otp);
    };



    return (
        <ScreenWrapper fh={false}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.container}>
                    {/* LOGO */}
                    <Image
                        contentFit="contain"
                        source={colorScheme === "light" ? require('@/assets/images/murimi-icon-light.png') : require('@/assets/images/murimi-icon-dark.png')}
                        
                        style={styles.logo}
                    />

                    {/* HEADER */}
                    <View style={styles.headerContainer}>
                        <ThemedText type="title" style={styles.header}>
                            Create Account
                        </ThemedText>
                        <ThemedText style={styles.subHeader} color={coolGray}>
                            Create your Murimi account to manage your farm
                        </ThemedText>
                    </View>

                    {error && (
                        <View style={styles.errorBanner}>
                            <Ionicons name="alert-circle" size={16} color="#D32F2F" style={{ marginRight: 6 }} />
                            <ThemedText style={styles.errorText}>{error}</ThemedText>
                        </View>
                    )}





                    <ThemedText style={styles.label}>Full Name</ThemedText>
                    <Input
                        containerStyles={styles.input}
                        placeholder="Full Name"
                        value={fullname}
                        onChangeText={setFullName}
                        autoCapitalize="words"
                        editable={!otpSent}

                    />

                    <ThemedText style={styles.label}>Phone Number</ThemedText>

                    <PhoneInput
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        countryCode={countryCode}
                        setCountryCode={setCountryCode}
                        editable={otpSent}

                    />


                    {otpSent && (
                        <>
                            <ThemedText style={styles.label}>OTP Code</ThemedText>

                            <Input
                                placeholder="Enter OTP"
                                value={otp}
                                onChangeText={setOtp}
                                keyboardType="number-pad"
                                containerStyles={styles.input}

                            />


                        </>
                    )}

                    {/* TERMS */}
                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        activeOpacity={0.7}
                        onPress={() => setAcceptTerms(!acceptTerms)}
                    >
                        {acceptTerms ? (
                            <EvilIcons name="check" size={30} style={styles.checkboxIcon} color={accent} />
                        ) : (
                            <Ionicons name="ellipse-outline" size={24} style={styles.checkboxIcon} color={icon} />
                        )}
                        <ThemedText style={styles.checkboxText}>
                            I accept the terms and privacy policy
                        </ThemedText>
                    </TouchableOpacity>





                    {!otpSent && (
                        <TouchableOpacity
                            onPress={sendPhoneOTP}
                            disabled={loading}
                            activeOpacity={0.85}
                            style={[
                                styles.otpButton,
                                {
                                    borderColor: accent,
                                    opacity: loading ? 0.6 : 1,
                                },
                            ]}
                        >
                            {loading ? (
                                <ActivityIndicator color={icon} />
                            ) : (
                                <ThemedText      type="subtitle">
                                    Send OTP
                                </ThemedText>
                            )}
                        </TouchableOpacity>
                    )}



                    {/* SIGN UP BUTTON */}
                    {otpSent && <TouchableOpacity
                        onPress={onsubmit}
                        style={[
                            styles.signUpButton,
                            { backgroundColor: accent, opacity: loading ? 0.6 : 1 },
                        ]}
                        disabled={loading}
                        activeOpacity={0.85}
                    >
                        {loading ? (
                            <ActivityIndicator color={icon} />
                        ) : (
                            <ThemedText  type="subtitle">
                                Create Account
                            </ThemedText>
                        )}
                    </TouchableOpacity>}

                    {/* FOOTER */}
                    <TouchableOpacity
                        onPress={() => setDspLoginOrSignup(true)}
                        disabled={loading}
                    >
                        <ThemedText style={styles.footerText}>
                            Already have an account?{' '}
                            <ThemedText style={styles.loginLink}>Log in</ThemedText>
                        </ThemedText>
                    </TouchableOpacity>

                    {!keyboardVisible && (
                        <View style={{ height: hp(18) }} />
                    )}
                    {keyboardVisible && (
                        <View style={{ height: hp(50) }} />
                    )}
                </View>
            </ScrollView>
        </ScreenWrapper>
    );
};

export default Index;

const styles = StyleSheet.create({
    scrollContainer: { flexGrow: 1 },
    container: { flex: 1, paddingHorizontal: wp(4), paddingBottom: hp(3) },
    logo: { width: wp(60), height: hp(10), alignSelf: 'center', marginBottom: hp(2) },
    headerContainer: { marginBottom: hp(2) },
    header: { fontSize: wp(7), fontWeight: '700' },
    subHeader: { marginTop: hp(0.8), fontSize: wp(3.8), lineHeight: 22 },

    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FDECEA',
        borderRadius: wp(2.5),
        paddingVertical: hp(1),
        paddingHorizontal: wp(3),
        marginBottom: hp(2),
    },
    errorText: { color: '#D32F2F', fontSize: wp(3.4), flex: 1 },

    label: { fontSize: wp(3.6), fontWeight: '600', marginBottom: hp(0.8) },
    input: {
        borderWidth: 1,
        // borderColor: 'frgba(128,128,128,0.3)',
        borderRadius: wp(4),
        paddingHorizontal: wp(4),
        marginBottom: hp(2),
    },

    checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(3) },
    checkboxIcon: { textAlign: 'center', width: wp(7) },
    checkboxText: { marginLeft: wp(2), fontSize: wp(3.5), flexShrink: 1 },

    signUpButton: {

        paddingVertical: hp(2),
        borderRadius: wp(100),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: hp(3),
        elevation: 3,
    },
    footerText: { textAlign: 'center' },
    loginLink: { fontWeight: '700', textDecorationLine: 'underline' },
    otpButton: {
        height: 48,
        borderRadius: 14,
        borderWidth: 1,
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: hp(4),

    },
});
