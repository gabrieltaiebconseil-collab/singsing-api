import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import { ShareButton } from "@/components/ShareButton";
import { useColors } from "@/hooks/useColors";

type ClipState = "loading" | "ready" | "error";
type CopyState = "idle" | "copied";

function detectIsMobile(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

function canShareFiles(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    return !!(navigator.share && navigator.canShare);
  } catch {
    return false;
  }
}

function InstructionStep({ number, text, color }: { number: number; text: string; color: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.primary, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
        <Text style={{ color: color.primaryForeground, fontSize: 12, fontWeight: "700" }}>{number}</Text>
      </View>
      <Text style={{ color: color.mutedForeground, fontSize: 13, flex: 1 }}>{text}</Text>
    </View>
  );
}

const CONFETTI_EMOJIS = ["\u{1F3B5}", "\u{1F3B6}", "\u{1F3B8}", "\u{1F3A4}", "\u{1F525}"];
const CONFETTI_COUNT = 15;

function ConfettiCelebration() {
  const particles = useRef(
    Array.from({ length: CONFETTI_COUNT }, () => ({
      anim: new Animated.Value(0),
      x: Math.random() * 100,
      emoji: CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)],
      delay: Math.random() * 300,
      duration: 1000 + Math.random() * 800,
      rotation: Math.random() * 720,
    }))
  ).current;

  useEffect(() => {
    particles.forEach((p) => {
      Animated.timing(p.anim, {
        toValue: 1,
        duration: p.duration,
        delay: p.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
  }, []);

  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 999 }}>
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%` as any,
            top: "60%",
            fontSize: 24,
            transform: [
              { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -400] }) },
              { rotate: p.anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.rotation}deg`] }) },
            ],
            opacity: p.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          }}
        >
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

