import { Feather } from "@expo/vector-icons";
import { useSearchSongs } from "@workspace/api-client-react";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
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

import { InstallBanner } from "@/components/InstallBanner";
import { LanguageSelector, FlagPill } from "@/components/LanguageSelector";
import { SongCard } from "@/components/SongCard";
import { useColors } from "@/hooks/useColors";
import { extractDominantColor } from "@/lib/colorExtractor";
import { type AppLang, LANGUAGES, getLanguage, setLanguage as persistLanguage, isOnboardingDone, markOnboardingDone } from "@/lib/language";
import { getRecentClips, type RecentClip } from "@/lib/recentClips";

function LoadingIndicator({ color, mutedColor }: { color: string; mutedColor: string }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 800);
    return () => clearTimeout(t);
  }, []);
  const messages = ["Recherche...", "Vérification des paroles..."];
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={color} />
      <Text style={[styles.loadingText, { color: mutedColor }]}>
        {messages[phase]}
      </Text>
    </View>
  );
}

type SearchMode = "paroles" | "artiste" | "titre" | "album" | "soundtrack" | "humeur" | "evenement" | "vocal";

const SEARCH_MODES: { key: SearchMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "paroles", label: "Paroles", icon: "align-left" },
  { key: "artiste", label: "Artiste", icon: "user" },
  { key: "titre", label: "Titre", icon: "music" },
  { key: "album", label: "Album", icon: "disc" },
  { key: "soundtrack", label: "Soundtrack", icon: "film" },
  { key: "humeur", label: "Humeur", icon: "heart" },
  { key: "evenement", label: "\u00C9v\u00E9nement", icon: "calendar" },
  { key: "vocal", label: "Vocal", icon: "mic" },
];

const MOOD_MAP: Record<string, string> = {
  joyeux: "happy upbeat",
  triste: "sad melancholy",
  melancolique: "melancholic nostalgic",
  amoureux: "love romantic",
  nostalgique: "nostalgic throwback",
  energique: "energetic dance party",
  "en col\u00E8re": "angry intense",
  "apais\u00E9": "calm peaceful",
  festif: "party celebration",
  sarcastique: "sarcastic ironic",
  "passionn\u00E9": "passionate intense",
  paresseux: "lazy chill",
};

const MOOD_CHIPS = [
  "joyeux", "triste", "melancolique", "amoureux", "nostalgique", "energique",
  "en col\u00E8re", "apais\u00E9", "festif", "sarcastique", "passionn\u00E9", "paresseux",
];

const MOOD_EMOJI: Record<string, string> = {
  joyeux: "\u{1F60A}",
  triste: "\u{1F622}",
  melancolique: "\u{1F319}",
  amoureux: "\u{2764}\u{FE0F}",
  nostalgique: "\u{1F4AD}",
  energique: "\u{26A1}",
  "en col\u00E8re": "\u{1F624}",
  "apais\u00E9": "\u{1F60C}",
  festif: "\u{1F973}",
  sarcastique: "\u{1F60F}",
  "passionn\u00E9": "\u{1F525}",
  paresseux: "\u{1F634}",
};

type EventCategory = "famille" | "amour" | "fetes" | "vie";

type EventItem = { key: string; label: string; emoji: string };

type EventSection = { title: string; category: EventCategory; events: EventItem[] };

const EVENT_CATEGORY_TINT: Record<EventCategory, string> = {
  famille: "rgba(245,197,24,0.15)",
  amour: "rgba(194,24,91,0.15)",
  fetes: "rgba(100,50,180,0.15)",
  vie: "rgba(30,80,200,0.15)",
};

const EVENT_CATEGORY_BORDER: Record<EventCategory, string> = {
  famille: "rgba(245,197,24,0.3)",
  amour: "rgba(194,24,91,0.3)",
  fetes: "rgba(100,50,180,0.3)",
  vie: "rgba(30,80,200,0.3)",
};

