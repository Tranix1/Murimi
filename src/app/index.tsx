import { Text, View, StyleSheet } from "react-native";
import Home from "./Home/Index";
import ScreenWrapper from "@/components/ScreenWrapper";


export default function Index() {
  return (
    <ScreenWrapper>
      <Home />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
