import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { type AppLang, LANGUAGES } from "@/lib/language";

interface LanguageSelectorProps {
  visible: boolean;
  currentLang: AppLang;
  onSelect: (lang: AppLang) => void;
  onClose: () => void;
}

export function LanguageSelector({ visible, currentLang, onSelect, onClose }: LanguageSelectorProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.modal, Platform.OS === "web" ? {
          backdropFilter: "blur(40px) saturate(160%)",
          WebkitBackdropFilter: "blur(40px) saturate(160%)",
        } as any : {}]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{"Ta langue musicale"}</Text>
              <Text style={styles.subtitle}>{"Tu peux toujours chercher dans n\u2019importe quelle langue"}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
              <Feather name="x" size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {LANGUAGES.map((lang) => {
              const isActive = currentLang === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => onSelect(lang.code)}
                  style={[
                    styles.langPill,
                    {
                      backgroundColor: isActive ? "rgba(194,24,91,0.30)" : "rgba(255,255,255,0.06)",
                      borderColor: isActive ? "rgba(194,24,91,0.60)" : "rgba(255,255,255,0.12)",
                    },
                  ]}
                >
                  <Text style={styles.flag}>{lang.flag}</Text>
                  <Text style={[styles.label, { color: isActive ? "#fff" : "rgba(255,255,255,0.7)" }]}>
                    {lang.label}
                  </Text>
                  {isActive && (
                    <Feather name="check" size={14} color="#C2185B" style={{ marginLeft: "auto" }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface FlagPillProps {
  lang: AppLang;
  onPress: () => void;
}

export function FlagPill({ lang, onPress }: FlagPillProps) {
  const flag = LANGUAGES.find(l => l.code === lang)?.flag || "\u{1F1EB}\u{1F1F7}";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.flagPill,
        {
          backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
          borderColor: "rgba(255,255,255,0.15)",
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <Text style={styles.flagPillText}>{flag}</Text>
      <Feather name="chevron-down" size={12} color="rgba(255,255,255,0.5)" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(20,16,40,0.95)",
    borderRadius: 20,
    padding: 24,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.12)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    marginTop: 4,
  },
  closeButton: {
    padding: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    width: "48%",
    minWidth: 140,
  },
  flag: {
    fontSize: 20,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  flagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 0.5,
  },
  flagPillText: {
    fontSize: 18,
  },
});
