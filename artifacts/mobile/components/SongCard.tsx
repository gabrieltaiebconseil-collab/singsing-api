import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface SongCardProps {
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  trackTimeMillis: number;
  lyricsStatus?: "synced" | "plain" | "ai_available" | "waveform_only";
  chorusBadge?: string;
  isOriginal?: boolean;
  isCoupDeCoeur?: boolean;
  curatedWhy?: string;
  source?: "itunes" | "youtube";
  onPress: () => void;
  index?: number;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function SongCard({
  trackName,
  artistName,
  collectionName,
  artworkUrl100,
  trackTimeMillis,
  lyricsStatus,
  chorusBadge,
  isOriginal,
  isCoupDeCoeur,
  curatedWhy,
  source,
  onPress,
  index = 0,
}: SongCardProps) {
  const colors = useColors();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const entranceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    entranceAnim.setValue(0);
    Animated.spring(entranceAnim, {
      toValue: 1,
      delay: index * 80,
      useNativeDriver: true,
      speed: 12,
      bounciness: 8,
    }).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 12,
    }).start();
  };

  return (
    <Animated.View
      style={{
        transform: [
          { scale: Animated.multiply(scaleAnim, entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] })) },
          { translateY: entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
        ],
        opacity: entranceAnim,
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.container,
          {
            backgroundColor: isCoupDeCoeur ? "rgba(245,197,24,0.06)" : "rgba(255,255,255,0.05)",
            borderRadius: colors.radius - 2,
            borderTopWidth: 1.5,
            borderTopColor: isCoupDeCoeur ? "rgba(245,197,24,0.50)" : "rgba(255,255,255,0.45)",
            borderLeftWidth: 0.5,
            borderLeftColor: isCoupDeCoeur ? "rgba(245,197,24,0.20)" : "rgba(255,255,255,0.20)",
            borderRightWidth: 0.5,
            borderRightColor: isCoupDeCoeur ? "rgba(245,197,24,0.10)" : "rgba(255,255,255,0.08)",
            borderBottomWidth: 0.5,
            borderBottomColor: isCoupDeCoeur ? "rgba(245,197,24,0.10)" : "rgba(255,255,255,0.05)",
            ...(Platform.OS === "web" ? {
              backdropFilter: "blur(40px) saturate(160%)",
              WebkitBackdropFilter: "blur(40px) saturate(160%)",
            } : {}),
          } as any,
        ]}
      >
        <Image
          source={{ uri: artworkUrl100.replace("100x100", "200x200") }}
          style={[styles.artwork, { borderRadius: 12 }]}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.info}>
          <Text
            style={[styles.title, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {trackName}
          </Text>
          <View style={styles.artistRow}>
            <Text
              style={[styles.artist, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {artistName}
            </Text>
            {source === "youtube" && (
              <View style={styles.ytBadge}>
                <Text style={styles.ytBadgeText}>YT</Text>
              </View>
            )}
            {isCoupDeCoeur && (
              <View style={styles.coupDeCoeurBadge}>
                <Text style={styles.coupDeCoeurBadgeText}>COUP DE COEUR</Text>
              </View>
            )}
            {isOriginal && !isCoupDeCoeur && (
              <View style={styles.originalBadge}>
                <Text style={styles.originalBadgeText}>ORIGINAL</Text>
              </View>
            )}
          </View>
          {curatedWhy && (
            <Text style={[styles.curatedWhy, { color: "rgba(245,197,24,0.7)" }]} numberOfLines={1}>
              {curatedWhy}
            </Text>
          )}
          <View style={styles.metaRow}>
            <Text
              style={[styles.album, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {collectionName}
            </Text>
            {lyricsStatus && (() => {
              const tierConfig: Record<string, { dot: string; label: string; symbol: string }> = {
                synced: { dot: "#22C55E", label: "Paroles sync", symbol: "●" },
                plain: { dot: "#22C55E", label: "Paroles disponibles", symbol: "●" },
                ai_available: { dot: "#FF9800", label: "Paroles reconstitu\u00E9es", symbol: "◉" },
                waveform_only: { dot: "#888888", label: "Waveform uniquement", symbol: "◌" },
              };
              const tier = tierConfig[lyricsStatus] || tierConfig.waveform_only;
              return (
                <View style={styles.lyricsBadge}>
                  <View style={[styles.lyricsDot, { backgroundColor: tier.dot }]} />
                  <Text style={[styles.lyricsLabel, { color: tier.dot }]}>
                    {tier.label}
                  </Text>
                </View>
              );
            })()}
            {chorusBadge && (
              <View style={styles.lyricsBadge}>
                <View style={[styles.lyricsDot, { backgroundColor: "rgba(180,140,255,0.9)" }]} />
                <Text style={[styles.lyricsLabel, { color: "rgba(180,140,255,0.9)" }]}>
                  {chorusBadge}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.right}>
          <Text style={[styles.duration, { color: colors.mutedForeground }]}>
            {formatDuration(trackTimeMillis)}
          </Text>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 10,
  },
  artwork: {
    width: 56,
    height: 56,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  artist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  originalBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.20)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  originalBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.5,
  },
  ytBadge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  ytBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.5,
  },
  coupDeCoeurBadge: {
    backgroundColor: "rgba(245,197,24,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(245,197,24,0.35)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  coupDeCoeurBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(245,197,24,0.9)",
    letterSpacing: 0.5,
  },
  curatedWhy: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  album: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flexShrink: 1,
  },
  lyricsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  lyricsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lyricsLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  right: {
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  duration: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
