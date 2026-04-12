import React, { useEffect, useRef, useMemo } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

interface WaveformProps {
  duration: number;
  startTime: number | null;
  endTime: number | null;
  currentTime: number;
  isPlaying: boolean;
  onTap?: (timeInPreview: number) => void;
  previewLabel?: string;
}

const BAR_COUNT = 60;

function generateWaveformData(count: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < count; i++) {
    const base = Math.sin((i / count) * Math.PI) * 0.6 + 0.2;
    const variation = Math.sin(i * 0.7) * 0.15 + Math.cos(i * 1.3) * 0.1;
    data.push(Math.max(0.1, Math.min(1, base + variation)));
  }
  return data;
}

export function Waveform({
  duration,
  startTime,
  endTime,
  currentTime,
  onTap,
  previewLabel,
}: WaveformProps) {
  const colors = useColors();
  const waveformData = useMemo(() => generateWaveformData(BAR_COUNT), []);
  const idleAnim = useRef(new Animated.Value(0)).current;
  const hasSelection = startTime !== null;

  useEffect(() => {
    if (hasSelection) return;
    const anim = Animated.loop(
      Animated.timing(idleAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [hasSelection]);

  const startFraction = startTime !== null ? startTime / duration : null;
  const endFraction = endTime !== null ? endTime / duration : null;
  const currentFraction = currentTime / duration;

  const handleBarPress = (index: number) => {
    if (!onTap) return;
    const timeInPreview = (index / BAR_COUNT) * duration;
    onTap(timeInPreview);
  };

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: colors.radius,
        borderTopWidth: 1.5,
        borderTopColor: "rgba(255,255,255,0.45)",
        borderLeftWidth: 0.5,
        borderLeftColor: "rgba(255,255,255,0.20)",
        borderRightWidth: 0.5,
        borderRightColor: "rgba(255,255,255,0.08)",
        borderBottomWidth: 0.5,
        borderBottomColor: "rgba(255,255,255,0.05)",
        ...(Platform.OS === "web" ? {
          backdropFilter: "blur(40px) saturate(160%)",
          WebkitBackdropFilter: "blur(40px) saturate(160%)",
        } : {}),
      } as any,
    ]}>
      {previewLabel && (
        <View style={styles.previewBadge}>
          <View style={[styles.previewBadgePill, { backgroundColor: colors.primary }]}>
            <Text style={[styles.previewBadgeText, { color: colors.primaryForeground }]}>
              {"PREVIEW"}
            </Text>
          </View>
          <Text style={[styles.previewRangeText, { color: colors.mutedForeground }]}>
            {previewLabel}
          </Text>
        </View>
      )}

      <View style={styles.barsContainer}>
        {waveformData.map((height, index) => {
          const barFraction = index / BAR_COUNT;
          let barColor = colors.waveform;
          let isActive = false;

          if (startFraction !== null && endFraction !== null) {
            if (barFraction >= startFraction && barFraction <= endFraction) {
              barColor = colors.waveformActive;
              isActive = true;
            }
          } else if (startFraction !== null) {
            if (Math.abs(barFraction - startFraction) < 0.02) {
              barColor = colors.clipStart;
            }
          }

          if (barFraction <= currentFraction && currentFraction > 0) {
            barColor =
              startFraction !== null &&
              endFraction !== null &&
              barFraction >= startFraction &&
              barFraction <= endFraction
                ? colors.waveformActive
                : barFraction <= currentFraction
                  ? colors.mutedForeground
                  : barColor;
            if (startFraction !== null && endFraction !== null &&
                barFraction >= startFraction && barFraction <= endFraction) {
              isActive = true;
            }
          }

          const glowStyle = isActive && Platform.OS === "web" ? {
            boxShadow: `0 0 6px ${colors.waveformGlow}`,
          } : {};

          const idleScaleY = !hasSelection ? idleAnim.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [1, 1 + (Math.sin(index * 0.5) * 0.15 + 0.08), 1],
          }) : undefined;

          if (onTap) {
            return (
              <Pressable
                key={index}
                onPress={() => handleBarPress(index)}
                style={({ pressed }) => [
                  styles.barTouchable,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                {idleScaleY ? (
                  <Animated.View
                    style={[
                      styles.bar,
                      {
                        height: height * 48,
                        backgroundColor: barColor,
                        transform: [{ scaleY: idleScaleY }],
                        ...glowStyle,
                      } as any,
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: height * 48,
                        backgroundColor: barColor,
                        ...glowStyle,
                      } as any,
                    ]}
                  />
                )}
              </Pressable>
            );
          }

          if (idleScaleY) {
            return (
              <Animated.View
                key={index}
                style={[
                  styles.bar,
                  {
                    height: height * 48,
                    backgroundColor: barColor,
                    transform: [{ scaleY: idleScaleY }],
                    ...glowStyle,
                  } as any,
                ]}
              />
            );
          }

          return (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height: height * 48,
                  backgroundColor: barColor,
                  ...glowStyle,
                } as any,
              ]}
            />
          );
        })}
      </View>

      {startFraction !== null && (
        <View
          style={[
            styles.marker,
            {
              left: `${startFraction * 100}%`,
              backgroundColor: colors.clipStart,
            },
          ]}
        />
      )}

      {endFraction !== null && (
        <View
          style={[
            styles.marker,
            {
              left: `${endFraction * 100}%`,
              backgroundColor: colors.clipEnd,
            },
          ]}
        />
      )}

      {startFraction !== null && endFraction !== null && (
        <View
          style={[
            styles.selectionZone,
            {
              left: `${startFraction * 100}%`,
              width: `${(endFraction - startFraction) * 100}%`,
              backgroundColor: colors.clipZone,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  previewBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  previewBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  previewRangeText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
    minHeight: 4,
  },
  barTouchable: {
    paddingHorizontal: 1,
    justifyContent: "center",
    alignItems: "center",
    height: 48,
  },
  marker: {
    position: "absolute",
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 1,
  },
  selectionZone: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
});