const EVENT_SECTIONS: EventSection[] = [
  {
    title: "FAMILLE",
    category: "famille",
    events: [
      { key: "fete_meres", label: "F\u00EAte des m\u00E8res", emoji: "\u{1F469}" },
      { key: "fete_peres", label: "F\u00EAte des p\u00E8res", emoji: "\u{1F468}" },
      { key: "fete_grandmeres", label: "Grand-m\u00E8re", emoji: "\u{1F475}" },
      { key: "fete_grandperes", label: "Grand-p\u00E8re", emoji: "\u{1F474}" },
      { key: "naissance", label: "Naissance", emoji: "\u{1F476}" },
      { key: "anniversaire", label: "Anniversaire", emoji: "\u{1F382}" },
    ],
  },
  {
    title: "AMOUR & S\u00C9DUCTION",
    category: "amour",
    events: [
      { key: "premier_message_elle", label: "Premier message \u2640", emoji: "\u{1F48C}" },
      { key: "premier_message_lui", label: "Premier message \u2642", emoji: "\u{1F48C}" },
      { key: "saint_valentin", label: "Saint Valentin", emoji: "\u{2764}\u{FE0F}" },
      { key: "demande_mariage", label: "Demande en mariage", emoji: "\u{1F48D}" },
      { key: "mariage", label: "Mariage", emoji: "\u{1F48D}" },
      { key: "reconciliation", label: "R\u00E9conciliation", emoji: "\u{1F525}" },
      { key: "anniversaire_couple", label: "Anniversaire couple", emoji: "\u{1F491}" },
      { key: "rupture", label: "Rupture", emoji: "\u{1F494}" },
    ],
  },
  {
    title: "F\u00CATES RELIGIEUSES & CULTURELLES",
    category: "fetes",
    events: [
      { key: "aid_el_fitr", label: "A\u00EFd el-Fitr", emoji: "\u{1F54C}" },
      { key: "aid_el_adha", label: "A\u00EFd el-Adha", emoji: "\u{1F54C}" },
      { key: "ramadan", label: "Ramadan", emoji: "\u{262A}\u{FE0F}" },
      { key: "roch_hachana", label: "Roch Hachana", emoji: "\u{1F54D}" },
      { key: "hanoucca", label: "Hanoukka", emoji: "\u{1F54D}" },
      { key: "noel", label: "No\u00EBl", emoji: "\u{271D}\u{FE0F}" },
      { key: "paques", label: "P\u00E2ques", emoji: "\u{271D}\u{FE0F}" },
      { key: "diwali", label: "Diwali", emoji: "\u{1FA94}" },
      { key: "nouvel_an_chinois", label: "Nouvel An \u{1F1E8}\u{1F1F3}", emoji: "\u{1F38B}" },
      { key: "nouvel_an", label: "Nouvel An", emoji: "\u{1F386}" },
    ],
  },
  {
    title: "VIE & R\u00C9USSITE",
    category: "vie",
    events: [
      { key: "diplome", label: "Dipl\u00F4me", emoji: "\u{1F393}" },
      { key: "nouveau_job", label: "Nouveau job", emoji: "\u{1F4BC}" },
      { key: "promotion", label: "Promotion", emoji: "\u{1F4C8}" },
      { key: "nouvelle_maison", label: "Nouvelle maison", emoji: "\u{1F3E0}" },
      { key: "victoire_sportive", label: "Victoire sportive", emoji: "\u{1F3C6}" },
      { key: "guerison", label: "Gu\u00E9rison", emoji: "\u{1F397}\u{FE0F}" },
      { key: "au_revoir", label: "Au revoir", emoji: "\u{2708}\u{FE0F}" },
      { key: "retraite", label: "Retraite", emoji: "\u{1F396}\u{FE0F}" },
      { key: "condoleances", label: "Condol\u00E9ances", emoji: "\u{1F64F}" },
      { key: "encouragement", label: "Encouragement", emoji: "\u{1F4AA}" },
    ],
  },
];

function getPlaceholder(mode: SearchMode): string {
  switch (mode) {
    case "paroles": return "Rechercher par paroles...";
    case "artiste": return "Nom de l'artiste...";
    case "titre": return "Titre de la chanson...";
    case "album": return "Nom de l'album...";
    case "soundtrack": return "Nom du film...";
    case "humeur": return "";
    case "evenement": return "";
    case "vocal": return "";
  }
}

function getSearchAttribute(mode: SearchMode): string | undefined {
  switch (mode) {
    case "artiste": return "artistTerm";
    case "titre": return "songTerm";
    case "album": return "albumTerm";
    case "soundtrack": return "albumTerm";
    default: return undefined;
  }
}

