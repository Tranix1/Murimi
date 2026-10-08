import React from "react";
import {  View, StyleSheet, Text } from "react-native";
import {ThemedText } from "@/components/ThemedText";
import CustomHeader from "@/components/CustomHeader";

export default function Home() {
  return (
    <View >
      <CustomHeader pageTitle="Murimi"/>
      <ThemedText type="title">Welcome to the Home Page</ThemedText>
      <Text>This is the main content of the home page.</Text>
    </View>
  );
}