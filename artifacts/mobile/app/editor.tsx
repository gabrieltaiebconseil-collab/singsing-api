import { Feather } from "@expo/vector-icons";
import { useGetSongLyrics } from "@workspace/api-client-react";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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

type LyricsSource = "synced" | "plain" | "ai" | "none";

function CreatePopup({ visible, lyricsPreview, duration, onPress, onReset, colors, bottomInset, previewUrl, clipStartInPreview, clipDurationInPreview, isOutOfPreview, isYouTube }: {
  visible: boolean;
  lyricsPreview: string;
  duration: number;
  onPress: () => void;
  onReset: () => void;
  colors: any;
  bottomInset: number;
  previewUrl: string;
  clipStartInPreview: number;
  clipDurationInPreview: number;
  isOutOfPreview: boolean;
  isYouTube: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const btnScale = useRef(new Animated.Value(1)).current;
  const previewScale = useRef(new Animated.Value(1)).current;
  const [isListening, setIsListening] = useState(false);
  const audioRef = useRef<any>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 8,
    }).start();
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (!visible) {
      stopPreviewPlayback();
    }
  }, [visible]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  useEffect(() => {
    return () => {
      stopPreviewPlayback();
    };
  }, []);

  const stopPreviewPlayback = () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { if ((audioRef.current as any)._blobUrl) URL.revokeObjectURL((audioRef.current as any)._blobUrl); } catch {}
      audioRef.current = null;
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setIsListening(false);
  };

  const handlePreviewListen = () => {
    if (Platform.OS !== "web" || !previewUrl) return;

    if (isListening) {
      stopPreviewPlayback();
      return;
    }

    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current = null;
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let seekTo = Math.max(0, clipStartInPreview);
    let playDur = Math.min(30, clipDurationInPreview);
    if (seekTo >= 30) seekTo = Math.max(0, 30 - playDur);
    if (seekTo + playDur > 30) playDur = 30 - seekTo;
    if (playDur <= 0) playDur = 5;

    const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
    const proxiedUrl = `${baseUrl}/api/songs/preview-audio?url=${encodeURIComponent(previewUrl)}`;

    setIsListening(true);

    fetch(proxiedUrl)
      .then(r => {
        if (!r.ok) throw new Error("Fetch failed");
        return r.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const audio = new Audio(blobUrl);
        audioRef.current = audio;
        (audio as any)._blobUrl = blobUrl;

        const doPlay = () => {
          if (audioRef.current !== audio) {
            URL.revokeObjectURL(blobUrl);
            return;
          }
          try { audio.currentTime = seekTo; } catch {}
          audio.play().then(() => {
            stopTimerRef.current = setTimeout(() => {
              stopPreviewPlayback();
            }, playDur * 1000);
          }).catch((e) => {
            console.warn("Preview play failed:", e);
            URL.revokeObjectURL(blobUrl);
            setIsListening(false);
            audioRef.current = null;
          });
        };

        if (audio.readyState >= 2) {
          doPlay();
        } else {
          audio.addEventListener("canplay", doPlay, { once: true });
          audio.addEventListener("error", () => {
            console.warn("Preview blob audio error");
            URL.revokeObjectURL(blobUrl);
            setIsListening(false);
            audioRef.current = null;
          }, { once: true });
        }
      })
      .catch((e) => {
        console.warn("Preview fetch failed:", e);
        setIsListening(false);
        audioRef.current = null;
      });
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  const shimmerBg = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ["#7B2FBE", "#E8183A", "#7B2FBE"],
  });

  const durationText = duration >= 1
    ? `${Math.round(duration)}s`
    : `${(duration * 10).toFixed(0)}00ms`;

  const canPreview = Platform.OS === "web" && !!previewUrl && !isYouTube;

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.popupContainer,
        {
          transform: [{ translateY }],
          paddingBottom: Math.max(bottomInset, 20) + 16,
          opacity: slideAnim,
        },
      ]}
    >
      <View style={styles.popupHandle} />

      {lyricsPreview ? (
        <Text style={styles.popupLyrics} numberOfLines={2}>
          {`\u201C${lyricsPreview}\u201D`}
        </Text>
      ) : null}

      <Text style={styles.popupDuration}>
        {`${durationText} \u00B7 pr\u00EAt \u00E0 partager`}
      </Text>

      {isOutOfPreview && !isYouTube ? (
        <View style={styles.popupWarning}>
          <Feather name="alert-triangle" size={14} color="#FFB74D" />
          <Text style={styles.popupWarningText}>
            {"Le clip sera ajust\u00E9 \u00E0 la preview \u00B7 \u00E9coute avant de cr\u00E9er"}
          </Text>
        </View>
      ) : null}

      {canPreview && (
        <Animated.View style={{ transform: [{ scale: previewScale }] }}>
          <Pressable
            onPress={handlePreviewListen}
            onPressIn={() => { Animated.spring(previewScale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 6 }).start(); }}
            onPressOut={() => { Animated.spring(previewScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start(); }}
            style={styles.popupPreviewBtn}
          >
            <Feather name={isListening ? "pause" : "play"} size={16} color="rgba(255,255,255,0.85)" />
            <Text style={styles.popupPreviewText}>
              {isListening ? "Arr\u00EAter" : "\u00C9couter l\u2019aper\u00E7u"}
            </Text>
          </Pressable>
        </Animated.View>
      )}

      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => { Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 6 }).start(); }}
          onPressOut={() => { Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start(); }}
          style={styles.popupBtn}
        >
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: shimmerBg, borderRadius: 16 }]} />
          <Text style={styles.popupBtnText}>
            {"\uD83C\uDFB5 Cr\u00E9er ce Sing"}
          </Text>
        </Pressable>
      </Animated.View>

      <Pressable onPress={onReset} style={styles.popupReset}>
        <Text style={styles.popupResetText}>{"Recommencer"}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function EditorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    trackId: string;
    trackName: string;
    artistName: string;
    collectionName: string;
    artworkUrl100: string;
    previewUrl: string;
    trackTimeMillis: string;
    source?: string;
    youtubeId?: string;
    youtubeQuery?: string;
  }>();

  const [startWordIndex, setStartWordIndex] = useState<number | null>(null);
  const [endWordIndex, setEndWordIndex] = useState<number | null>(null);
  const [waveformStart, setWaveformStart] = useState<number | null>(null);
  const [waveformEnd, setWaveformEnd] = useState<number | null>(null);
  const [chorusAutoSelected, setChorusAutoSelected] = useState(false);
  const [chorusMessage, setChorusMessage] = useState<string | null>(null);

  const trackDuration = parseInt(params.trackTimeMillis || "0", 10) / 1000;
  const previewDuration = 30;
  const previewStartTime = Math.max(0, trackDuration * 0.3);
  const previewEndTime = previewStartTime + previewDuration;

  const { data: lyricsData, isLoading: lyricsLoading } = useGetSongLyrics(
    {
      title: params.trackName || "",
      artist: params.artistName || "",
      trackDurationMs: params.trackTimeMillis ? parseFloat(params.trackTimeMillis) : undefined,
    },
    {
      query: {
        enabled: !!(params.trackName && params.artistName),
      },
    }
  );

  const words = useMemo(() => lyricsData?.words || [], [lyricsData]);
  const lyricsSource: LyricsSource = (lyricsData?.source as LyricsSource) || "none";
  const hasSyncedOrAiLyrics = lyricsData?.found && words.length > 0 && (lyricsSource === "synced" || lyricsSource === "ai");
  const isWaveformOnly = !lyricsLoading && !hasSyncedOrAiLyrics;

  const chorusInfo = lyricsData?.chorusInfo as {
    startTime: number;
    endTime: number;
    startWordIndex: number;
    endWordIndex: number;
    chorusText: string;
    inPreview: boolean;
  } | null | undefined;

  useEffect(() => {
    if (!chorusInfo || chorusAutoSelected || !hasSyncedOrAiLyrics) return;

    setStartWordIndex(chorusInfo.startWordIndex);
    setEndWordIndex(chorusInfo.endWordIndex);
    setChorusAutoSelected(true);
    setChorusMessage("Refrain d\u00E9tect\u00E9 \u2014 s\u00E9lection automatique");
    setTimeout(() => setChorusMessage(null), 4000);
  }, [chorusInfo, chorusAutoSelected, hasSyncedOrAiLyrics]);

  const previewLabel = useMemo(() => {
    if (trackDuration <= 0) return undefined;
    return `${formatTime(previewStartTime)} \u2013 ${formatTime(previewEndTime)} (sur ${formatTime(trackDuration)})`;
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

  const lyricsPreview = useMemo(() => {
    if (startWordIndex === null || endWordIndex === null || words.length === 0) return "";
    const start = Math.min(startWordIndex, endWordIndex);
    const end = Math.max(startWordIndex, endWordIndex);
    const selected = words.slice(start, end + 1).map((w: any) => w.word).join(" ");
    return selected.length > 40 ? selected.substring(0, 38) + "\u2026" : selected;
  }, [startWordIndex, endWordIndex, words]);

  const handleReset = useCallback(() => {
    setStartWordIndex(null);
    setEndWordIndex(null);
  }, []);

  const handleWordTap = useCallback(
    (index: number) => {
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

  const hasSelection = startTime !== null && endTime !== null;
  const isYouTube = params.source === "youtube";

  const clipStartInPreview = useMemo(() => {
    if (startTime === null) return 0;
    return startTime - previewStartTime;
  }, [startTime, previewStartTime]);

  const clipEndInPreview = useMemo(() => {
    if (endTime === null) return 0;
    return endTime - previewStartTime;
  }, [endTime, previewStartTime]);

  const clipDurationInPreview = useMemo(() => {
    return Math.max(0, clipEndInPreview - clipStartInPreview);
  }, [clipStartInPreview, clipEndInPreview]);

  const isOutOfPreview = useMemo(() => {
    if (!hasSelection || isYouTube) return false;
    return clipStartInPreview < -0.5 || clipEndInPreview > previewDuration + 0.5;
  }, [hasSelection, clipStartInPreview, clipEndInPreview, previewDuration, isYouTube]);

  const MIN_CLIP_DURATION = 3;

  const handleCreateClip = () => {
    if (startTime === null || endTime === null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let finalEnd = endTime;
    if (finalEnd - startTime < MIN_CLIP_DURATION) {
      finalEnd = startTime + MIN_CLIP_DURATION;
    }
    const finalDuration = Math.max(MIN_CLIP_DURATION, finalEnd - startTime);

    let selectedLyrics = "";
    if (startWordIndex !== null && endWordIndex !== null && words.length > 0) {
      const start = Math.min(startWordIndex, endWordIndex);
      const end = Math.max(startWordIndex, endWordIndex);
      selectedLyrics = words.slice(start, end + 1).map((w: any) => w.word).join(" ");
    }

    router.push({
      pathname: "/share",
      params: {
        trackName: params.trackName,
        artistName: params.artistName,
        artworkUrl100: params.artworkUrl100,
        previewUrl: params.previewUrl || "",
        startTime: startTime.toString(),
        endTime: finalEnd.toString(),
        clipDuration: finalDuration.toFixed(1),
        trackTimeMillis: params.trackTimeMillis,
        lyrics: selectedLyrics,
        ...(params.source === "youtube" ? {
          source: "youtube",
          youtubeQuery: params.youtubeQuery || "",
        } : {}),
      },
    });
  };

  const getSourceBadge = (): { label: string; icon: keyof typeof Feather.glyphMap } | null => {
    switch (lyricsSource) {
      case "synced": return null;
      case "plain": return { label: "Paroles non synchronis\u00E9es", icon: "type" };
      case "ai": return { label: "Paroles g\u00E9n\u00E9r\u00E9es par IA", icon: "cpu" };
      default: return null;
    }
  };

  const sourceBadge = hasSyncedOrAiLyrics ? getSourceBadge() : null;

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
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 8,
          },
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
          {"Cr\u00E9er un clip"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={[
          styles.scrollContentInner,
          { paddingBottom: hasSelection ? 240 : (Platform.OS === "web" ? 34 : insets.bottom + 20) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.songInfo}>
          <Image
            source={{
              uri: (params.artworkUrl100 || "").replace("100x100", "400x400"),
            }}
            style={[styles.artwork, { borderRadius: colors.radius }]}
            contentFit="cover"
            transition={300}
          />
          <View style={styles.songDetails}>
            <Text
              style={[styles.songTitle, { color: colors.foreground }]}
              numberOfLines={2}
            >
              {params.trackName}
            </Text>
            <Text
              style={[styles.songArtist, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {params.artistName}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {"WAVEFORM"}
          </Text>
          <Waveform
            duration={previewDuration}
            startTime={
              startTime !== null
                ? Math.max(0, startTime - previewStartTime)
                : null
            }
            endTime={
              endTime !== null
                ? Math.max(0, endTime - previewStartTime)
                : null
            }
            currentTime={0}
            isPlaying={false}
            onTap={isWaveformOnly ? handleWaveformTap : undefined}
            previewLabel={previewLabel}
          />
          {isWaveformOnly && (
            <Text style={[styles.waveformHint, { color: colors.mutedForeground }]}>
              {waveformStart === null
                ? "Paroles non synchronis\u00E9es \u2014 glisse sur la waveform pour choisir ton passage"
                : waveformEnd === null
                  ? "Appuyez pour d\u00E9finir la fin"
                  : "S\u00E9lection pr\u00EAte ! Appuyez pour res\u00E9lectionner"}
            </Text>
          )}
        </View>

        {hasSelection && (
          <View
            style={[
              styles.timeRange,
              {
                backgroundColor: colors.card,
                borderRadius: colors.radius,
              },
            ]}
          >
            <View style={styles.timeItem}>
              <View
                style={[styles.timeDot, { backgroundColor: colors.clipStart }]}
              />
              <Text
                style={[styles.timeLabel, { color: colors.mutedForeground }]}
              >
                {"D\u00E9but"}
              </Text>
              <Text style={[styles.timeValue, { color: colors.foreground }]}>
                {formatTime(startTime!)}
              </Text>
            </View>
            <Feather
              name="arrow-right"
              size={16}
              color={colors.mutedForeground}
            />
            <View style={styles.timeItem}>
              <View
                style={[styles.timeDot, { backgroundColor: colors.clipEnd }]}
              />
              <Text
                style={[styles.timeLabel, { color: colors.mutedForeground }]}
              >
                {"Fin"}
              </Text>
              <Text style={[styles.timeValue, { color: colors.foreground }]}>
                {formatTime(endTime!)}
              </Text>
            </View>
            <View
              style={[
                styles.durationBadge,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text style={[styles.durationText, { color: colors.primaryForeground }]}>
                {`${clipDuration.toFixed(1)}s`}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          {lyricsLoading ? (
            <View style={styles.lyricsLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                style={[
                  styles.lyricsLoadingText,
                  { color: colors.mutedForeground },
                ]}
              >
                {"Recherche des paroles..."}
              </Text>
            </View>
          ) : hasSyncedOrAiLyrics ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {"PAROLES COMPL\u00C8TES"}
              </Text>

              {sourceBadge && (
                <View style={[styles.sourceBadge, { backgroundColor: colors.secondary, borderRadius: 8 }]}>
                  <Feather name={sourceBadge.icon} size={12} color={colors.secondaryForeground} />
                  <Text style={[styles.sourceBadgeText, { color: colors.secondaryForeground }]}>
                    {sourceBadge.label}
                  </Text>
                </View>
              )}

              <Text
                style={[styles.instruction, { color: colors.mutedForeground }]}
              >
                {startWordIndex === null
                  ? "Appuie sur le premier mot de ton clip"
                  : endWordIndex === null
                    ? "Maintenant appuie sur le dernier mot"
                    : "Parfait ! Appuie pour res\u00E9lectionner"}
              </Text>

              {chorusMessage && (
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  backgroundColor: "rgba(100,50,180,0.15)",
                  borderRadius: colors.radius,
                  marginBottom: 8,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(150,100,255,0.30)",
                }}>
                  <Feather
                    name="music"
                    size={14}
                    color="rgba(180,140,255,0.9)"
                  />
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, flex: 1 }}>
                    {chorusMessage}
                  </Text>
                </View>
              )}

              <TappableLyrics
                words={words}
                startIndex={startWordIndex}
                endIndex={endWordIndex}
                onWordTap={handleWordTap}
              />
            </>
          ) : (
            <View style={styles.noLyrics}>
              <Feather
                name="music"
                size={24}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.noLyricsText, { color: colors.mutedForeground }]}
              >
                {"Aucune parole trouv\u00E9e pour cette chanson"}
              </Text>
              <Text
                style={[styles.noLyricsSubtext, { color: colors.mutedForeground }]}
              >
                {"Utilisez la waveform ci-dessus pour s\u00E9lectionner votre clip"}
              </Text>
            </View>
          )}
        </View>

      </ScrollView>

      <CreatePopup
        visible={hasSelection}
        lyricsPreview={lyricsPreview}
        duration={clipDuration}
        onPress={handleCreateClip}
        onReset={handleReset}
        colors={colors}
        bottomInset={Platform.OS === "web" ? 0 : insets.bottom}
        previewUrl={params.previewUrl || ""}
        clipStartInPreview={clipStartInPreview}
        clipDurationInPreview={clipDurationInPreview}
        isOutOfPreview={isOutOfPreview}
        isYouTube={isYouTube}
      />
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
  songInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  artwork: {
    width: 72,
    height: 72,
  },
  songDetails: {
    flex: 1,
    gap: 4,
  },
  songTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  songArtist: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  section: {
    marginBottom: 20,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  timeRange: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 16,
    marginBottom: 20,
  },
  timeItem: {
    alignItems: "center",
    gap: 2,
  },
  timeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timeLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
  },
  timeValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  durationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  durationText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  instruction: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  lyricsLoading: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 8,
  },
  lyricsLoadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  noLyrics: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 8,
  },
  noLyricsText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  noLyricsSubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "center",
  },
  sourceBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  waveformHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  popupContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: "rgba(20,15,35,0.92)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",
    zIndex: 100,
    ...(Platform.OS === "web" ? { backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)" } as any : {}),
  },
  popupHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  popupLyrics: {
    fontFamily: "Georgia",
    fontSize: 15,
    fontStyle: "italic",
    color: "rgba(255,255,255,0.70)",
    textAlign: "center",
    marginBottom: 4,
  },
  popupDuration: {
    fontSize: 12,
    color: "rgba(255,255,255,0.40)",
    textAlign: "center",
    marginBottom: 16,
    fontFamily: "Inter_400Regular",
  },
  popupWarning: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,183,77,0.12)",
    borderRadius: 10,
    alignSelf: "center",
  },
  popupWarningText: {
    fontSize: 13,
    color: "#FFB74D",
    fontFamily: "Inter_500Medium",
  },
  popupPreviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignSelf: "center",
    marginBottom: 12,
  },
  popupPreviewText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter_500Medium",
  },
  popupBtn: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 10,
  },
  popupBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
    zIndex: 1,
  },
  popupReset: {
    width: "100%",
    paddingVertical: 8,
    alignItems: "center",
  },
  popupResetText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "Inter_400Regular",
  },
});
