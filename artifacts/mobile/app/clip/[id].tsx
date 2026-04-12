import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type ClipState = "loading" | "ready" | "error" | "expired";

export default function ClipPlaybackScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [clipState, setClipState] = useState<ClipState>("loading");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setClipState("error");
      return;
    }

    async function fetchClip() {
      try {
        const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
        const response = await fetch(`${baseUrl}/api/songs/clip/${id}`);

        if (response.status === 404) {
          setClipState("expired");
          return;
        }

        if (!response.ok) {
          setClipState("error");
          return;
        }

        const blob = await response.blob();
        if (Platform.OS === "web") {
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        }
        setClipState("ready");
      } catch {
        setClipState("error");
      }
    }

    fetchClip();
  }, [id]);

  const handleReply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/reply");
  };

  const handleHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          { paddingTop: Platform.OS === "web" ? 80 : insets.top + 40 },
        ]}
      >
        {clipState === "loading" && (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              {"Chargement du clip..."}
            </Text>
          </View>
        )}

        {clipState === "expired" && (
          <View style={styles.stateContainer}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.mutedForeground}20` }]}>
              <Feather name="clock" size={32} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              {"Clip expir\u00E9"}
            </Text>
            <Text style={[styles.stateSubtitle, { color: colors.mutedForeground }]}>
              {"Ce clip n'est plus disponible. Les clips expirent apr\u00E8s 10 minutes."}
            </Text>
          </View>
        )}

        {clipState === "error" && (
          <View style={styles.stateContainer}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.destructive}15` }]}>
              <Feather name="alert-circle" size={32} color={colors.destructive} />
            </View>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              {"Erreur"}
            </Text>
            <Text style={[styles.stateSubtitle, { color: colors.mutedForeground }]}>
              {"Impossible de charger le clip audio."}
            </Text>
          </View>
        )}

        {clipState === "ready" && (
          <View style={styles.stateContainer}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
              <Feather name="music" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>
              {"Clip Sing Sing"}
            </Text>

            {Platform.OS === "web" && audioUrl && (
              <View style={[styles.playerContainer, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                <audio
                  controls
                  src={audioUrl}
                  style={{ width: "100%", height: 48 } as any}
                />
              </View>
            )}

            <Text style={[styles.stateSubtitle, { color: colors.mutedForeground }]}>
              {"\u00C9coute ce clip et r\u00E9ponds avec ta propre chanson !"}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={handleReply}
            style={({ pressed }) => [
              styles.replyButton,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Feather name="message-circle" size={18} color={colors.primaryForeground} />
            <Text style={[styles.replyButtonText, { color: colors.primaryForeground }]}>
              {"R\u00E9ponds en chanson \u2192"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleHome}
            style={({ pressed }) => [
              styles.homeButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="home" size={16} color={colors.primary} />
            <Text style={[styles.homeButtonText, { color: colors.primary }]}>
              {"Cr\u00E9er mon propre clip"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  stateContainer: {
    alignItems: "center",
    gap: 12,
    marginBottom: 40,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stateTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  stateSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  playerContainer: {
    width: "100%",
    padding: 12,
    marginVertical: 8,
  },
  actions: {
    gap: 12,
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    gap: 8,
  },
  replyButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  homeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    gap: 6,
  },
  homeButtonText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