function getEmptyStateContent(mode: SearchMode): { icon: keyof typeof Feather.glyphMap; title: string; subtitle: string } {
  switch (mode) {
    case "paroles":
      return { icon: "align-left", title: "Recherche par paroles", subtitle: "Tapez un extrait de paroles pour trouver la chanson" };
    case "artiste":
      return { icon: "user", title: "Recherche par artiste", subtitle: "Entrez le nom d'un artiste pour voir ses chansons" };
    case "titre":
      return { icon: "music", title: "Recherche par titre", subtitle: "Entrez le titre d'une chanson pour la trouver" };
    case "album":
      return { icon: "disc", title: "Recherche par album", subtitle: "Entrez le nom d'un album pour trouver ses chansons" };
    case "soundtrack":
      return { icon: "film", title: "Recherche par film", subtitle: "Entrez le nom d'un film pour trouver sa bande originale" };
    default:
      return { icon: "headphones", title: "", subtitle: "" };
  }
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const urlParams = useLocalSearchParams<{ reply_to?: string; sender?: string }>();
  const [replyContext, setReplyContext] = useState<{ clipId: string; sender: string } | null>(null);

  useEffect(() => {
    if (urlParams.reply_to) {
      setReplyContext({
        clipId: urlParams.reply_to,
        sender: urlParams.sender || "Quelqu'un",
      });
    }
  }, [urlParams.reply_to, urlParams.sender]);

  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("paroles");
  const [searchAttribute, setSearchAttribute] = useState<string | undefined>(undefined);
  const [isListening, setIsListening] = useState(false);
  const [listenCountdown, setListenCountdown] = useState(0);
  const [vocalError, setVocalError] = useState<string | null>(null);
  const [recentClips, setRecentClips] = useState<RecentClip[]>([]);
  const [gradientColor, setGradientColor] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [eventPersonalization, setEventPersonalization] = useState("");
  const [currentLang, setCurrentLang] = useState<AppLang>("fr");
  const [searchLangOverride, setSearchLangOverride] = useState<AppLang | null>(null);
  const [showLangSelector, setShowLangSelector] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const recognitionRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const logoLetterSpacing = useRef(new Animated.Value(-0.5)).current;
  const logoOpacity = useRef(new Animated.Value(1)).current;
  const orb1Scale = useRef(new Animated.Value(1)).current;
  const orb1Opacity = useRef(new Animated.Value(0.6)).current;
  const orb2Scale = useRef(new Animated.Value(1)).current;
  const orb2Opacity = useRef(new Animated.Value(0.6)).current;
  const orb3Scale = useRef(new Animated.Value(1)).current;
  const orb3Opacity = useRef(new Animated.Value(0.6)).current;
  const searchPulseAnim = useRef(new Animated.Value(0)).current;
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    const logoAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoLetterSpacing, { toValue: 2, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(logoOpacity, { toValue: 0.8, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
        Animated.parallel([
          Animated.timing(logoLetterSpacing, { toValue: -0.5, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(logoOpacity, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      ])
    );
    logoAnim.start();

    if (Platform.OS !== "web") {
      return () => { logoAnim.stop(); };
    }

    const orbAnim1 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orb1Scale, { toValue: 1.15, duration: 2700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb1Opacity, { toValue: 0.8, duration: 2700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orb1Scale, { toValue: 0.9, duration: 2700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb1Opacity, { toValue: 0.5, duration: 2700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orb1Scale, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb1Opacity, { toValue: 0.6, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    orbAnim1.start();

    const orbAnim2 = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orb2Scale, { toValue: 0.9, duration: 3300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb2Opacity, { toValue: 0.5, duration: 3300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orb2Scale, { toValue: 1.15, duration: 3400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb2Opacity, { toValue: 0.8, duration: 3400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orb2Scale, { toValue: 1, duration: 3300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb2Opacity, { toValue: 0.6, duration: 3300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    orbAnim2.start();

    const orbAnim3 = Animated.loop(
      Animated.sequence([
        Animated.delay(2000),
        Animated.parallel([
          Animated.timing(orb3Scale, { toValue: 1.15, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb3Opacity, { toValue: 0.8, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(orb3Scale, { toValue: 0.9, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(orb3Opacity, { toValue: 0.5, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    orbAnim3.start();

    return () => { logoAnim.stop(); orbAnim1.stop(); orbAnim2.stop(); orbAnim3.stop(); };
  }, []);

  const showSearchBarForPulse = searchMode === "paroles" || searchMode === "artiste" || searchMode === "titre" || searchMode === "album" || searchMode === "soundtrack";
  useEffect(() => {
    if (!showSearchBarForPulse || searchFocused || query.length > 0) {
      searchPulseAnim.stopAnimation();
      searchPulseAnim.setValue(0);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(searchPulseAnim, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(searchPulseAnim, { toValue: 0, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [showSearchBarForPulse, searchFocused, query.length > 0]);

  const searchBorderColor = searchPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.25)", "rgba(255,255,255,0.50)"],
  });

  useEffect(() => {
    getRecentClips().then((clips) => setRecentClips(clips.slice(0, 3)));
    getLanguage().then((lang) => setCurrentLang(lang));
    isOnboardingDone().then((done) => {
      if (!done) setShowOnboarding(true);
    });
  }, []);

  const handleLangSelect = useCallback((lang: AppLang) => {
    setCurrentLang(lang);
    persistLanguage(lang);
    setShowLangSelector(false);
    setShowOnboarding(false);
    markOnboardingDone();
    if (searchTerm) {
      setSearchTerm("");
      setTimeout(() => setSearchTerm(searchTerm), 50);
    }
  }, [searchTerm]);

  const effectiveLang = searchLangOverride || currentLang;

  const { data, isLoading } = useSearchSongs(
    { q: searchTerm, attribute: searchAttribute, mode: searchMode, lang: effectiveLang },
    {
      query: {
        enabled: searchTerm.length > 0,
      },
    }
  );

  useEffect(() => {
    const results = data?.results;
    if (results && results.length > 0 && results[0].artworkUrl100) {
      extractDominantColor(results[0].artworkUrl100, setGradientColor);
    }
  }, [data]);

  const handleSearch = useCallback(() => {
    if (query.trim().length > 0) {
      const attr = getSearchAttribute(searchMode);
      setSearchAttribute(attr);
      setSearchLangOverride(null);
      setSearchTerm(query.trim());
    }
  }, [query, searchMode]);

  const handleModeChange = useCallback((mode: SearchMode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchMode(mode);
    setQuery("");
    setSearchTerm("");
    setSearchLangOverride(null);
    setVocalError(null);
    setSelectedEvent(null);
    setEventPersonalization("");
  }, []);

  const handleSearchInLang = useCallback((lang: AppLang) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchLangOverride(lang);
  }, []);

  const handleMoodSelect = useCallback((mood: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setQuery(mood);
    setSearchAttribute(undefined);
    setSearchTerm(mood);
  }, []);

  const handleEventSelect = useCallback((eventKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedEvent(eventKey);
    setEventPersonalization("");
  }, []);

  const handleEventSearch = useCallback(() => {
    if (!selectedEvent) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const searchQuery = eventPersonalization.trim()
      ? `${selectedEvent}:${eventPersonalization.trim()}`
      : selectedEvent;
    setQuery(searchQuery);
    setSearchAttribute(undefined);
    setSearchTerm(searchQuery);
  }, [selectedEvent, eventPersonalization]);

  useEffect(() => {
    if (!isListening) {
      pulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isListening, pulseAnim]);

  const startVocalRecognition = useCallback(() => {
    if (Platform.OS !== "web") {
      setVocalError("La reconnaissance vocale est disponible uniquement dans le navigateur.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVocalError("Votre navigateur ne supporte pas la recherche vocale. Essayez Chrome.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsListening(true);
    setListenCountdown(5);
    setVocalError(null);

    const recognition = new SpeechRecognition();
    const speechLangMap: Record<string, string> = { fr: "fr-FR", en: "en-US", es: "es-ES", it: "it-IT", tr: "tr-TR", ar: "ar-SA", pt: "pt-BR", de: "de-DE", mix: "fr-FR" };
    recognition.lang = speechLangMap[currentLang] || "fr-FR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      setSearchAttribute(undefined);
      setSearchTerm(transcript);
      setIsListening(false);
      setListenCountdown(0);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setListenCountdown(0);
      setVocalError("Aucune parole reconnue. Essayez encore.");
    };

    recognition.onend = () => {
      setIsListening(false);
      setListenCountdown(0);
    };

    recognition.start();

    setTimeout(() => {
      try { recognition.stop(); } catch {}
    }, 5000);
  }, [currentLang]);

  useEffect(() => {
    if (!isListening || listenCountdown <= 0) return;
    const timer = setTimeout(() => {
      setListenCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [isListening, listenCountdown]);

  const handleSongSelect = (song: any) => {
    const target = song.alternativeVersion || song;
    router.push({
      pathname: "/editor",
      params: {
        trackId: target.trackId.toString(),
        trackName: target.trackName,
        artistName: target.artistName,
        collectionName: target.collectionName || "",
        artworkUrl100: target.artworkUrl100,
        previewUrl: target.previewUrl || "",
        trackTimeMillis: target.trackTimeMillis.toString(),
        ...(target.source === "youtube" ? {
          source: "youtube",
          youtubeId: target.youtubeId || "",
          youtubeQuery: target.youtubeQuery || "",
        } : {}),
      },
    });
  };

  const showSearchBar = searchMode === "paroles" || searchMode === "artiste" || searchMode === "titre" || searchMode === "album" || searchMode === "soundtrack";
  const hasResults = !isLoading && data?.results && data.results.length > 0;
  const noResults = !isLoading && searchTerm && data?.results?.length === 0;

  const renderResults = () => (
    <>
      {isLoading && (
        <LoadingIndicator color={colors.primary} mutedColor={colors.mutedForeground} />
      )}

      {hasResults && (
        <>
          <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
            {`${data!.results!.length} r\u00E9sultat${data!.results!.length !== 1 ? "s" : ""}`}
          </Text>
          {data!.results!.map((song, idx) => (
            <SongCard
              key={song.trackId}
              trackName={(song as any).alternativeVersion ? (song as any).alternativeVersion.trackName : song.trackName}
              artistName={(song as any).alternativeVersion ? (song as any).alternativeVersion.artistName : song.artistName}
              collectionName={(song as any).alternativeVersion ? (song as any).alternativeVersion.collectionName : song.collectionName}
              artworkUrl100={(song as any).alternativeVersion ? (song as any).alternativeVersion.artworkUrl100 : song.artworkUrl100}
              trackTimeMillis={(song as any).alternativeVersion ? (song as any).alternativeVersion.trackTimeMillis : song.trackTimeMillis}
              lyricsStatus={((song as any).alternativeVersion?.lyricsStatus || (song as any).lyricsStatus) as "synced" | "plain" | "ai_available" | "waveform_only" | undefined}
              chorusBadge={(song as any).alternativeVersion?.chorusBadge}
              isOriginal={(song as any).isOriginal}
              isCoupDeCoeur={(song as any).isCoupDeCoeur}
              curatedWhy={(song as any).curatedWhy}
              source={(song as any).source === "youtube" ? "youtube" : undefined}
              onPress={() => handleSongSelect(song)}
              index={idx}
            />
          ))}
        </>
      )}

      {noResults && (
        <View style={styles.emptyState}>
          <Feather name="music" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {"Aucune chanson trouv\u00E9e avec des paroles disponibles"}
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {"Essaie un autre titre ou artiste"}
          </Text>
        </View>
      )}

      {searchTerm.length > 0 && !isLoading && (
        <View style={styles.langOverrideRow}>
          <Text style={[styles.langOverrideLabel, { color: colors.mutedForeground }]}>
            {noResults ? "Chercher dans une autre langue :" : "Voir aussi en :"}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langOverridePills}>
            {LANGUAGES.filter(l => l.code !== effectiveLang && l.code !== "mix").slice(0, 4).map((l) => (
              <Pressable
                key={l.code}
                onPress={() => handleSearchInLang(l.code)}
                style={({ pressed }) => [
                  styles.langOverridePill,
                  {
                    backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.15)",
                    transform: [{ scale: pressed ? 0.95 : 1 }],
                  },
                ]}
              >
                <Text style={styles.langOverrideFlag}>{l.flag}</Text>
                <Text style={[styles.langOverrideName, { color: "rgba(255,255,255,0.7)" }]}>{l.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => handleSearchInLang("mix")}
              style={({ pressed }) => [
                styles.langOverridePill,
                {
                  backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                  borderColor: "rgba(255,255,255,0.15)",
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <Text style={styles.langOverrideFlag}>{"\u{1F30D}"}</Text>
              <Text style={[styles.langOverrideName, { color: "rgba(255,255,255,0.7)" }]}>{"Mix"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}
    </>
  );

  const renderTabContent = () => {
    switch (searchMode) {
      case "paroles":
      case "artiste":
      case "titre":
      case "album":
      case "soundtrack": {
        const emptyContent = getEmptyStateContent(searchMode);
        return (
          <>
            {!searchTerm && !isLoading && (
              <View style={styles.emptyState}>
                <Feather name={emptyContent.icon} size={48} color={colors.mutedForeground} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {emptyContent.title}
                </Text>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  {emptyContent.subtitle}
                </Text>
              </View>
            )}
            {renderResults()}
          </>
        );
      }

      case "humeur":
        return (
          <>
            {!searchTerm && (
              <View style={styles.moodChipsContainer}>
                <Text style={[styles.moodTitle, { color: colors.foreground }]}>
                  {"Quelle est votre humeur ?"}
                </Text>
                <Text style={[styles.moodSubtitle, { color: colors.mutedForeground }]}>
                  {"Choisissez une ambiance pour trouver la chanson parfaite"}
                </Text>
                <View style={styles.moodChips}>
                  {MOOD_CHIPS.map((mood) => (
                    <Pressable
                      key={mood}
                      onPress={() => handleMoodSelect(mood)}
                      style={({ pressed }) => [
                        styles.moodChip,
                        {
                          backgroundColor: pressed ? colors.primary : colors.card,
                          borderRadius: 16,
                          borderColor: colors.border,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                    >
                      <Text style={styles.moodEmoji}>{MOOD_EMOJI[mood]}</Text>
                      <Text
                        style={[
                          styles.moodChipText,
                          { color: colors.foreground },
                        ]}
                      >
                        {mood.charAt(0).toUpperCase() + mood.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {renderResults()}
          </>
        );

      case "evenement": {
        let selectedEventData: { event: EventItem; section: EventSection } | null = null;
        if (selectedEvent) {
          for (const section of EVENT_SECTIONS) {
            const found = section.events.find((e) => e.key === selectedEvent);
            if (found) { selectedEventData = { event: found, section }; break; }
          }
        }
        return (
          <>
            {!searchTerm && !selectedEvent && (
              <View style={styles.moodChipsContainer}>
                <Text style={[styles.moodTitle, { color: colors.foreground }]}>
                  {"Quel moment de vie ?"}
                </Text>
                <Text style={[styles.moodSubtitle, { color: colors.mutedForeground }]}>
                  {"Trouvez la chanson parfaite pour chaque occasion"}
                </Text>
                {EVENT_SECTIONS.map((section) => (
                  <View key={section.title} style={styles.eventSectionBlock}>
                    <Text style={[styles.eventSectionTitle, { color: EVENT_CATEGORY_BORDER[section.category] }]}>
                      {section.title}
                    </Text>
                    <View style={styles.moodChips}>
                      {section.events.map((evt) => (
                        <Pressable
                          key={evt.key}
                          onPress={() => handleEventSelect(evt.key)}
                          style={({ pressed }) => [
                            styles.moodChip,
                            {
                              backgroundColor: EVENT_CATEGORY_TINT[section.category],
                              borderRadius: 16,
                              borderColor: EVENT_CATEGORY_BORDER[section.category],
                              opacity: pressed ? 0.85 : 1,
                            },
                          ]}
                        >
                          <Text style={styles.moodEmoji}>{evt.emoji}</Text>
                          <Text
                            style={[
                              styles.moodChipText,
                              { color: colors.foreground },
                            ]}
                          >
                            {evt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {!searchTerm && selectedEventData && (
              <View style={styles.moodChipsContainer}>
                <Pressable
                  onPress={() => { setSelectedEvent(null); setEventPersonalization(""); }}
                  style={styles.eventBackButton}
                >
                  <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.eventBackText, { color: colors.mutedForeground }]}>
                    {"Tous les \u00E9v\u00E9nements"}
                  </Text>
                </Pressable>
                <Text style={styles.eventSelectedEmoji}>{selectedEventData.event.emoji}</Text>
                <Text style={[styles.moodTitle, { color: colors.foreground }]}>
                  {selectedEventData.event.label}
                </Text>
                <View style={styles.eventPersonalizationContainer}>
                  <TextInput
                    style={[
                      styles.eventPersonalizationInput,
                      {
                        color: colors.foreground,
                        backgroundColor: "rgba(255,255,255,0.05)",
                        borderColor: EVENT_CATEGORY_BORDER[selectedEventData.section.category],
                      },
                    ]}
                    placeholder={
                      selectedEventData.event.key === "mariage" || selectedEventData.event.key === "demande_mariage"
                        ? "Pr\u00E9nom(s) des mari\u00E9s \u2014 optionnel"
                        : selectedEventData.event.key === "anniversaire"
                        ? "Pr\u00E9nom \u2014 optionnel"
                        : selectedEventData.event.key === "naissance"
                        ? "Pr\u00E9nom du b\u00E9b\u00E9 \u2014 optionnel"
                        : selectedEventData.event.key === "diplome"
                        ? "Pr\u00E9nom du dipl\u00F4m\u00E9 \u2014 optionnel"
                        : selectedEventData.event.key === "premier_message_elle" || selectedEventData.event.key === "premier_message_lui"
                        ? "Son pr\u00E9nom \u2014 optionnel"
                        : selectedEventData.event.key === "anniversaire_couple"
                        ? "Vos pr\u00E9noms \u2014 optionnel"
                        : "Pr\u00E9nom(s) \u2014 optionnel"
                    }
                    placeholderTextColor={colors.mutedForeground}
                    value={eventPersonalization}
                    onChangeText={setEventPersonalization}
                    onSubmitEditing={handleEventSearch}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                </View>
                <Pressable
                  onPress={handleEventSearch}
                  style={({ pressed }) => [
                    styles.eventSearchButton,
                    {
                      backgroundColor: pressed
                        ? EVENT_CATEGORY_BORDER[selectedEventData!.section.category]
                        : EVENT_CATEGORY_TINT[selectedEventData!.section.category],
                      borderColor: EVENT_CATEGORY_BORDER[selectedEventData!.section.category],
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Feather name="search" size={16} color={colors.foreground} />
                  <Text style={[styles.eventSearchButtonText, { color: colors.foreground }]}>
                    {"Trouver les Sings parfaits"}
                  </Text>
                </Pressable>
              </View>
            )}
            {renderResults()}
          </>
        );
      }

      case "vocal":
        return (
          <>
            {!searchTerm && (
              <View style={styles.vocalContainer}>
                <View style={styles.micWrapper}>
                  <Animated.View
                    style={[
                      styles.micPulseRing,
                      {
                        backgroundColor: isListening ? `${colors.primary}30` : "transparent",
                        transform: [{ scale: pulseAnim }],
                      },
                    ]}
                  />
                  <Pressable
                    onPress={startVocalRecognition}
                    disabled={isListening}
                    style={[
                      styles.micButton,
                      {
                        backgroundColor: isListening ? colors.destructive : colors.card,
                        borderColor: isListening ? colors.destructive : colors.border,
                      },
                    ]}
                  >
                    <Feather
                      name="mic"
                      size={28}
                      color={isListening ? colors.primaryForeground : colors.primary}
                    />
                  </Pressable>
                </View>

                <Text style={[styles.vocalText, { color: colors.foreground }]}>
                  {isListening
                    ? `\u00C9coute en cours... ${listenCountdown}s`
                    : "Chante ou fredonne le refrain"}
                </Text>
                <Text style={[styles.vocalSubtext, { color: colors.mutedForeground }]}>
                  {isListening
                    ? "Chantez quelques paroles de la chanson"
                    : "On transcrit et on cherche pour vous"}
                </Text>

                {vocalError != null && (
                  <View style={[styles.vocalErrorBox, { backgroundColor: `${colors.destructive}15`, borderRadius: 12 }]}>
                    <Feather name="alert-circle" size={16} color={colors.destructive} />
                    <Text style={[styles.vocalErrorText, { color: colors.destructive }]}>
                      {vocalError}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {renderResults()}
          </>
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Platform.OS === "web" ? "rgba(13,10,26,0.75)" : colors.background }]}>
      <StatusBar style="light" />
      {Platform.OS === "web" && (
        <>
          <Animated.View
            style={[
              styles.ambientOrb,
              {
                top: -150,
                left: -150,
                width: 500,
                height: 500,
                background: "radial-gradient(circle, rgba(100,50,180,0.50) 0%, transparent 65%)",
                filter: "blur(80px)",
                transform: [{ scale: orb1Scale }],
                opacity: orb1Opacity,
              } as any,
            ]}
          />
          <Animated.View
            style={[
              styles.ambientOrb,
              {
                bottom: -80,
                right: -80,
                width: 450,
                height: 450,
                background: "radial-gradient(circle, rgba(160,40,80,0.40) 0%, transparent 65%)",
                filter: "blur(70px)",
                transform: [{ scale: orb2Scale }],
                opacity: orb2Opacity,
              } as any,
            ]}
          />
          <Animated.View
            style={[
              styles.ambientOrb,
              {
                top: "40%",
                right: -100,
                width: 300,
                height: 300,
                background: "radial-gradient(circle, rgba(20,60,160,0.35) 0%, transparent 70%)",
                filter: "blur(60px)",
                transform: [{ scale: orb3Scale }],
                opacity: orb3Opacity,
              } as any,
            ]}
          />
          {gradientColor != null && (
            <View
              style={[
                styles.ambientOrb,
                {
                  top: 0,
                  left: "50%",
                  width: 500,
                  height: 300,
                  transform: [{ translateX: -250 }],
                  background: `radial-gradient(ellipse, ${gradientColor}55 0%, transparent 70%)`,
                  filter: "blur(80px)",
                } as any,
              ]}
            />
          )}
        </>
      )}
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Animated.Text style={[styles.appName, {
            color: colors.foreground,
            letterSpacing: logoLetterSpacing,
            opacity: logoOpacity,
            ...(Platform.OS === "web" ? {
              textShadow: "0 0 40px rgba(255,255,255,0.15), 0 0 80px rgba(120,60,200,0.20)",
            } : {}),
          }]}>
            {"Sing Sing"}
          </Animated.Text>
          <FlagPill lang={currentLang} onPress={() => setShowLangSelector(true)} />
        </View>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          {"Trouve une chanson, clippe un passage, partage le vibe"}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 12, zIndex: 1 }}>
        {replyContext && (
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "rgba(194,24,91,0.18)",
            borderRadius: colors.radius,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderTopWidth: 1.5,
            borderTopColor: "rgba(194,24,91,0.45)",
            borderLeftWidth: 0.5,
            borderLeftColor: "rgba(194,24,91,0.15)",
            borderRightWidth: 0.5,
            borderRightColor: "rgba(194,24,91,0.10)",
            borderBottomWidth: 0.5,
            borderBottomColor: "rgba(194,24,91,0.05)",
            gap: 10,
          }}>
            <Text style={{ fontSize: 20 }}>{"\uD83C\uDFB5"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
                {`R\u00e9ponds au Sing de ${replyContext.sender}`}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
                {"Choisis une chanson pour r\u00e9pondre"}
              </Text>
            </View>
            <Pressable
              onPress={() => setReplyContext(null)}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <Feather name="x" size={16} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        )}
        <InstallBanner />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/reply");
          }}
          style={({ pressed }) => [
            styles.replyButton,
            {
              backgroundColor: pressed ? "rgba(100,50,180,0.30)" : "rgba(100,50,180,0.20)",
              borderRadius: colors.radius,
              borderTopWidth: 1.5,
              borderTopColor: "rgba(150,100,255,0.45)",
              borderLeftWidth: 0.5,
              borderLeftColor: "rgba(150,100,255,0.20)",
              borderRightWidth: 0.5,
              borderRightColor: "rgba(100,50,180,0.10)",
              borderBottomWidth: 0.5,
              borderBottomColor: "rgba(100,50,180,0.05)",
              transform: [{ scale: pressed ? 0.97 : 1 }],
              ...(Platform.OS === "web" ? {
                backdropFilter: "blur(40px) saturate(160%)",
                WebkitBackdropFilter: "blur(40px) saturate(160%)",
              } : {}),
            } as any,
          ]}
        >
          <Feather name="message-circle" size={18} color="#FFFFFF" />
          <Text style={[styles.replyButtonText, { color: "#FFFFFF" }]}>
            {"R\u00E9ponds \u00E0 un message \u2192"}
          </Text>
        </Pressable>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/battle");
            }}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? "rgba(194,24,91,0.40)" : "rgba(194,24,91,0.25)",
                borderRadius: colors.radius,
                borderTopWidth: 1.5,
                borderTopColor: "rgba(194,24,91,0.60)",
                borderLeftWidth: 0.5,
                borderLeftColor: "rgba(194,24,91,0.25)",
                borderRightWidth: 0.5,
                borderRightColor: "rgba(194,24,91,0.12)",
                borderBottomWidth: 0.5,
                borderBottomColor: "rgba(194,24,91,0.05)",
                transform: [{ scale: pressed ? 0.96 : 1 }],
                ...(Platform.OS === "web" ? {
                  backdropFilter: "blur(40px) saturate(160%)",
                  WebkitBackdropFilter: "blur(40px) saturate(160%)",
                } : {}),
              } as any,
            ]}
          >
            <Text style={styles.actionEmoji}>{"\u{1F525}"}</Text>
            <Text style={[styles.actionText, { color: "#FFFFFF" }]}>
              {"Clash \u{1F525}"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/keyboard");
            }}
            style={({ pressed }) => [
              styles.actionButton,
              {
                backgroundColor: pressed ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
                borderRadius: colors.radius,
                borderTopWidth: 1.5,
                borderTopColor: "rgba(255,255,255,0.40)",
                borderLeftWidth: 0.5,
                borderLeftColor: "rgba(255,255,255,0.15)",
                borderRightWidth: 0.5,
                borderRightColor: "rgba(255,255,255,0.08)",
                borderBottomWidth: 0.5,
                borderBottomColor: "rgba(255,255,255,0.05)",
                transform: [{ scale: pressed ? 0.96 : 1 }],
                ...(Platform.OS === "web" ? {
                  backdropFilter: "blur(40px) saturate(160%)",
                  WebkitBackdropFilter: "blur(40px) saturate(160%)",
                } : {}),
              } as any,
            ]}
          >
            <Feather name="grid" size={16} color="#FFFFFF" />
            <Text style={[styles.actionText, { color: "#FFFFFF" }]}>
              {"Clavier"}
            </Text>
          </Pressable>
        </View>

        {recentClips.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={[styles.recentTitle, { color: colors.foreground }]}>
              {"Mes clips r\u00E9cents"}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentScroll}>
              {recentClips.map((clip) => (
                <View
                  key={clip.id}
                  style={[
                    styles.recentCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderRadius: colors.radius,
                    },
                  ]}
                >
                  {clip.artworkUrl100 ? (
                    <Image
                      source={{ uri: clip.artworkUrl100 }}
                      style={[styles.recentArtwork, { borderRadius: 6 }]}
                    />
                  ) : (
                    <View style={[styles.recentArtwork, { backgroundColor: colors.muted, borderRadius: 6, alignItems: "center", justifyContent: "center" }]}>
                      <Feather name="music" size={14} color={colors.mutedForeground} />
                    </View>
                  )}
                  <Text style={[styles.recentSong, { color: colors.foreground }]} numberOfLines={1}>
                    {clip.trackName}
                  </Text>
                  <Text style={[styles.recentArtist, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {clip.artistName}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={[styles.tabContainer, { paddingHorizontal: 20 }]}>
        {showSearchBar && (
          <Animated.View
            style={[
              styles.searchBar,
              {
                backgroundColor: "rgba(255,255,255,0.05)",
                borderRadius: colors.radius,
                borderTopWidth: 1.5,
                borderTopColor: searchFocused ? "rgba(255,255,255,0.60)" : searchBorderColor,
                borderLeftWidth: 0.5,
                borderLeftColor: searchFocused ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.15)",
                borderRightWidth: 0.5,
                borderRightColor: "rgba(255,255,255,0.08)",
                borderBottomWidth: 0.5,
                borderBottomColor: "rgba(255,255,255,0.05)",
                ...(Platform.OS === "web" ? {
                  backdropFilter: "blur(40px) saturate(160%)",
                  WebkitBackdropFilter: "blur(40px) saturate(160%)",
                } : {}),
              } as any,
            ]}
          >
            <Feather name="search" size={18} color={searchFocused ? colors.foreground : colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder={getPlaceholder(searchMode)}
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              autoCorrect={false}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(""); setSearchTerm(""); }}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
          </Animated.View>
        )}

        <View style={showSearchBar ? styles.modesWrapperWithBar : styles.modesWrapperNoBar}>
          <View style={styles.modesRow}>
            {SEARCH_MODES.filter((m) => m.key === "paroles" || m.key === "artiste" || m.key === "titre" || m.key === "album").map((mode) => {
              const isActive = searchMode === mode.key;
              return (
                <Pressable
                  key={mode.key}
                  onPress={() => handleModeChange(mode.key)}
                  style={[
                    styles.modeTab,
                    {
                      backgroundColor: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.08)",
                      borderWidth: isActive ? 0 : 0.5,
                      borderColor: isActive ? "transparent" : "rgba(255,255,255,0.12)",
                      borderRadius: 20,
                    },
                  ]}
                >
                  <Feather
                    name={mode.icon}
                    size={14}
                    color={isActive ? "#0d0a1a" : "rgba(255,255,255,0.6)"}
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      {
                        color: isActive ? "#0d0a1a" : "rgba(255,255,255,0.6)",
                      },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.modesRowCentered}>
            {SEARCH_MODES.filter((m) => m.key === "humeur" || m.key === "evenement" || m.key === "vocal" || m.key === "soundtrack").map((mode) => {
              const isActive = searchMode === mode.key;
              return (
                <Pressable
                  key={mode.key}
                  onPress={() => handleModeChange(mode.key)}
                  style={[
                    styles.modeTab,
                    {
                      backgroundColor: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.08)",
                      borderWidth: isActive ? 0 : 0.5,
                      borderColor: isActive ? "transparent" : "rgba(255,255,255,0.12)",
                      borderRadius: 20,
                    },
                  ]}
                >
                  <Feather
                    name={mode.icon}
                    size={14}
                    color={isActive ? "#0d0a1a" : "rgba(255,255,255,0.6)"}
                  />
                  <Text
                    style={[
                      styles.modeLabel,
                      {
                        color: isActive ? "#0d0a1a" : "rgba(255,255,255,0.6)",
                      },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.results}
        contentContainerStyle={[
          styles.resultsContent,
          { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderTabContent()}
      </ScrollView>

      <LanguageSelector
        visible={showLangSelector || showOnboarding}
        currentLang={currentLang}
        onSelect={handleLangSelect}
        onClose={() => {
          setShowLangSelector(false);
          if (showOnboarding) {
            setShowOnboarding(false);
            markOnboardingDone();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  ambientOrb: {
    position: "absolute",
    borderRadius: 9999,
    pointerEvents: "none",
    zIndex: 0,
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    zIndex: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 1,
  },
  appName: {
    fontSize: 32,
    fontFamily: "Georgia",
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  replyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    gap: 8,
  },
  replyButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    gap: 6,
  },
  actionEmoji: {
    fontSize: 16,
  },
  actionText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  recentSection: {
    gap: 8,
  },
  recentTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  recentScroll: {
    flexDirection: "row",
  },
  recentCard: {
    width: 110,
    padding: 8,
    marginRight: 10,
    borderWidth: 0.5,
    gap: 4,
  },
  recentArtwork: {
    width: 94,
    height: 94,
  },
  recentSong: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  recentArtist: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  tabContainer: {
    marginBottom: 8,
    zIndex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  modesWrapperWithBar: {
    marginTop: 10,
    gap: 8,
  },
  modesWrapperNoBar: {
    marginTop: 0,
    gap: 8,
  },
  modesRow: {
    flexDirection: "row",
    gap: 8,
  },
  modesRowCentered: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  modeTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  modeLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  results: {
    flex: 1,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  resultsContent: {
    paddingTop: 4,
  },
  resultCount: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  moodChipsContainer: {
    paddingTop: 24,
    alignItems: "center",
    gap: 12,
  },
  moodTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
  },
  moodSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 4,
  },
  moodChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  moodChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 0.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodChipText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  eventSectionBlock: {
    width: "100%",
    marginTop: 16,
    gap: 10,
  },
  eventSectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.5,
    paddingHorizontal: 4,
  },
  eventBackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  eventBackText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  eventSelectedEmoji: {
    fontSize: 40,
    marginBottom: 4,
  },
  eventPersonalizationContainer: {
    width: "100%",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  eventPersonalizationInput: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  eventSearchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  eventSearchButtonText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  vocalContainer: {
    alignItems: "center",
    paddingTop: 40,
    gap: 16,
  },
  micWrapper: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  micPulseRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  vocalText: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  vocalSubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  vocalErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },
  vocalErrorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  langOverrideRow: {
    marginTop: 16,
    gap: 8,
  },
  langOverrideLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  langOverridePills: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  langOverridePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  langOverrideFlag: {
    fontSize: 16,
  },
  langOverrideName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
