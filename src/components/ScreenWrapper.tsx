import React, { ReactNode, useEffect, useState } from 'react';
import {
  TouchableOpacity,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useThemeColor } from '@/hooks/useThemeColor';
import { hp, wp } from '@/constants/common';
import { ThemedText } from './ThemedText';

type ScreenWrapperProps = {
  children: ReactNode;
  fh?: boolean;
  ishome?: boolean;
  showError?: () => void;
};

const ScreenWrapper = ({
  children,
  fh = true,
  ishome = false,
  showError = () => {},
}: ScreenWrapperProps) => {
  const { top, bottom } = useSafeAreaInsets();

  const background = useThemeColor('background');
  const icon = useThemeColor('icon');
  const backgroundLight = useThemeColor('backgroundLight');
  const coolGray = useThemeColor('coolGray');

  const [isConnected, setIsConnected] = useState(true);
  const [showStatus, setShowStatus] = useState(false);
  const [showerror, setShowError] = useState(false);

  /**
   * Monitor internet connection
   */
 

  /**
   * Automatically hide error message
   */
  useEffect(() => {
    if (!showerror) return;

    const timer = setTimeout(() => {
      setShowError(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [showerror]);

  const paddingTop = top > 0 ? top : 30;

  return (
    <View
      style={[
        {
          flex: 1,
          paddingTop,
          backgroundColor: background,
        },
        fh && {
          minHeight: hp(100),
        },
      ]}
    >
      {/* Internet connection status */}
      {showStatus && ishome && (
        <View
          style={{
            backgroundColor: isConnected ? '#81C784' : coolGray,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: wp(2),
            padding: wp(2),
          }}
        >
          <Ionicons
            name={isConnected ? 'cloud' : 'cloud-offline-outline'}
            size={wp(4)}
            color="#fff"
          />

          <ThemedText
            type="tiny"
            style={{
              color: '#fff',
            }}
          >
            {isConnected
              ? 'Internet Restored'
              : 'No Internet Access'}
          </ThemedText>
        </View>
      )}

    <StatusBar style="auto" />

      {/* Main content */}
      <GestureHandlerRootView
        style={{
          flex: 1,
        }}
      >
        {children}
      </GestureHandlerRootView>

      {/* Error notification */}
      {showerror && (
        <View
          style={{
            position: 'absolute',
            borderRadius: wp(4),
            padding: wp(3),
            flexDirection: 'row',
            gap: wp(2),
            backgroundColor: backgroundLight,
            bottom: hp(8) + bottom,
            width: wp(90),
            marginHorizontal: wp(5),
            elevation: 3,
            shadowOpacity: 0.3,
            shadowRadius: 7,
            shadowColor: icon + '4c',
            paddingVertical: wp(4),
          }}
        >
          <Ionicons
            name="warning-outline"
            size={wp(5)}
            color={icon}
          />

          <ThemedText
            style={{
              flex: 1,
              paddingTop: 0,
            }}
          >
            Error fetching document:
          </ThemedText>

          <TouchableOpacity
            onPress={() => setShowError(false)}
            style={{
              padding: wp(1),
            }}
          >
            <Ionicons
              name="close"
              size={wp(4)}
              color={icon}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default ScreenWrapper;
