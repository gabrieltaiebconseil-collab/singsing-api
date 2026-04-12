import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface LyricWord {
  word: string;
  time: number;
}

interface TappableLyricsProps {
  words: LyricWord[];
  startIndex: number | null;
  endIndex: number | null;
  onWordTap: (index: number) => void;
}

function WordButton({ word, index, isStart, isEnd, isInSelection, onTap }: {
  word: string;
  index: number;
  isStart: boolean;
  isEnd: boolean;
  isInSelection: boolean;
  onTap: (index: number) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.15, useNativeDriver: true, speed: 50, bounciness: 10 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
    ]).start();
    onTap(index);
  };

  let bgColor = "transparent";
  let textColor = "rgba(255,255,255,0.85)";
  let fontWeight: "normal" | "600" = "normal";

  if (isStart) {
    bgColor = "rgba(255,255,255,0.90)";
    textColor = "#000000";
    fontWeight = "600";
  } else if (isEnd) {
    bgColor = "#E8183A";
    textColor = "#FFFFFF";
    fontWeight = "600";
  } else if (isInSelection) {
    bgColor = "rgba(255,255,255,0.15)";
    textColor = "rgba(255,255,255,0.95)";
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.wordButton,
          { backgroundColor: bgColor },
          Platform.OS === "web" ? { cursor: "pointer" } as any : {},
        ]}
      >
        <Text style={[styles.wordText, { color: textColor, fontWeight }]}>
          {word}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function TappableLyrics({
  words,
  startIndex,
  endIndex,
  onWordTap,
}: TappableLyricsProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  if (words.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          {"Aucune parole disponible"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={true}
    >
      <View style={styles.wordsContainer}>
        {words.map((w, i) => (
          <WordButton
            key={`${i}-${w.word}`}
            word={w.word}
            index={i}
            isStart={startIndex !== null && i === startIndex}
            isEnd={endIndex !== null && i === endIndex}
            isInSelection={
              startIndex !== null &&
              endIndex !== null &&
              i > startIndex &&
              i < endIndex
            }
            onTap={onWordTap}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: "45%" as any,
  },
  content: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  wordsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    lineHeight: 2.4,
  },
  wordButton: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
  },
  wordText: {
    fontSize: 16,
    lineHeight: 35,
    fontFamily: "Georgia",
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
