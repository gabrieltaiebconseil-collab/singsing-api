import { Feather } from "@expo/vector-icons";
import { useSearchSongs, useGetSongLyrics } from "@workspace/api-client-react";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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

import { TappableLyrics } from "@/components/TappableLyrics";
import { Waveform } from "@/components/Waveform";
import { useColors } from "@/hooks/useColors";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

type QuickStep = "search" | "edit";

export default function QuickClipScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSong, setSelectedSong] = useState<any>(null);
  const [step, setStep] = useState<QuickStep>("search");
  const [startWordIndex, setStartWordIndex] = useState<number | null>(null);
  const [endWordIndex, setEndWordIndex] = useState<number | null>(null);
  const [waveformStart, setWaveformStart] = useState<number | null>(null);
  const [waveformEnd, setWaveformEnd] = useState<number | null>(null);
  const [outOfPreviewMessage, setOutOfPreviewMessage] = useState<string | null>(null);

  const { data: searchData, isLoading: searchLoading } = useSearchSongs(
    { q: searchTerm },
    { query: { enabled: searchTerm.length > 0 } }
  );

  const trackDuration = selectedSong ? (selectedSong.trackTimeMillis || 0) / 1000 : 0;
  const previewDuration = 30;
  const previewStartTime = Math.max(0, trackDuration * 0.3);
  const previewEndTime = previewStartTime + previewDuration;

  const { data: lyricsData, isLoading: lyricsLoading } = useGetSongLyrics(
    {
      title: selectedSong?.trackName || "",
      artist: selectedSong?.artistName || "",
      trackDurationMs: selectedSong?.trackTimeMillis,
    },
    { query: { enabled: !!selectedSong } }
  );

  const words = useMemo(() => lyricsData?.words || [], [lyricsData]);
  const lyricsSource = (lyricsData?.source as string) || "none";
  const hasSyncedOrAiLyrics = lyricsData?.found && words.length > 0 && (lyricsSource === "synced" || lyricsSource === "ai");
  const isWaveformOnly = selectedSong && !lyricsLoading && !hasSyncedOrAiLyrics;

  const previewLabel = useMemo(() => {
    if (trackDuration <= 0) return undefined;
    return `${formatTime(previewStartTime)} \u2013 ${formatTime(previewEndTime)}`;
  }, [previewStartTime, previewEndTime, trackDuration]);

  const startTime = useMemo(() => {
    if (isWaveformOnly) return waveformStart !== null ? previewStartTime + waveformStart : null;
    if (startWordIndex === null || !words[startWordIndex]) return null;
    return words[startWordIndex].time;
  }, [startWordIndex, words, isWaveformOnly, waveformStart, previewStartTime]);

  const endTime = useMemo(() => {
    if (isWaveformOnly) return waveformEnd !== null ? previewStartTime + waveformEnd : null;
    if (endWordIndex === null || !words[endWordIndex]) return null;
    return words[endWordIndex].time;
  }, [endWordIndex, words, isWaveformOnly, waveformEnd, previewStartTime]);

  const clipDuration = useMemo(() => {
    if (startTime === null || endTime === null) return 0;
    return Math.max(0, endTime - startTime);
  }, [startTime, endTime]);

  const handleSearch = useCallback(() => {
    if (query.trim().length > 0) {
      setSearchTerm(query.trim());
    }
  }, [query]);

  const handleSongSelect = useCallback((song: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSong(song);
    setStep("edit");
    setStartWordIndex(null);
    setEndWordIndex(null);
    setWaveformStart(null);
    setWaveformEnd(null);
  }, []);

  const handleWordTap = useCallback(
    (index: number) => {
      setOutOfPreviewMessage(null);
      if (startWordIndex === null) {
        setStartWordIndex(index);
        setEndWordIndex(null);
      } else if (endWordIndex === null) {
        if (index > startWordIndex) {
          setEndWordIndex(index);
        } else if (index < startWordIndex) {
          setStartWordIndex(index);
          setEndWordIndex(null);
        } else {
          setStartWordIndex(null);
        }
      } else {
        setStartWordIndex(index);
        setEndWordIndex(null);
      }
    },
    [startWordIndex, endWordIndex]
  );

  const handleOutOfPreviewTap = useCallback((time: number) => {
    setOutOfPreviewMessage(
      `Ce passage se trouve \u00E0 ${formatTime(time)} \u2014 seule la preview de 30s est disponible.`
    );
    setTimeout(() => setOutOfPreviewMessage(null), 4000);
  }, []);

  const handleWaveformTap = useCallback(
    (timeInPreview: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (waveformStart === null) {
        setWaveformStart(timeInPreview);
        setWaveformEnd(null);
      } else if (waveformEnd === null) {
        if (timeInPreview > waveformStart) {
          setWaveformEnd(timeInPreview);
        } else {
          setWaveformStart(timeInPreview);
          setWaveformEnd(null);
        }
      } else {
        setWaveformStart(timeInPreview);
        setWaveformEnd(null);
      }
    },
    [waveformStart, waveformEnd]
  );

  const handleBackToSearch = useCallback(() => {
    setStep("search");
    setSelectedSong(null);
    setStartWordIndex(null);
    setEndWordIndex(null);
  }, []);

  const hasSelection = startTime !== null && endTime !== null;

  const handleCreateClip = () => {
    if (!selectedSong || startTime === null || endTime === null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let finalEnd = endTime;
    if (finalEnd - startTime < 3) {
      finalEnd = startTime + 3;
    }
    const finalDuration = Math.max(3, finalEnd - startTime);

    router.push({
      pathname: "/share",
      params: {
        trackName: selectedSong.trackName,
        artistName: selectedSong.artistName,
        artworkUrl100: selectedSong.artworkUrl100,
        previewUrl: selectedSong.previewUrl,
        startTime: startTime.toString(),
        endTime: finalEnd.toString(),
        clipDuration: finalDuration.toFixed(1),
        trackTimeMillis: selectedSong.trackTimeMillis.toString(),
      },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: Platform.OS === "web" ? "rgba(13,10,26,0.75)" : colors.background }]}>
      {Platform.OS === "web" && (
        <>
          <View style={{ position: "absolute" as const, borderRadius: 9999, pointerEvents: "none" as const, zIndex: 0, top: -150, left: -150, width: 500, height: 500, background: "radial-gradient(circle, rgba(100,50,180,0.50) 0%, transparent 65%)", filter: "blur(80px)" } as any} />
          <View style={{ position: "absolute" as const, borderRadius: 9999, pointerEvents: "none" as const, zIndex: 0, bottom: -80, right: -80, width: 450, height: 450, background: "radial-gradient(circle, rgba(160,40,80,0.40) 0%, transparent 65%)", filter: "blur(70px)" } as any} />
          <View style={{ position: "absolute" as const, borderRadius: 9999, pointerEvents: "none" as const, zIndex: 0, top: "40%", right: -100, width: 300, height: 300, background: "radial-gradient(circle, rgba(20,60,160,0.35) 0%, transparent 70%)", filter: "blur(60px)" } as any} />
        </>
      )}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={[
          styles.scrollContentInner,
          {
            paddingTop: Platform.OS === "web" ? 50 : insets.top + 8,
            paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === "search" && (
          <>
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: colors.card,
                  borderRadius: colors.radius,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder={"Recherche rapide..."}
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoFocus
                autoCorrect={false}
              />
              {query.length > 0 && (
                <Pressable onPress={() => { setQuery(""); setSearchTerm(""); }}>
                  <Feather name="x" size={18} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>

            {searchLoading && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            {searchData?.results?.map((song) => (
              <Pressable
                key={song.trackId}
                onPress={() => handleSongSelect(song)}
                style={({ pressed }) => [
                  styles.songItem,
                  {
                    backgroundColor: pressed ? `${colors.primary}10` : colors.card,
                    borderRadius: colors.radius,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Image
                  source={{ uri: song.artworkUrl100 }}
                  style={styles.songArt}
                  contentFit="cover"
                />
                <View style={styles.songInfo}>
                  <Text style={[styles.songTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {song.trackName}
                  </Text>
                  <Text style={[styles.songArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {song.artistName}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </>
        )}

        {step === "edit" && selectedSong && (
          <>
            <Pressable onPress={handleBackToSearch} style={styles.backRow}>
              <Feather name="arrow-left" size={18} color={colors.primary} />
              <Text style={[styles.backText, { color: colors.primary }]}>
                {"Retour"}
              </Text>
            </Pressable>

            <View style={styles.editSongInfo}>
              <Image
                source={{ uri: (selectedSong.artworkUrl100 || "").replace("100x100", "200x200") }}
                style={[styles.editArt, { borderRadius: 8 }]}
                contentFit="cover"
              />
              <View style={styles.editDetails}>
                <Text style={[styles.editTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedSong.trackName}
                </Text>
                <Text style={[styles.editArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {selectedSong.artistName}
                </Text>
              </View>
            </View>

            <Waveform
              duration={previewDuration}
              startTime={startTime !== null ? Math.max(0, startTime - previewStartTime) : null}
              endTime={endTime !== null ? Math.max(0, endTime - previewStartTime) : null}
              currentTime={0}
              isPlaying={false}
              onTap={isWaveformOnly ? handleWaveformTap : undefined}
              previewLabel={previewLabel}
            />

            {hasSelection && (
              <View style={[styles.timeRange, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                <Text style={[styles.timeRangeText, { color: colors.foreground }]}>
                  {`${formatTime(startTime!)} \u2192 ${formatTime(endTime!)} \u2022 ${clipDuration.toFixed(1)}s`}
                </Text>
              </View>
            )}

            {lyricsLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                  {"Recherche des paroles..."}
                </Text>
              </View>
            ) : hasSyncedOrAiLyrics ? (
              <>
                {outOfPreviewMessage && (
                  <View style={[styles.outOfPreviewBanner, { backgroundColor: `${colors.clipEnd}15`, borderRadius: colors.radius }]}>
                    <Text style={[styles.outOfPreviewText, { color: colors.clipEnd }]}>
                      {outOfPreviewMessage}
                    </Text>
                  </View>
                )}
                <TappableLyrics
                  words={words}
                  startIndex={startWordIndex}
                  endIndex={endWordIndex}
                  onWordTap={handleWordTap}
                  onOutOfPreviewTap={handleOutOfPreviewTap}
                  previewStartTime={previewStartTime}
                  previewEndTime={previewEndTime}
                />
              </>
            ) : isWaveformOnly ? (
              <Text style={[styles.waveformHint, { color: colors.mutedForeground }]}>
                {"Appuyez sur la waveform pour s\u00E9lectionner le d\u00E9but et la fin"}
              </Text>
            ) : null}

            {hasSelection && (
              <Pressable
                onPress={handleCreateClip}
                style={({ pressed }) => [
                  styles.createButton,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: colors.radius,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Feather name="scissors" size={18} color={colors.primaryForeground} />
                <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>
                  {"Cr\u00E9er ce clip"}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    paddingHorizontal: 16,
    gap: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    gap: 10,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  center: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 8,
  },
  songItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    gap: 10,
  },
  songArt: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  songInfo: {
    flex: 1,
    gap: 2,
  },
  songTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  songArtist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  editSongInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  editArt: {
    width: 52,
    height: 52,
  },
  editDetails: {
    flex: 1,
    gap: 2,
  },
  editTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  editArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  timeRange: {
    padding: 10,
    alignItems: "center",
  },
  timeRangeText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  loadingText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  outOfPreviewBanner: {
    padding: 10,
  },
  outOfPreviewText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  waveformHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 8,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: 8,
    marginTop: 4,
  },
  createButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
