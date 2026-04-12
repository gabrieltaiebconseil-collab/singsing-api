import { Feather } from "@expo/vector-icons";
import { useSearchSongs } from "@workspace/api-client-react";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";

import { useColors } from "@/hooks/useColors";

const BATTLES_KEY = "singsing_battles";
const HALL_OF_FAME_KEY = "singsing_hall_of_fame";
const API_BASE = "https://singsing-production.up.railway.app";

interface BattleTurn {
  player: string;
  trackName: string;
  artistName: string;
  lyricsSnippet: string;
  artworkUrl100?: string;
  timestamp: number;
}

interface JuryVote {
  emoji: string;
  count: number;
}

interface Battle {
  id: string;
  opponent: string;
  mode: "message" | "live";
  timerDuration?: number;
  turns: BattleTurn[];
  createdAt: number;
  myScore: number;
  opponentScore: number;
  juryVotes?: JuryVote[];
  aiVerdict?: string;
  verdictWinner?: string;
}

interface HallOfFameEntry {
  trackName: string;
  artistName: string;
  lyrics: string;
  playerName: string;
  votes: number;
  artworkUrl100?: string;
}

type BattleView = "list" | "create" | "detail" | "live" | "verdict";
type TimerOption = 30 | 45 | 60;

const JURY_EMOJIS = [
  { emoji: "\u{1F525}", label: "Feu" },
  { emoji: "\u{1F480}", label: "KO" },
  { emoji: "\u{1F602}", label: "Trop dr\u00F4le" },
  { emoji: "\u{1FAE1}", label: "Respect" },
];

