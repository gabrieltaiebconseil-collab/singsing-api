import { Feather } from "@expo/vector-icons";
import { useGetReplySuggestions } from "@workspace/api-client-react";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

type LangOption = { code: string; label: string };

const LANGUAGES: LangOption[] = [
  { code: "fr", label: "Fran\u00E7ais" },
  { code: "en", label: "English" },
  { code: "es", label: "Espa\u00F1ol" },
  { code: "it", label: "Italiano" },
  { code: "tr", label: "T\u00FCrk\u00E7e" },
  { code: "other", label: "Autre" },
];

export default function ReplyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [selectedLang, setSelectedLang] = useState("fr");

  const {
    mutate: fetchSuggestions,
    data: suggestionsData,
    isPending: isLoading,
    error,
    reset,
  } = useGetReplySuggestions();

  const handleSubmit = () => {
    if (message.trim().length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    fetchSuggestions({ data: { message: message.trim(), language: selectedLang } });
  };

  const handleSuggestionTap = (suggestion: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const itunes = suggestion.itunes;
    if (!itunes) return;

    router.push({
      pathname: "/editor",
      params: {
        trackId: itunes.trackId.toString(),
        trackName: itunes.trackName,
        artistName: itunes.artistName,
        collectionName: itunes.collectionName,
        artworkUrl100: itunes.artworkUrl100,
        previewUrl: itunes.previewUrl,
        trackTimeMillis: itunes.trackTimeMillis.toString(),
      },
    });
  };

  const handleReset = () => {
    setMessage("");
    reset();
  };

  const suggestions = suggestionsData?.suggestions || [];

  return (
    <View style={[styles.container, { backgroundColor: Platform.OS === "web" ? "rgba(13,10,26,0.75)" : colors.background }]}>
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
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 8 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {"R\u00E9ponds en chanson"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={[
          styles.scrollContentInner,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.introSection}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
            <Feather name="message-circle" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.introTitle, { color: colors.foreground }]}>
            {"R\u00E9ponds avec une chanson"}
          </Text>
          <Text style={[styles.introSubtitle, { color: colors.mutedForeground }]}>
            {"Colle le message que tu as re\u00E7u et on te sugg\u00E8re le clip parfait pour r\u00E9pondre"}
          </Text>
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
            {"MESSAGE RE\u00C7U"}
          </Text>
          <View
            style={[
              styles.textAreaWrapper,
              {
                backgroundColor: colors.card,
                borderRadius: colors.radius,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              style={[styles.textArea, { color: colors.foreground }]}
              placeholder={"Colle le message que tu as re\u00E7u..."}
              placeholderTextColor={colors.mutedForeground}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!isLoading}
            />
          </View>

          <View style={styles.langSection}>
            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
              {"LANGUE DES CHANSONS"}
            </Text>
            <View style={styles.langPills}>
              {LANGUAGES.map((lang) => {
                const isActive = selectedLang === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedLang(lang.code);
                    }}
                    style={[
                      styles.langPill,
                      {
                        backgroundColor: isActive ? colors.primary : colors.card,
                        borderColor: isActive ? colors.primary : colors.border,
                        borderRadius: 20,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.langPillText,
                        { color: isActive ? colors.primaryForeground : colors.foreground },
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={suggestions.length > 0 ? styles.buttonColumn : styles.buttonRow}>
            <Pressable
              onPress={handleSubmit}
              disabled={message.trim().length === 0 || isLoading}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: message.trim().length === 0 ? colors.muted : colors.primary,
                  borderRadius: colors.radius,
                  opacity: pressed ? 0.9 : 1,
                  width: "100%",
                },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Feather name="cpu" size={18} color={colors.primaryForeground} />
              )}
              <Text
                style={[styles.submitButtonText, { color: colors.primaryForeground }]}
              >
                {isLoading ? "Analyse en cours..." : "Trouver des r\u00E9ponses"}
              </Text>
            </Pressable>
            {suggestions.length > 0 && (
              <Pressable
                onPress={handleReset}
                style={({ pressed }) => [
                  styles.resetButton,
                  {
                    backgroundColor: colors.card,
                    borderRadius: colors.radius,
                    borderColor: colors.border,
                    opacity: pressed ? 0.8 : 1,
                    width: "100%",
                  },
                ]}
              >
                <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
                <Text style={[styles.resetButtonText, { color: colors.mutedForeground }]}>
                  {"Nouveau message"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {isLoading && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              {"L'IA cherche les meilleures r\u00E9ponses musicales..."}
            </Text>
          </View>
        )}

        {error && !isLoading && (
          <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}10`, borderRadius: colors.radius }]}>
            <Feather name="alert-circle" size={16} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {"Impossible de g\u00E9n\u00E9rer des suggestions. R\u00E9essayez."}
            </Text>
          </View>
        )}

        {suggestions.length > 0 && (
          <View style={styles.suggestionsSection}>
            <Text style={[styles.suggestionsLabel, { color: colors.mutedForeground }]}>
              {"SUGGESTIONS IA"}
            </Text>
            {suggestions.map((suggestion: any, index: number) => (
              <Pressable
                key={index}
                onPress={() => handleSuggestionTap(suggestion)}
                style={({ pressed }) => [
                  styles.suggestionCard,
                  {
                    backgroundColor: colors.card,
                    borderRadius: colors.radius,
                    borderColor: colors.border,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <View style={styles.suggestionHeader}>
                  <Image
                    source={{
                      uri: (suggestion.itunes?.artworkUrl100 || "").replace(
                        "100x100",
                        "200x200"
                      ),
                    }}
                    style={[styles.suggestionArt, { borderRadius: 8 }]}
                    contentFit="cover"
                    transition={200}
                  />
                  <View style={styles.suggestionInfo}>
                    <Text
                      style={[styles.suggestionTitle, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {suggestion.itunes?.trackName || suggestion.title}
                    </Text>
                    <Text
                      style={[styles.suggestionArtist, { color: colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {suggestion.itunes?.artistName || suggestion.artist}
                    </Text>
                    <View style={[styles.aiBadge, { backgroundColor: `${colors.primary}15` }]}>
                      <Feather name="cpu" size={10} color={colors.primary} />
                      <Text style={[styles.aiBadgeText, { color: colors.primary }]}>
                        {"IA"}
                      </Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </View>

                <View style={[styles.lyricsQuote, { backgroundColor: `${colors.primary}08`, borderRadius: 8 }]}>
                  <Text style={[styles.quoteIcon, { color: colors.primary }]}>
                    {"\u201C"}
                  </Text>
                  <Text style={[styles.lyricsFragment, { color: colors.foreground }]}>
                    {suggestion.lyrics_fragment}
                  </Text>
                  <Text style={[styles.quoteIcon, { color: colors.primary }]}>
                    {"\u201D"}
                  </Text>
                </View>

                <Text style={[styles.whyText, { color: colors.mutedForeground }]}>
                  {suggestion.why}
                </Text>

                {!suggestion.has_lyrics && (
                  <View style={[styles.noLyricsBadge, { backgroundColor: `${colors.destructive}10`, borderRadius: 6 }]}>
                    <Text style={[styles.noLyricsBadgeText, { color: colors.destructive }]}>
                      {"Paroles non disponibles \u2014 mode waveform"}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {suggestions.length === 0 && !isLoading && !error && message.length === 0 && (
          <View style={styles.examplesSection}>
            <Text style={[styles.examplesTitle, { color: colors.mutedForeground }]}>
              {"EXEMPLES DE MESSAGES"}
            </Text>
            {[
              "je suis tellement fatigu\u00E9 de tout",
              "tu me manques trop",
              "j'ai eu la promo !!!",
              "on se remet ensemble ?",
            ].map((example, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  setMessage(example);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={({ pressed }) => [
                  styles.exampleChip,
                  {
                    backgroundColor: pressed ? `${colors.primary}15` : colors.card,
                    borderRadius: colors.radius,
                    borderColor: colors.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={[styles.exampleText, { color: colors.foreground }]}>
                  {`\u201C${example}\u201D`}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 20,
  },
  introSection: {
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  introTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  introSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  inputSection: {
    gap: 10,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  textAreaWrapper: {
    borderWidth: 0.5,
    padding: 12,
    minHeight: 100,
  },
  textArea: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    minHeight: 80,
  },
  langSection: {
    gap: 8,
  },
  langPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 0.5,
  },
  langPillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  buttonColumn: {
    gap: 8,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: 8,
    paddingHorizontal: 20,
  },
  submitButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: 6,
    paddingHorizontal: 16,
    borderWidth: 0.5,
  },
  resetButtonText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  loadingSection: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  suggestionsSection: {
    gap: 12,
  },
  suggestionsLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  suggestionCard: {
    padding: 14,
    gap: 10,
    borderWidth: 0.5,
  },
  suggestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  suggestionArt: {
    width: 52,
    height: 52,
  },
  suggestionInfo: {
    flex: 1,
    gap: 2,
  },
  suggestionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  suggestionArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  aiBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  lyricsQuote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quoteIcon: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    lineHeight: 22,
  },
  lyricsFragment: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
    lineHeight: 20,
  },
  whyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  noLyricsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  noLyricsBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  examplesSection: {
    gap: 10,
    marginTop: 8,
  },
  examplesTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  exampleChip: {
    padding: 14,
    borderWidth: 0.5,
  },
  exampleText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
});