export default function ShareScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    trackName: string;
    artistName: string;
    artworkUrl100: string;
    previewUrl: string;
    startTime: string;
    endTime: string;
    clipDuration: string;
    trackTimeMillis: string;
    lyrics: string;
    source?: string;
    youtubeQuery?: string;
  }>();

  const [clipState, setClipState] = useState<ClipState>("loading");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [hostedClipUrl, setHostedClipUrl] = useState<string | null>(null);
  const [clipId, setClipId] = useState<string | null>(null);
  const [autoDownloaded, setAutoDownloaded] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const downloadedRef = useRef(false);

  const isMobile = useMemo(() => detectIsMobile(), []);
  const hasShareAPI = useMemo(() => canShareFiles(), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchClipAndHost() {
      try {
        const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
        const isYouTube = params.source === "youtube" && params.youtubeQuery;
        const startSec = parseFloat(params.startTime || "0");
        const endSec = parseFloat(params.endTime || "0");
        const duration = Math.max(3, Math.min(30, endSec - startSec));

        let hostResponse: Response;

        if (isYouTube) {
          hostResponse = await fetch(`${baseUrl}/api/songs/clip-youtube/host`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              youtubeQuery: params.youtubeQuery,
              startSeconds: startSec,
              durationSeconds: duration,
              trackName: params.trackName || "",
              artistName: params.artistName || "",
              artworkUrl: params.artworkUrl100 || "",
              lyrics: params.lyrics || "",
              senderName: "",
            }),
          });
        } else {
          hostResponse = await fetch(`${baseUrl}/api/songs/clip/host`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              previewUrl: params.previewUrl,
              startTime: params.startTime,
              endTime: params.endTime,
              trackDurationMs: params.trackTimeMillis || "0",
              trackName: params.trackName || "",
              artistName: params.artistName || "",
              artworkUrl: params.artworkUrl100 || "",
              lyrics: params.lyrics || "",
              senderName: "",
            }),
          });
        }

        if (!hostResponse.ok) throw new Error("Failed to create clip");

        const hostData = await hostResponse.json();
        const clipUrl: string | null = hostData.clipUrl || null;
        const serverClipId: string | null = hostData.clipId || null;

        let clipResponse: Response;
        if (isYouTube) {
          clipResponse = await fetch(`${baseUrl}/api/songs/clip-youtube`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              youtubeQuery: params.youtubeQuery,
              startSeconds: startSec,
              durationSeconds: duration,
            }),
          });
        } else {
          clipResponse = await fetch(clipUrl || `${baseUrl}/api/songs/clip?previewUrl=${encodeURIComponent(
            params.previewUrl || ""
          )}&startTime=${params.startTime}&endTime=${params.endTime}&trackDurationMs=${params.trackTimeMillis || "0"}`);
        }

        if (!clipResponse.ok) throw new Error("Failed to download clip");

        const blob = await clipResponse.blob();

        if (!cancelled) {
          setAudioBlob(blob);
          setHostedClipUrl(clipUrl);
          setClipId(serverClipId);
          setClipState("ready");
        }
      } catch {
        if (!cancelled) {
          setClipState("error");
        }
      }
    }

    fetchClipAndHost();
    return () => { cancelled = true; };
  }, [params.previewUrl, params.startTime, params.endTime, params.trackTimeMillis, params.source, params.youtubeQuery]);

  useEffect(() => {
    if (clipState === "ready" && !isMobile && audioBlob && !downloadedRef.current) {
      downloadedRef.current = true;
      triggerDownload(audioBlob);
      setAutoDownloaded(true);
    }
  }, [clipState, isMobile, audioBlob]);

  const triggerDownload = useCallback((blob: Blob) => {
    if (Platform.OS !== "web") return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "singsing.m4a";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const downloadClip = useCallback(() => {
    if (!audioBlob) return;
    triggerDownload(audioBlob);
  }, [audioBlob, triggerDownload]);

  const shareNatively = useCallback(async () => {
    if (!audioBlob) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (Platform.OS === "web" && hasShareAPI) {
      try {
        const file = new File([audioBlob], "singsing.m4a", { type: "audio/mp4" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${params.trackName} - Sing Sing`,
            text: `\u00C9coute cet extrait de "${params.trackName}" par ${params.artistName} !`,
          });
          return;
        }
      } catch {}
    }

    downloadClip();
  }, [audioBlob, hasShareAPI, params.trackName, params.artistName, downloadClip]);

  const handleShareMobile = useCallback(
    (platform: string) => {
      shareNatively();
    },
    [shareNatively]
  );

  const handleShareDesktop = useCallback(
    (platform: string) => {
      if (!audioBlob) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      switch (platform) {
        case "whatsapp":
          downloadClip();
          if (Platform.OS === "web") {
            window.open("https://web.whatsapp.com", "_blank");
          }
          break;
        case "snapchat":
          downloadClip();
          break;
        case "telegram":
          downloadClip();
          if (Platform.OS === "web") {
            window.open("https://web.telegram.org", "_blank");
          }
          break;
        default:
          downloadClip();
      }
    },
    [audioBlob, downloadClip]
  );

  const copyClipUrl = useCallback(async () => {
    if (!clipId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
    const shareUrl = `${baseUrl}/s/${clipId}`;

    if (Platform.OS === "web" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 3000);
        return;
      } catch {}
    }
  }, [clipId]);

  const handleShare = isMobile ? handleShareMobile : handleShareDesktop;

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
          onPress={() => router.dismissAll()}
          style={({ pressed }) => [
            styles.closeButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {clipState === "loading" && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingTitle, { color: colors.foreground }]}>
              {"Cr\u00E9ation du clip..."}
            </Text>
            <Text style={[styles.loadingSubtext, { color: colors.mutedForeground }]}>
              {"Extraction audio et encodage"}
            </Text>
          </View>
        )}

        {clipState === "error" && (
          <View style={styles.loadingContainer}>
            <Feather name="alert-circle" size={48} color={colors.destructive} />
            <Text style={[styles.loadingTitle, { color: colors.foreground }]}>
              {"\u00C9chec de la cr\u00E9ation"}
            </Text>
            <Text style={[styles.loadingSubtext, { color: colors.mutedForeground }]}>
              {"Impossible de cr\u00E9er le clip audio. R\u00E9essayez."}
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={[styles.retryButton, { backgroundColor: colors.primary, borderRadius: colors.radius }]}
            >
              <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
                {"Retour"}
              </Text>
            </Pressable>
          </View>
        )}

        {clipState === "ready" && (
          <>
            <ConfettiCelebration />
            <View style={styles.successIcon}>
              <View
                style={[
                  styles.successCircle,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Feather name="check" size={36} color={colors.primaryForeground} />
              </View>
            </View>

            <Text style={[styles.title, { color: colors.foreground }]}>
              {"Clip cr\u00E9\u00E9 !"}
            </Text>

            <View
              style={[
                styles.clipCard,
                { backgroundColor: colors.card, borderRadius: colors.radius },
              ]}
            >
              <Image
                source={{
                  uri: (params.artworkUrl100 || "").replace("100x100", "200x200"),
                }}
                style={[styles.clipArtwork, { borderRadius: colors.radius - 2 }]}
                contentFit="cover"
              />
              <View style={styles.clipInfo}>
                <Text
                  style={[styles.clipSong, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {params.trackName}
                </Text>
                <Text
                  style={[styles.clipArtist, { color: colors.mutedForeground }]}
                  numberOfLines={1}
                >
                  {params.artistName}
                </Text>
                <View style={styles.clipMeta}>
                  <View
                    style={[
                      styles.clipDurationBadge,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.clipDurationText,
                        { color: colors.primaryForeground },
                      ]}
                    >
                      {`${params.clipDuration}s`}
                    </Text>
                  </View>
                  <Text
                    style={[styles.clipRange, { color: colors.mutedForeground }]}
                  >
                    {`${formatTime(parseFloat(params.startTime || "0"))} - ${formatTime(parseFloat(params.endTime || "0"))}`}
                  </Text>
                </View>
              </View>
            </View>

            {isMobile ? (
              <>
                <Text style={[styles.shareLabel, { color: colors.mutedForeground }]}>
                  {"PARTAGER"}
                </Text>

                <Pressable
                  onPress={shareNatively}
                  style={({ pressed }) => [
                    styles.downloadButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: colors.radius,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Feather name="share" size={18} color={colors.primaryForeground} />
                  <Text
                    style={[
                      styles.downloadText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {"Partager le clip"}
                  </Text>
                </Pressable>

                <View style={styles.shareGrid}>
                  <View style={styles.shareGridRow}>
                    <ShareButton
                      icon="message-circle"
                      label="WhatsApp"
                      color="#25D366"
                      onPress={() => handleShare("whatsapp")}
                    />
                    <ShareButton
                      icon="camera"
                      label="Snapchat"
                      color="#FFFC00"
                      iconColor="#000000"
                      onPress={() => handleShare("snapchat")}
                    />
                    <ShareButton
                      icon="message-square"
                      label="iMessage"
                      color="#34C759"
                      onPress={() => handleShare("imessage")}
                    />
                  </View>
                  <View style={styles.shareGridRow}>
                    <ShareButton
                      icon="send"
                      label="Telegram"
                      color="#2AABEE"
                      onPress={() => handleShare("telegram")}
                    />
                    <ShareButton
                      icon="instagram"
                      label="Instagram"
                      color="#E1306C"
                      onPress={() => handleShare("instagram")}
                    />
                    <ShareButton
                      icon="link"
                      label="Copier le lien"
                      color="rgba(255,255,255,0.12)"
                      onPress={copyClipUrl}
                    />
                  </View>
                </View>

                <View style={[styles.instructionsCard, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
                  <Text style={[styles.instructionsTitle, { color: colors.foreground }]}>
                    {"Comment envoyer sur WhatsApp"}
                  </Text>
                  {Platform.OS === "web" && /iPhone|iPad|iPod/i.test(navigator.userAgent || "") ? (
                    <>
                      <InstructionStep number={1} text="Le fichier singsing.m4a est t\u00E9l\u00E9charg\u00E9" color={colors} />
                      <InstructionStep number={2} text="Ouvre WhatsApp \u2192 ta conversation" color={colors} />
                      <InstructionStep number={3} text="Appuie sur le + \u2192 Document" color={colors} />
                      <InstructionStep number={4} text="S\u00E9lectionne singsing.m4a dans Fichiers" color={colors} />
                      <InstructionStep number={5} text="Envoie \u2713" color={colors} />
                    </>
                  ) : (
                    <>
                      <InstructionStep number={1} text="Ouvre WhatsApp \u2192 ta conversation" color={colors} />
                      <InstructionStep number={2} text="Appuie sur le trombone \u2192 Audio" color={colors} />
                      <InstructionStep number={3} text="S\u00E9lectionne singsing.m4a" color={colors} />
                      <InstructionStep number={4} text="Envoie \u2713" color={colors} />
                    </>
                  )}
                </View>
              </>
            ) : (
              <>
                {autoDownloaded && (
                  <View
                    style={[
                      styles.desktopNotice,
                      { backgroundColor: `${colors.primary}15`, borderRadius: colors.radius },
                    ]}
                  >
                    <Feather name="check-circle" size={18} color={colors.primary} />
                    <View style={styles.desktopNoticeContent}>
                      <Text style={[styles.desktopNoticeTitle, { color: colors.foreground }]}>
                        {"Fichier t\u00E9l\u00E9charg\u00E9 automatiquement"}
                      </Text>
                      <Text style={[styles.desktopNoticeText, { color: colors.mutedForeground }]}>
                        {"singsing.m4a est dans vos t\u00E9l\u00E9chargements"}
                      </Text>
                    </View>
                  </View>
                )}

                <Text style={[styles.shareLabel, { color: colors.mutedForeground }]}>
                  {"PARTAGER DEPUIS LE BUREAU"}
                </Text>

                <View style={styles.shareGrid}>
                  <View style={styles.shareGridRow}>
                    <ShareButton
                      icon="message-circle"
                      label="WhatsApp"
                      color="#25D366"
                      onPress={() => handleShare("whatsapp")}
                    />
                    <ShareButton
                      icon="camera"
                      label="Snapchat"
                      color="#FFFC00"
                      iconColor="#000000"
                      onPress={() => handleShare("snapchat")}
                    />
                    <ShareButton
                      icon="message-square"
                      label="iMessage"
                      color="#34C759"
                      onPress={() => handleShare("imessage")}
                    />
                  </View>
                  <View style={styles.shareGridRow}>
                    <ShareButton
                      icon="send"
                      label="Telegram"
                      color="#2AABEE"
                      onPress={() => handleShare("telegram")}
                    />
                    <ShareButton
                      icon="instagram"
                      label="Instagram"
                      color="#E1306C"
                      onPress={() => handleShare("instagram")}
                    />
                    <ShareButton
                      icon="link"
                      label="Copier le lien"
                      color="rgba(255,255,255,0.12)"
                      onPress={copyClipUrl}
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.desktopInstruction,
                    { backgroundColor: colors.card, borderRadius: colors.radius },
                  ]}
                >
                  <Feather name="paperclip" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.desktopInstructionText, { color: colors.mutedForeground }]}>
                    {"Sur WhatsApp Web, cliquez sur le trombone \u{1F4CE} > Choisir un fichier > Envoyez singsing.m4a"}
                  </Text>
                </View>

                <Pressable
                  onPress={downloadClip}
                  style={({ pressed }) => [
                    styles.downloadButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: colors.radius,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Feather name="download" size={18} color={colors.primaryForeground} />
                  <Text
                    style={[
                      styles.downloadText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    {"T\u00E9l\u00E9charger le clip .m4a"}
                  </Text>
                </Pressable>

                {hostedClipUrl && (
                  <>
                    <View style={styles.qrDivider}>
                      <View style={[styles.qrDividerLine, { backgroundColor: colors.border }]} />
                      <Text style={[styles.qrDividerText, { color: colors.mutedForeground }]}>
                        {"OU"}
                      </Text>
                      <View style={[styles.qrDividerLine, { backgroundColor: colors.border }]} />
                    </View>

                    <Text style={[styles.qrTitle, { color: colors.foreground }]}>
                      {"Scannez pour ouvrir sur mobile"}
                    </Text>
                    <Text style={[styles.qrSubtitle, { color: colors.mutedForeground }]}>
                      {"Le fichier se t\u00E9l\u00E9charge et vous pouvez le partager directement"}
                    </Text>

                    <View
                      style={[
                        styles.qrContainer,
                        { backgroundColor: "#FFFFFF", borderRadius: colors.radius },
                      ]}
                    >
                      <QRCode
                        value={hostedClipUrl}
                        size={160}
                        backgroundColor="#FFFFFF"
                        color="#000000"
                      />
                    </View>

                    <Text style={[styles.qrExpiry, { color: colors.mutedForeground }]}>
                      {"Le lien expire dans 10 minutes"}
                    </Text>
                  </>
                )}
              </>
            )}

            {clipId && (
              <Pressable
                onPress={copyClipUrl}
                style={({ pressed }) => [
                  styles.copyUrlButton,
                  {
                    backgroundColor: copyState === "copied" ? `${colors.primary}15` : colors.card,
                    borderRadius: colors.radius,
                    borderColor: copyState === "copied" ? colors.primary : colors.border,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Feather
                  name={copyState === "copied" ? "check" : "link"}
                  size={16}
                  color={copyState === "copied" ? colors.primary : colors.foreground}
                />
                <Text
                  style={[
                    styles.copyUrlText,
                    { color: copyState === "copied" ? colors.primary : colors.foreground },
                  ]}
                >
                  {copyState === "copied" ? "Lien copi\u00E9 !" : "Copier le lien du clip"}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.dismissAll();
              }}
              style={({ pressed }) => [
                styles.newClipButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="plus" size={18} color={colors.primary} />
              <Text style={[styles.newClipText, { color: colors.primary }]}>
                {"Cr\u00E9er un autre clip"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: "flex-end",
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingContainer: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  loadingTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 12,
  },
  retryText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  successIcon: {
    marginBottom: 16,
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 24,
  },
  clipCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
    width: "100%",
    marginBottom: 16,
  },
  clipArtwork: {
    width: 56,
    height: 56,
  },
  clipInfo: {
    flex: 1,
    gap: 3,
  },
  clipSong: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  clipArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  clipMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  clipDurationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  clipDurationText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  clipRange: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  shareLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 16,
  },
  shareButtons: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  shareGrid: {
    marginBottom: 16,
    gap: 16,
  },
  shareGridRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: 8,
    width: "100%",
    marginBottom: 12,
  },
  downloadText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  copyUrlButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    gap: 8,
    width: "100%",
    borderWidth: 1,
    marginBottom: 4,
  },
  copyUrlText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  newClipButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  newClipText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  desktopNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    width: "100%",
    marginBottom: 20,
  },
  desktopNoticeContent: {
    flex: 1,
    gap: 2,
  },
  desktopNoticeTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  desktopNoticeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  desktopInstruction: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    width: "100%",
    marginBottom: 16,
  },
  desktopInstructionText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 19,
  },
  qrDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    marginVertical: 16,
  },
  qrDividerLine: {
    flex: 1,
    height: 1,
  },
  qrDividerText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  qrTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
  qrSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  qrContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  qrExpiry: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  instructionsCard: {
    width: "100%",
    padding: 16,
    marginTop: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
  },
});