export default function BattleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<BattleView>("list");
  const [battles, setBattles] = useState<Battle[]>([]);
  const [opponentName, setOpponentName] = useState("");
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(true);
  const [battleMode, setBattleMode] = useState<"message" | "live">("message");
  const [timerOption, setTimerOption] = useState<TimerOption>(45);

  const [liveCountdown, setLiveCountdown] = useState<number>(0);
  const [liveStarted, setLiveStarted] = useState(false);
  const [liveExpired, setLiveExpired] = useState(false);
  const [liveQuery, setLiveQuery] = useState("");
  const [liveSearchTerm, setLiveSearchTerm] = useState("");
  const [liveSelectedSong, setLiveSelectedSong] = useState<any>(null);
  const [liveSubmitted, setLiveSubmitted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictResult, setVerdictResult] = useState<{ winner: number; verdict: string } | null>(null);
  const [juryVotes, setJuryVotes] = useState<Record<string, number>>({});
  const [votedEmoji, setVotedEmoji] = useState<string | null>(null);

  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>([]);

  const { data: liveSearchData, isLoading: liveSearchLoading } = useSearchSongs(
    { q: liveSearchTerm },
    { query: { enabled: liveSearchTerm.length > 0 } }
  );

  const loadBattles = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(BATTLES_KEY);
      if (raw) setBattles(JSON.parse(raw));
      const fame = await AsyncStorage.getItem(HALL_OF_FAME_KEY);
      if (fame) setHallOfFame(JSON.parse(fame));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBattles();
  }, [loadBattles]);

  const saveBattles = useCallback(async (updated: Battle[]) => {
    setBattles(updated);
    await AsyncStorage.setItem(BATTLES_KEY, JSON.stringify(updated));
  }, []);

  useEffect(() => {
    if (liveStarted && liveCountdown > 0 && !liveExpired) {
      timerRef.current = setInterval(() => {
        setLiveCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setLiveExpired(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return 0;
          }
          if (prev <= 6) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [liveStarted, liveExpired]);

  const createBattle = useCallback(async () => {
    if (!opponentName.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newBattle: Battle = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
      opponent: opponentName.trim(),
      mode: battleMode,
      timerDuration: battleMode === "live" ? timerOption : undefined,
      turns: [],
      createdAt: Date.now(),
      myScore: 0,
      opponentScore: 0,
    };

    const updated = [newBattle, ...battles];
    await saveBattles(updated);

    const shareUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN || "singsing.app"}`;
    const timerText = battleMode === "live" ? `Chrono : ${timerOption} secondes. ` : "";
    const shareMessage = `\u{1F525} ${opponentName.trim()} te lance un Clash Sing Sing ! T'as le niveau ? Trouve la chanson qui va tout d\u00E9chirer. ${timerText}Accepte le d\u00E9fi \u2192 ${shareUrl}`;

    setOpponentName("");

    if (battleMode === "live") {
      setSelectedBattle(newBattle);
      setLiveCountdown(timerOption);
      setLiveStarted(false);
      setLiveExpired(false);
      setLiveQuery("");
      setLiveSearchTerm("");
      setLiveSelectedSong(null);
      setLiveSubmitted(false);
      setView("live");
    } else {
      setSelectedBattle(newBattle);
      setView("detail");
    }

    if (Platform.OS === "web") {
      try {
        if (navigator.share) {
          navigator.share({ text: shareMessage }).catch(() => {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(shareMessage).catch(() => {});
        }
      } catch {}
    } else {
      Share.share({ message: shareMessage }).catch(() => {});
    }
  }, [opponentName, battles, saveBattles, battleMode, timerOption]);

  const deleteBattle = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const updated = battles.filter((b) => b.id !== id);
      await saveBattles(updated);
      if (selectedBattle?.id === id) {
        setSelectedBattle(null);
        setView("list");
      }
    },
    [battles, saveBattles, selectedBattle]
  );

  const startLiveTimer = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLiveStarted(true);
  };

  const submitLiveClip = useCallback(async () => {
    if (!liveSelectedSong || !selectedBattle) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLiveSubmitted(true);

    if (timerRef.current) clearInterval(timerRef.current);

    const turn: BattleTurn = {
      player: "me",
      trackName: liveSelectedSong.trackName,
      artistName: liveSelectedSong.artistName,
      lyricsSnippet: liveSelectedSong.trackName,
      artworkUrl100: liveSelectedSong.artworkUrl100,
      timestamp: Date.now(),
    };

    const updated = battles.map((b) => {
      if (b.id === selectedBattle.id) {
        return { ...b, turns: [...b.turns, turn] };
      }
      return b;
    });
    await saveBattles(updated);
    setSelectedBattle((prev) => prev ? { ...prev, turns: [...prev.turns, turn] } : prev);
  }, [liveSelectedSong, selectedBattle, battles, saveBattles]);

  const handleLiveSearch = useCallback(() => {
    if (liveQuery.trim().length > 0) {
      setLiveSearchTerm(liveQuery.trim());
    }
  }, [liveQuery]);

  const requestAIVerdict = useCallback(async () => {
    if (!selectedBattle || selectedBattle.turns.length < 2) return;
    setVerdictLoading(true);
    try {
      const t1 = selectedBattle.turns[selectedBattle.turns.length - 2];
      const t2 = selectedBattle.turns[selectedBattle.turns.length - 1];
      const res = await fetch(`${API_BASE}/api/songs/clash-verdict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player1: {
            name: t1.player === "me" ? "Toi" : selectedBattle.opponent,
            trackName: t1.trackName,
            artistName: t1.artistName,
            lyrics: t1.lyricsSnippet,
          },
          player2: {
            name: t2.player === "me" ? "Toi" : selectedBattle.opponent,
            trackName: t2.trackName,
            artistName: t2.artistName,
            lyrics: t2.lyricsSnippet,
          },
        }),
      });
      const data = await res.json();
      setVerdictResult(data);
    } catch {
      setVerdictResult({ winner: 0, verdict: "Erreur lors du verdict... Match nul !" });
    }
    setVerdictLoading(false);
  }, [selectedBattle]);

  const handleJuryVote = useCallback((emoji: string) => {
    if (votedEmoji) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setVotedEmoji(emoji);
    setJuryVotes((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
  }, [votedEmoji]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const renderList = () => (
    <>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setView("create");
        }}
        style={({ pressed }) => [
          styles.createButton,
          {
            backgroundColor: colors.primary,
            borderRadius: colors.radius,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Feather name="zap" size={20} color={colors.primaryForeground} />
        <Text style={[styles.createButtonText, { color: colors.primaryForeground }]}>
          {"Nouveau Clash \u{1F525}"}
        </Text>
      </Pressable>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {!loading && battles.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>{"\u{1F525}"}</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {"Le clash commence \u2014 qui ose le premier ?"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            {"Lance un clash, trouve le Sing parfait, et \u00E9crase ta cible !"}
          </Text>
        </View>
      )}

      {battles.map((battle) => {
        const isLive = battle.mode === "live";
        const hasScore = battle.myScore === 0 && battle.opponentScore === 0;
        return (
          <Pressable
            key={battle.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedBattle(battle);
              setView("detail");
            }}
            style={({ pressed }) => [
              styles.battleCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
                opacity: pressed ? 0.95 : 1,
              },
            ]}
          >
            <View style={styles.battleCardHeader}>
              <View style={styles.battleCardInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.battleOpponent, { color: colors.foreground }]}>
                    {`vs ${battle.opponent}`}
                  </Text>
                  {isLive && (
                    <View style={[styles.modeBadge, { backgroundColor: "rgba(194,24,91,0.15)" }]}>
                      <Text style={[styles.modeBadgeText, { color: "#C2185B" }]}>{"LIVE"}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.battleDate, { color: colors.mutedForeground }]}>
                  {new Date(battle.createdAt).toLocaleDateString("fr-FR")}
                </Text>
              </View>
              {hasScore ? (
                <View style={[styles.clashBadge, { backgroundColor: `${colors.primary}20` }]}>
                  <Text style={[styles.clashBadgeText, { color: colors.primary }]}>
                    {"CLASH EN COURS"}
                  </Text>
                </View>
              ) : (
                <View style={styles.battleScores}>
                  <View style={[styles.scoreBadge, { backgroundColor: `${colors.primary}20` }]}>
                    <Text style={[styles.scoreText, { color: colors.primary }]}>
                      {`${battle.myScore}`}
                    </Text>
                  </View>
                  <Text style={[styles.scoreSeparator, { color: colors.mutedForeground }]}>{"-"}</Text>
                  <View style={[styles.scoreBadge, { backgroundColor: `${colors.mutedForeground}20` }]}>
                    <Text style={[styles.scoreText, { color: colors.mutedForeground }]}>
                      {`${battle.opponentScore}`}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.battleCardFooter}>
              <Text style={[styles.turnCount, { color: colors.mutedForeground }]}>
                {battle.turns.length === 0
                  ? "Aucun Sing envoy\u00E9"
                  : `${battle.turns.length} Sing${battle.turns.length !== 1 ? "s" : ""} envoy\u00E9${battle.turns.length !== 1 ? "s" : ""}`}
              </Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>
        );
      })}

      {hallOfFame.length > 0 && (
        <View style={styles.hallSection}>
          <Text style={[styles.hallTitle, { color: colors.foreground }]}>
            {"\u{1F3C6} Clips l\u00E9gendaires cette semaine"}
          </Text>
          {hallOfFame.slice(0, 3).map((entry, i) => (
            <View
              key={i}
              style={[
                styles.hallCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Text style={[styles.hallRank, { color: colors.primary }]}>
                {`#${i + 1}`}
              </Text>
              <View style={styles.hallInfo}>
                <Text style={[styles.hallSong, { color: colors.foreground }]} numberOfLines={1}>
                  {entry.trackName}
                </Text>
                <Text style={[styles.hallArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {`${entry.artistName} \u2014 par ${entry.playerName}`}
                </Text>
              </View>
              <View style={[styles.hallVotes, { backgroundColor: `${colors.primary}15` }]}>
                <Text style={[styles.hallVoteCount, { color: colors.primary }]}>
                  {`\u{1F525} ${entry.votes}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </>
  );

  const renderCreate = () => (
    <View style={styles.createContainer}>
      <Text style={[styles.createTitle, { color: colors.foreground }]}>
        {"Nouveau Clash \u{1F525}"}
      </Text>
      <Text style={[styles.createSubtitle, { color: colors.mutedForeground }]}>
        {"Choisis ta cible et le mode de combat"}
      </Text>

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: colors.radius,
          },
        ]}
      >
        <Feather name="crosshair" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.input, { color: colors.foreground }]}
          placeholder="Nom de ta cible..."
          placeholderTextColor={colors.mutedForeground}
          value={opponentName}
          onChangeText={setOpponentName}
          returnKeyType="done"
          autoFocus
        />
      </View>

      <View style={styles.modeToggle}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setBattleMode("message");
          }}
          style={[
            styles.modeButton,
            {
              backgroundColor: battleMode === "message" ? colors.primary : colors.card,
              borderColor: battleMode === "message" ? colors.primary : colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather
            name="message-circle"
            size={18}
            color={battleMode === "message" ? colors.primaryForeground : colors.foreground}
          />
          <Text
            style={[
              styles.modeButtonText,
              { color: battleMode === "message" ? colors.primaryForeground : colors.foreground },
            ]}
          >
            {"Battle Message"}
          </Text>
          <Text
            style={[
              styles.modeDesc,
              { color: battleMode === "message" ? `${colors.primaryForeground}AA` : colors.mutedForeground },
            ]}
          >
            {"Async, chacun son rythme"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setBattleMode("live");
          }}
          style={[
            styles.modeButton,
            {
              backgroundColor: battleMode === "live" ? colors.primary : colors.card,
              borderColor: battleMode === "live" ? colors.primary : colors.border,
              borderRadius: colors.radius,
            },
          ]}
        >
          <Feather
            name="zap"
            size={18}
            color={battleMode === "live" ? colors.primaryForeground : colors.foreground}
          />
          <Text
            style={[
              styles.modeButtonText,
              { color: battleMode === "live" ? colors.primaryForeground : colors.foreground },
            ]}
          >
            {"Battle Live \u{26A1}"}
          </Text>
          <Text
            style={[
              styles.modeDesc,
              { color: battleMode === "live" ? `${colors.primaryForeground}AA` : colors.mutedForeground },
            ]}
          >
            {"Temps r\u00E9el, chrono actif"}
          </Text>
        </Pressable>
      </View>

      {battleMode === "live" && (
        <View style={styles.timerSelect}>
          <Text style={[styles.timerLabel, { color: colors.mutedForeground }]}>
            {"CHRONO"}
          </Text>
          <View style={styles.timerOptions}>
            {([30, 45, 60] as TimerOption[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTimerOption(t);
                }}
                style={[
                  styles.timerPill,
                  {
                    backgroundColor: timerOption === t ? colors.primary : colors.card,
                    borderColor: timerOption === t ? colors.primary : colors.border,
                    borderRadius: 20,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.timerPillText,
                    { color: timerOption === t ? colors.primaryForeground : colors.foreground },
                  ]}
                >
                  {`${t}s`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Pressable
        onPress={createBattle}
        disabled={!opponentName.trim()}
        style={({ pressed }) => [
          styles.startButton,
          {
            backgroundColor: opponentName.trim() ? colors.primary : colors.muted,
            borderRadius: colors.radius,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Feather
          name="zap"
          size={18}
          color={opponentName.trim() ? colors.primaryForeground : colors.mutedForeground}
        />
        <Text
          style={[
            styles.startButtonText,
            {
              color: opponentName.trim() ? colors.primaryForeground : colors.mutedForeground,
            },
          ]}
        >
          {"Lancer le clash \u{1F525}"}
        </Text>
      </Pressable>
    </View>
  );

  const renderDetail = () => {
    if (!selectedBattle) return null;

    return (
      <View style={styles.detailContainer}>
        <View style={styles.detailHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[styles.detailTitle, { color: colors.foreground }]}>
              {`Clash vs ${selectedBattle.opponent}`}
            </Text>
            {selectedBattle.mode === "live" && (
              <View style={[styles.modeBadge, { backgroundColor: "rgba(194,24,91,0.15)" }]}>
                <Text style={[styles.modeBadgeText, { color: "#C2185B" }]}>{"LIVE"}</Text>
              </View>
            )}
          </View>
          <View style={styles.detailScoreRow}>
            <View style={styles.detailScoreBlock}>
              <Text style={[styles.detailScoreLabel, { color: colors.mutedForeground }]}>
                {"Toi"}
              </Text>
              <Text style={[styles.detailScoreValue, { color: colors.primary }]}>
                {`${selectedBattle.myScore}`}
              </Text>
            </View>
            <Text style={[styles.detailScoreSep, { color: colors.border }]}>{":"}</Text>
            <View style={styles.detailScoreBlock}>
              <Text style={[styles.detailScoreLabel, { color: colors.mutedForeground }]}>
                {selectedBattle.opponent}
              </Text>
              <Text style={[styles.detailScoreValue, { color: colors.foreground }]}>
                {`${selectedBattle.opponentScore}`}
              </Text>
            </View>
          </View>
        </View>

        {selectedBattle.myScore === 0 && selectedBattle.opponentScore === 0 && (
          <View style={[styles.clashBadgeLarge, { backgroundColor: `${colors.primary}15` }]}>
            <Text style={[styles.clashBadgeLargeText, { color: colors.primary }]}>
              {"\u{1F525} CLASH EN COURS"}
            </Text>
          </View>
        )}

        {selectedBattle.turns.length === 0 && (
          <View style={styles.noTurnsState}>
            <Feather name="zap" size={40} color={colors.mutedForeground} />
            <Text style={[styles.noTurnsText, { color: colors.mutedForeground }]}>
              {"Le clash commence \u2014 qui ose le premier ?"}
            </Text>
          </View>
        )}

        {selectedBattle.turns.map((turn, i) => (
          <View
            key={i}
            style={[
              styles.turnCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <View style={styles.turnHeader}>
              <Text style={[styles.turnPlayer, { color: colors.primary }]}>
                {turn.player === "me" ? "Toi" : selectedBattle.opponent}
              </Text>
              <Text style={[styles.turnTime, { color: colors.mutedForeground }]}>
                {`Round ${i + 1}`}
              </Text>
            </View>
            <Text style={[styles.turnSong, { color: colors.foreground }]}>
              {`${turn.trackName} \u2014 ${turn.artistName}`}
            </Text>
            <Text style={[styles.turnLyrics, { color: colors.mutedForeground }]} numberOfLines={2}>
              {`\u00AB ${turn.lyricsSnippet} \u00BB`}
            </Text>
          </View>
        ))}

        {selectedBattle.aiVerdict && (
          <View
            style={[
              styles.verdictCard,
              {
                backgroundColor: `${colors.primary}10`,
                borderColor: colors.primary,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.verdictTitle, { color: colors.primary }]}>
              {"\u{2696}\u{FE0F} Verdict IA"}
            </Text>
            <Text style={[styles.verdictText, { color: colors.foreground }]}>
              {selectedBattle.aiVerdict}
            </Text>
          </View>
        )}

        <View style={styles.detailActions}>
          {selectedBattle.turns.length >= 2 && !selectedBattle.aiVerdict && (
            <View style={styles.verdictButtons}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setVerdictResult(null);
                  setJuryVotes({});
                  setVotedEmoji(null);
                  setView("verdict");
                }}
                style={({ pressed }) => [
                  styles.verdictButton,
                  {
                    backgroundColor: `${colors.primary}15`,
                    borderColor: colors.primary,
                    borderRadius: colors.radius,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={[styles.verdictButtonText, { color: colors.primary }]}>
                  {"\u{2696}\u{FE0F} D\u00E9partager le clash"}
                </Text>
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (selectedBattle.mode === "live") {
                setLiveCountdown(selectedBattle.timerDuration || 45);
                setLiveStarted(false);
                setLiveExpired(false);
                setLiveQuery("");
                setLiveSearchTerm("");
                setLiveSelectedSong(null);
                setLiveSubmitted(false);
                setView("live");
              } else {
                router.push("/");
              }
            }}
            style={({ pressed }) => [
              styles.playTurnButton,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Feather name="zap" size={18} color={colors.primaryForeground} />
            <Text style={[styles.playTurnText, { color: colors.primaryForeground }]}>
              {"Balance ton Sing \u{1F525}"}
            </Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              const shareUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
              const timerText = selectedBattle.timerDuration ? `Chrono : ${selectedBattle.timerDuration} secondes. ` : "";
              try {
                await Share.share({
                  message: `\u{1F525} Tu re\u00E7ois un Clash Sing Sing de la part de ${selectedBattle.opponent} ! T'as le niveau ? ${timerText}Accepte le d\u00E9fi \u2192 ${shareUrl}`,
                });
              } catch {}
            }}
            style={({ pressed }) => [
              styles.shareButton,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Feather name="share" size={16} color={colors.foreground} />
            <Text style={[styles.shareButtonText, { color: colors.foreground }]}>
              {"Partager le clash"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => deleteBattle(selectedBattle.id)}
            style={({ pressed }) => [
              styles.deleteButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text style={[styles.deleteText, { color: colors.destructive }]}>
              {"Supprimer le clash"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderLive = () => {
    if (!selectedBattle) return null;
    const results = liveSearchData?.results || [];
    const urgentTimer = liveCountdown <= 10 && liveCountdown > 0;

    return (
      <View style={styles.liveContainer}>
        <View
          style={[
            styles.liveHeader,
            {
              backgroundColor: urgentTimer ? "#C2185B15" : `${colors.primary}10`,
              borderRadius: colors.radius,
            },
          ]}
        >
          <View style={styles.liveHeaderRow}>
            <Text style={[styles.liveVs, { color: colors.foreground }]}>
              {`CLASH vs ${selectedBattle.opponent}`}
            </Text>
            <View style={[styles.liveTimerBadge, { backgroundColor: urgentTimer ? "#C2185B" : colors.primary }]}>
              <Feather name="clock" size={14} color="#fff" />
              <Text style={styles.liveTimerText}>
                {liveStarted ? formatCountdown(liveCountdown) : `${selectedBattle.timerDuration || 45}s`}
              </Text>
            </View>
          </View>
          <View style={styles.liveScoreRow}>
            <Text style={[styles.liveScoreText, { color: colors.mutedForeground }]}>
              {`TOI: ${selectedBattle.myScore}    ${selectedBattle.opponent.toUpperCase()}: ${selectedBattle.opponentScore}`}
            </Text>
          </View>
        </View>

        {!liveStarted && (
          <View style={styles.preStartContainer}>
            <Text style={[styles.preStartTitle, { color: colors.foreground }]}>
              {`\u{23F1}\u{FE0F} ${selectedBattle.timerDuration || 45} secondes pour trouver ton Sing`}
            </Text>
            <Text style={[styles.preStartSubtitle, { color: colors.mutedForeground }]}>
              {"Cherche une chanson, s\u00E9lectionne-la, et balance ton Sing avant la fin du chrono !"}
            </Text>
            <Pressable
              onPress={startLiveTimer}
              style={({ pressed }) => [
                styles.goButton,
                {
                  backgroundColor: colors.primary,
                  borderRadius: colors.radius,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text style={[styles.goButtonText, { color: colors.primaryForeground }]}>
                {"GO ! \u{1F525}"}
              </Text>
            </Pressable>
          </View>
        )}

        {liveStarted && liveExpired && !liveSubmitted && (
          <View style={styles.forfeitContainer}>
            <Text style={styles.forfeitEmoji}>{"\u{1F6A8}"}</Text>
            <Text style={[styles.forfeitTitle, { color: "#C2185B" }]}>
              {"FORFAIT \u2014 tu as perdu ce round !"}
            </Text>
            <Text style={[styles.forfeitSubtitle, { color: colors.mutedForeground }]}>
              {"Le chrono est tomb\u00E9 \u00E0 z\u00E9ro sans Sing soumis."}
            </Text>
            <Pressable
              onPress={() => {
                setView("detail");
              }}
              style={({ pressed }) => [
                styles.backToDetailBtn,
                {
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text style={[styles.backToDetailText, { color: colors.foreground }]}>
                {"Retour au clash"}
              </Text>
            </Pressable>
          </View>
        )}

        {liveStarted && liveSubmitted && (
          <View style={styles.submittedContainer}>
            <Text style={styles.submittedEmoji}>{"\u{2705}"}</Text>
            <Text style={[styles.submittedTitle, { color: colors.primary }]}>
              {"Sing envoy\u00E9 !"}
            </Text>
            {liveSelectedSong && (
              <View
                style={[
                  styles.submittedSong,
                  {
                    backgroundColor: colors.card,
                    borderRadius: colors.radius,
                    borderColor: colors.border,
                  },
                ]}
              >
                {liveSelectedSong.artworkUrl100 && (
                  <Image
                    source={{ uri: liveSelectedSong.artworkUrl100 }}
                    style={{ width: 48, height: 48, borderRadius: 8 }}
                  />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.submittedSongName, { color: colors.foreground }]} numberOfLines={1}>
                    {liveSelectedSong.trackName}
                  </Text>
                  <Text style={[styles.submittedArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {liveSelectedSong.artistName}
                  </Text>
                </View>
              </View>
            )}
            <Pressable
              onPress={() => setView("detail")}
              style={({ pressed }) => [
                styles.backToDetailBtn,
                {
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text style={[styles.backToDetailText, { color: colors.foreground }]}>
                {"Retour au clash"}
              </Text>
            </Pressable>
          </View>
        )}

        {liveStarted && !liveExpired && !liveSubmitted && (
          <>
            <View
              style={[
                styles.liveSearchBar,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                },
              ]}
            >
              <Feather name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.liveSearchInput, { color: colors.foreground }]}
                placeholder="Trouve ton Sing..."
                placeholderTextColor={colors.mutedForeground}
                value={liveQuery}
                onChangeText={setLiveQuery}
                onSubmitEditing={handleLiveSearch}
                returnKeyType="search"
                autoFocus
              />
              {liveQuery.length > 0 && (
                <Pressable onPress={handleLiveSearch}>
                  <Feather name="arrow-right" size={20} color={colors.primary} />
                </Pressable>
              )}
            </View>

            {liveSearchLoading && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 12 }} />
            )}

            {!liveSelectedSong && results.length > 0 && (
              <View style={styles.liveResults}>
                {results.slice(0, 5).map((song: any) => (
                  <Pressable
                    key={song.trackId}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setLiveSelectedSong(song);
                    }}
                    style={({ pressed }) => [
                      styles.liveResultCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        borderRadius: colors.radius,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    {song.artworkUrl100 && (
                      <Image
                        source={{ uri: song.artworkUrl100 }}
                        style={{ width: 40, height: 40, borderRadius: 6 }}
                      />
                    )}
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[styles.liveResultTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {song.trackName}
                      </Text>
                      <Text style={[styles.liveResultArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {song.artistName}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            )}

            {liveSelectedSong && (
              <View style={styles.liveEditorArea}>
                <View
                  style={[
                    styles.selectedSongBanner,
                    {
                      backgroundColor: `${colors.primary}10`,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  {liveSelectedSong.artworkUrl100 && (
                    <Image
                      source={{ uri: liveSelectedSong.artworkUrl100 }}
                      style={{ width: 48, height: 48, borderRadius: 8 }}
                    />
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.selectedSongName, { color: colors.foreground }]} numberOfLines={1}>
                      {liveSelectedSong.trackName}
                    </Text>
                    <Text style={[styles.selectedArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {liveSelectedSong.artistName}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setLiveSelectedSong(null);
                    }}
                  >
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </Pressable>
                </View>

                <Pressable
                  onPress={submitLiveClip}
                  style={({ pressed }) => [
                    styles.balanceButton,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: colors.radius,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Feather name="zap" size={20} color={colors.primaryForeground} />
                  <Text style={[styles.balanceText, { color: colors.primaryForeground }]}>
                    {"Balance ce Sing ! \u{1F525}"}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const renderVerdict = () => {
    if (!selectedBattle || selectedBattle.turns.length < 2) return null;
    const t1 = selectedBattle.turns[selectedBattle.turns.length - 2];
    const t2 = selectedBattle.turns[selectedBattle.turns.length - 1];

    return (
      <View style={styles.verdictContainer}>
        <Text style={[styles.verdictScreenTitle, { color: colors.foreground }]}>
          {"\u{2696}\u{FE0F} Verdict du Clash"}
        </Text>

        <View style={styles.verdictClips}>
          <View
            style={[
              styles.verdictClipCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.verdictClipPlayer, { color: colors.primary }]}>
              {t1.player === "me" ? "Toi" : selectedBattle.opponent}
            </Text>
            <Text style={[styles.verdictClipSong, { color: colors.foreground }]} numberOfLines={1}>
              {t1.trackName}
            </Text>
            <Text style={[styles.verdictClipArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
              {t1.artistName}
            </Text>
          </View>
          <Text style={[styles.verdictVsText, { color: colors.mutedForeground }]}>{"VS"}</Text>
          <View
            style={[
              styles.verdictClipCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.verdictClipPlayer, { color: colors.primary }]}>
              {t2.player === "me" ? "Toi" : selectedBattle.opponent}
            </Text>
            <Text style={[styles.verdictClipSong, { color: colors.foreground }]} numberOfLines={1}>
              {t2.trackName}
            </Text>
            <Text style={[styles.verdictClipArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
              {t2.artistName}
            </Text>
          </View>
        </View>

        <View style={styles.verdictChoices}>
          <Pressable
            onPress={() => {
              requestAIVerdict();
            }}
            disabled={verdictLoading || !!verdictResult}
            style={({ pressed }) => [
              styles.verdictChoiceBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                opacity: pressed || verdictLoading ? 0.8 : 1,
              },
            ]}
          >
            {verdictLoading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Text style={[styles.verdictChoiceText, { color: colors.primaryForeground }]}>
                  {"\u{1F916} Verdict IA"}
                </Text>
              </>
            )}
          </Pressable>

          <View
            style={[
              styles.jurySection,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.juryTitle, { color: colors.foreground }]}>
              {"\u{1F3AD} Jury — votez !"}
            </Text>
            <View style={styles.juryEmojis}>
              {JURY_EMOJIS.map((j) => (
                <Pressable
                  key={j.emoji}
                  onPress={() => handleJuryVote(j.emoji)}
                  style={({ pressed }) => [
                    styles.juryEmojiBtn,
                    {
                      backgroundColor: votedEmoji === j.emoji ? `${colors.primary}20` : "transparent",
                      borderColor: votedEmoji === j.emoji ? colors.primary : colors.border,
                      borderRadius: 16,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={styles.juryEmoji}>{j.emoji}</Text>
                  <Text style={[styles.juryLabel, { color: colors.mutedForeground }]}>{j.label}</Text>
                  {(juryVotes[j.emoji] || 0) > 0 && (
                    <Text style={[styles.juryCount, { color: colors.primary }]}>
                      {`${juryVotes[j.emoji]}`}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {verdictResult && (
          <View
            style={[
              styles.verdictResultCard,
              {
                backgroundColor: `${colors.primary}10`,
                borderColor: colors.primary,
                borderRadius: colors.radius,
              },
            ]}
          >
            <Text style={[styles.verdictResultTitle, { color: colors.primary }]}>
              {"\u{1F3C6} Verdict"}
            </Text>
            <Text style={[styles.verdictResultText, { color: colors.foreground }]}>
              {verdictResult.verdict}
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => {
            if (verdictResult) {
              const updated = battles.map((b) => {
                if (b.id === selectedBattle.id) {
                  return { ...b, aiVerdict: verdictResult.verdict, verdictWinner: verdictResult.winner === 1 ? "player1" : "player2" };
                }
                return b;
              });
              saveBattles(updated);
            }
            setView("detail");
          }}
          style={({ pressed }) => [
            styles.backToDetailBtn,
            {
              borderColor: colors.border,
              borderRadius: colors.radius,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={[styles.backToDetailText, { color: colors.foreground }]}>
            {"Retour au clash"}
          </Text>
        </Pressable>
      </View>
    );
  };

  const getHeaderTitle = () => {
    switch (view) {
      case "create": return "Nouveau Clash";
      case "detail": return "Clash";
      case "live": return "Clash Live";
      case "verdict": return "Verdict";
      default: return "Mode Clash \u{1F525}";
    }
  };

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
            if (view === "list") {
              router.back();
            } else if (view === "verdict" || view === "live") {
              setView("detail");
            } else {
              setView("list");
              setSelectedBattle(null);
            }
          }}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {getHeaderTitle()}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          { paddingBottom: Platform.OS === "web" ? 40 : insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {view === "list" && renderList()}
        {view === "create" && renderCreate()}
        {view === "detail" && renderDetail()}
        {view === "live" && renderLive()}
        {view === "verdict" && renderVerdict()}
      </ScrollView>
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
  content: { flex: 1, paddingHorizontal: 20 },
  contentInner: { gap: 12, paddingTop: 8 },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    gap: 10,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  loadingContainer: {
    alignItems: "center",
    paddingTop: 60,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 40,
    gap: 8,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  battleCard: {
    borderWidth: 0.5,
    padding: 16,
    gap: 10,
  },
  battleCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  battleCardInfo: { gap: 2 },
  battleOpponent: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  battleDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  modeBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  clashBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  clashBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  clashBadgeLarge: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  clashBadgeLargeText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  battleScores: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  scoreSeparator: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  battleCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  turnCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  createContainer: {
    gap: 16,
    paddingTop: 20,
  },
  createTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  createSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 0.5,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  modeToggle: {
    flexDirection: "row",
    gap: 10,
  },
  modeButton: {
    flex: 1,
    padding: 14,
    borderWidth: 0.5,
    alignItems: "center",
    gap: 6,
  },
  modeButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  modeDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  timerSelect: {
    gap: 8,
  },
  timerLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  timerOptions: {
    flexDirection: "row",
    gap: 10,
  },
  timerPill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 0.5,
  },
  timerPillText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    gap: 8,
  },
  startButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  detailContainer: { gap: 16, paddingTop: 8 },
  detailHeader: { alignItems: "center", gap: 12 },
  detailTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  detailScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  detailScoreBlock: { alignItems: "center", gap: 2 },
  detailScoreLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailScoreValue: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
  },
  detailScoreSep: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  noTurnsState: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10,
  },
  noTurnsText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  turnCard: {
    borderWidth: 0.5,
    padding: 14,
    gap: 6,
  },
  turnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  turnPlayer: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  turnTime: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  turnSong: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  turnLyrics: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  verdictCard: {
    borderWidth: 0.5,
    padding: 16,
    gap: 8,
  },
  verdictTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  verdictText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  detailActions: {
    gap: 8,
    marginTop: 8,
  },
  verdictButtons: {
    gap: 8,
  },
  verdictButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderWidth: 0.5,
    gap: 8,
  },
  verdictButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  playTurnButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    gap: 8,
  },
  playTurnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderWidth: 0.5,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
  },
  deleteText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  liveContainer: {
    gap: 14,
  },
  liveHeader: {
    padding: 16,
    gap: 8,
  },
  liveHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  liveVs: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  liveTimerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  liveTimerText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  liveScoreRow: {
    alignItems: "center",
  },
  liveScoreText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  preStartContainer: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 12,
  },
  preStartTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  preStartSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  goButton: {
    paddingHorizontal: 48,
    paddingVertical: 16,
    marginTop: 8,
  },
  goButtonText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  forfeitContainer: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10,
  },
  forfeitEmoji: { fontSize: 48 },
  forfeitTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  forfeitSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  submittedContainer: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 12,
  },
  submittedEmoji: { fontSize: 48 },
  submittedTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  submittedSong: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    borderWidth: 0.5,
    width: "100%",
  },
  submittedSongName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  submittedArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  backToDetailBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 0.5,
    alignItems: "center",
    marginTop: 8,
  },
  backToDetailText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  liveSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    gap: 10,
  },
  liveSearchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  liveResults: {
    gap: 6,
  },
  liveResultCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderWidth: 0.5,
    gap: 10,
  },
  liveResultTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  liveResultArtist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  liveEditorArea: {
    gap: 12,
  },
  selectedSongBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },
  selectedSongName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  selectedArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  balanceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    gap: 10,
  },
  balanceText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
  },
  verdictContainer: {
    gap: 16,
    paddingTop: 8,
  },
  verdictScreenTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  verdictClips: {
    gap: 8,
    alignItems: "center",
  },
  verdictClipCard: {
    borderWidth: 0.5,
    padding: 14,
    gap: 4,
    width: "100%",
  },
  verdictClipPlayer: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  verdictClipSong: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  verdictClipArtist: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  verdictVsText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  verdictChoices: {
    gap: 12,
  },
  verdictChoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    gap: 8,
  },
  verdictChoiceText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  jurySection: {
    borderWidth: 0.5,
    padding: 16,
    gap: 12,
  },
  juryTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  juryEmojis: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  juryEmojiBtn: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    gap: 4,
  },
  juryEmoji: {
    fontSize: 28,
  },
  juryLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  juryCount: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  verdictResultCard: {
    borderWidth: 0.5,
    padding: 16,
    gap: 8,
  },
  verdictResultTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  verdictResultText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  hallSection: {
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
  },
  hallTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  hallCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 0.5,
    gap: 12,
  },
  hallRank: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    width: 36,
    textAlign: "center",
  },
  hallInfo: {
    flex: 1,
    gap: 2,
  },
  hallSong: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  hallArtist: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  hallVotes: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  hallVoteCount: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
});
