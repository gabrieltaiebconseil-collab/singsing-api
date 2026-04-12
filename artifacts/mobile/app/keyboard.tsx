import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { searchSongs, type SongResult } from "@/lib/api";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function KeyboardSimulator() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(true);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchSongs(query.trim());
      setResults(data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [query]);

  const handleClip = useCallback((song: SongResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/editor",
      params: {
        trackId: song.trackId.toString(),
        trackName: song.trackName,
        artistName: song.artistName,
        collectionName: song.collectionName,
        artworkUrl100: song.artworkUrl100,
        previewUrl: song.previewUrl,
        trackTimeMillis: song.trackTimeMillis.toString(),
      },
    });
  }, []);

  const keyboardContent = (
    <View
      style={[
        styles.keyboardContainer,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.keyboardHeader}>
        <View
          style={[
            styles.keyboardSearchBar,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              borderRadius: 8,
            },
          ]}
        >
          <Feather name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            style={[styles.keyboardInput, { color: colors.foreground }]}
            placeholder="Paroles, artiste..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                setQuery("");
                setResults([]);
                setSearched(false);
              }}
            >
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setShowKeyboard(false)}
          style={styles.keyboardClose}
        >
          <Feather name="x-circle" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.keyboardDivider}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      <ScrollView
        style={styles.keyboardResults}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading && (
          <View style={styles.keyboardLoading}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {!loading && searched && results.length === 0 && (
          <View style={styles.keyboardEmpty}>
            <Text style={[styles.keyboardEmptyText, { color: colors.mutedForeground }]}>
              {"Aucun r\u00E9sultat"}
            </Text>
          </View>
        )}

        {!loading &&
          results.slice(0, 5).map((song) => (
            <Pressable
              key={song.trackId}
              onPress={() => handleClip(song)}
              style={({ pressed }) => [
                styles.keyboardResult,
                {
                  backgroundColor: pressed ? `${colors.primary}10` : "transparent",
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={styles.keyboardResultLeft}>
                <Feather name="music" size={14} color={colors.primary} />
                <View style={styles.keyboardResultInfo}>
                  <Text
                    style={[styles.keyboardResultTitle, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {song.trackName}
                  </Text>
                  <Text
                    style={[styles.keyboardResultArtist, { color: colors.mutedForeground }]}
                    numberOfLines={1}
                  >
                    {song.artistName}
                  </Text>
                </View>
              </View>
              <View style={styles.keyboardResultRight}>
                <Text style={[styles.keyboardResultDuration, { color: colors.mutedForeground }]}>
                  {formatDuration(song.trackTimeMillis)}
                </Text>
                <View style={[styles.clipBadge, { backgroundColor: colors.primary, borderRadius: 6 }]}>
                  <Text style={[styles.clipBadgeText, { color: colors.primaryForeground }]}>
                    {"CLIP"}
                  </Text>
                  <Feather name="arrow-right" size={10} color={colors.primaryForeground} />
                </View>
              </View>
            </Pressable>
          ))}

        {!loading && !searched && (
          <View style={styles.keyboardEmpty}>
            <Text style={[styles.keyboardEmptyText, { color: colors.mutedForeground }]}>
              {"Cherche une chanson pour envoyer un clip"}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.keyboardFooter}>
        <View style={[styles.footerDivider, { backgroundColor: colors.border }]} />
        <View style={styles.footerButtons}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/reply");
            }}
            style={({ pressed }) => [
              styles.footerTab,
              {
                backgroundColor: pressed ? `${colors.primary}10` : "transparent",
                borderRadius: 8,
              },
            ]}
          >
            <Feather name="zap" size={14} color={colors.primary} />
            <Text style={[styles.footerTabText, { color: colors.primary }]}>
              {"Suggestions IA"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/");
            }}
            style={({ pressed }) => [
              styles.footerTab,
              {
                backgroundColor: pressed ? `${colors.mutedForeground}10` : "transparent",
                borderRadius: 8,
              },
            ]}
          >
            <Feather name="folder" size={14} color={colors.mutedForeground} />
            <Text style={[styles.footerTabText, { color: colors.mutedForeground }]}>
              {"Mes clips"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: Platform.OS === "web" ? "rgba(13,10,26,0.75)" : colors.background }]}>
      <StatusBar style="light" />
      {Platform.OS === "web" && (
        <>
          <View style={{ position: "absolute" as const, borderRadius: 9999, pointerEvents: "none" as const, zIndex: 0, top: -150, left: -150, width: 500, height: 500, background: "radial-gradient(circle, rgba(100,50,180,0.50) 0%, transparent 65%)", filter: "blur(80px)" } as any} />
          <View style={{ position: "absolute" as const, borderRadius: 9999, pointerEvents: "none" as const, zIndex: 0, bottom: -80, right: -80, width: 450, height: 450, background: "radial-gradient(circle, rgba(160,40,80,0.40) 0%, transparent 65%)", filter: "blur(70px)" } as any} />
          <View style={{ position: "absolute" as const, borderRadius: 9999, pointerEvents: "none" as const, zIndex: 0, top: "40%", right: -100, width: 300, height: 300, background: "radial-gradient(circle, rgba(20,60,160,0.35) 0%, transparent 70%)", filter: "blur(60px)" } as any} />
        </>
      )}
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 50 : insets.top + 8 },
        ]}
      >
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {"Simulateur clavier"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.simulatorArea}>
        <View
          style={[
            styles.mockChat,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.chatHeader}>
            <View style={[styles.chatAvatar, { backgroundColor: colors.muted }]}>
              <Feather name="user" size={16} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.chatName, { color: colors.foreground }]}>
              {"Marie"}
            </Text>
          </View>
          <View style={styles.chatMessages}>
            <View style={[styles.chatBubbleIn, { backgroundColor: `${colors.primary}15`, borderRadius: 12 }]}>
              <Text style={[styles.chatBubbleText, { color: colors.foreground }]}>
                {"Tu me manques trop \u{2764}\u{FE0F}"}
              </Text>
            </View>
            <View style={[styles.chatBubbleOut, { backgroundColor: colors.muted, borderRadius: 12 }]}>
              <Text style={[styles.chatBubbleText, { color: colors.foreground }]}>
                {"Moi aussi ! Attends je t'envoie quelque chose..."}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.chatInputBar,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.border,
              },
            ]}
          >
            <Feather name="smile" size={18} color={colors.mutedForeground} />
            <View style={[styles.chatInput, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 20 }]}>
              <Text style={[styles.chatInputPlaceholder, { color: colors.mutedForeground }]}>
                {"Message..."}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowKeyboard(true);
              }}
              style={[styles.singsingSwitcher, { backgroundColor: colors.primary, borderRadius: 8 }]}
            >
              <Text style={[styles.singsingSwitcherText, { color: colors.primaryForeground }]}>
                {"SS"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.keyboardLabel}>
          <View style={[styles.labelBadge, { backgroundColor: `${colors.primary}15`, borderRadius: 8 }]}>
            <Feather name="arrow-down" size={12} color={colors.primary} />
            <Text style={[styles.labelText, { color: colors.primary }]}>
              {"Aper\u00E7u du clavier Sing Sing (320px)"}
            </Text>
          </View>
        </View>

        {showKeyboard ? (
          keyboardContent
        ) : (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowKeyboard(true);
            }}
            style={({ pressed }) => [
              styles.reopenButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Feather name="music" size={16} color={colors.primary} />
            <Text style={[styles.reopenText, { color: colors.primary }]}>
              {"Ouvrir le clavier Sing Sing"}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.infoBar, { paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 10 }]}>
        <View style={[styles.infoBadge, { backgroundColor: `${colors.mutedForeground}10`, borderRadius: 8 }]}>
          <Feather name="info" size={12} color={colors.mutedForeground} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            {"Simulateur web \u2014 le vrai clavier n\u00E9cessite Xcode / Android Studio"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  headerSpacer: { width: 30 },
  simulatorArea: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: "flex-end",
    gap: 8,
  },
  mockChat: {
    flex: 1,
    borderWidth: 0.5,
    overflow: "hidden",
    maxHeight: 300,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 8,
  },
  chatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chatName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  chatMessages: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  chatBubbleIn: {
    alignSelf: "flex-start",
    padding: 10,
    maxWidth: "75%",
  },
  chatBubbleOut: {
    alignSelf: "flex-end",
    padding: 10,
    maxWidth: "75%",
  },
  chatBubbleText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  chatInputBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  chatInput: {
    flex: 1,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 0.5,
  },
  chatInputPlaceholder: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  singsingSwitcher: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  singsingSwitcherText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  keyboardLabel: {
    alignItems: "center",
    paddingVertical: 4,
  },
  labelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  labelText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  keyboardContainer: {
    height: 320,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  keyboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    gap: 8,
  },
  keyboardSearchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    gap: 6,
  },
  keyboardInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  keyboardClose: { padding: 4 },
  keyboardDivider: { paddingHorizontal: 8 },
  dividerLine: { height: 1 },
  keyboardResults: {
    flex: 1,
    paddingHorizontal: 8,
  },
  keyboardLoading: {
    alignItems: "center",
    paddingTop: 20,
  },
  keyboardEmpty: {
    alignItems: "center",
    paddingTop: 20,
  },
  keyboardEmptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  keyboardResult: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
  },
  keyboardResultLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  keyboardResultInfo: {
    flex: 1,
  },
  keyboardResultTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  keyboardResultArtist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  keyboardResultRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  keyboardResultDuration: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  clipBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  clipBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  keyboardFooter: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  footerDivider: { height: 1, marginBottom: 6 },
  footerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  footerTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
  },
  footerTabText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  reopenButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: 8,
    borderWidth: 0.5,
  },
  reopenText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  infoBar: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  infoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  infoText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
