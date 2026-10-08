import React from "react";
import { View, StyleSheet, Text ,TouchableNativeFeedback} from "react-native";
import { ThemedText } from "@/components/ThemedText";  
import { wp } from "@/constants/common";
import {router} from "expo-router";
import { EvilIcons } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColor } from "@/hooks/useThemeColor";

interface CustomHeaderProps {
    pageTitle?: string;
    addingNavigate?: string
    filterElement?: (value: boolean) => void;
    selectProfileImage ?: () => void;
    selectedImage?: { uri: string } | null;

}
export default function CustomHeader({ pageTitle, addingNavigate, filterElement, selectProfileImage, selectedImage, }: CustomHeaderProps) {

    const icon = useThemeColor('icon');
    const background = useThemeColor('background');

  return (
   <View
                            style={{
                                backgroundColor: background,
                                paddingHorizontal: wp(2),
                                paddingVertical: wp(1),
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: wp(1),
                                paddingRight: 15
                            }}
                        >

                            <View style={{}}>
                                <ThemedText type="title" >{pageTitle}</ThemedText>
                                {pageTitle === "Tracking" && <ThemedText type='default' >Role: Broiler
                                </ThemedText>}
                            </View>

                            <TouchableNativeFeedback  style={{ marginLeft: 10 }} >
                                <View >
                                    <Ionicons name="ellipsis-vertical" size={wp(6)} color={icon} />
                                </View>
                            </TouchableNativeFeedback>



                        </View>
  );
}   