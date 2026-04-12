import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export function InstallBanner() {
  const colors = useColors();
  const [showBanner, setShowBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const dismissed = localStorage.getItem("singsing_install_dismissed");
    if (dismissed) return;

    const isStandalone =
      (window as any).matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as any).standalone;

    if (isStandalone) return;

    const ua = navigator.userAgent || "";
    const iosDevice = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iosDevice);

    if (iosDevice) {
      setShowBanner(true);
      return;
    }

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("singsing_install_dismissed", "1");
    }
  }, []);

  if (!showBanner) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
          <Feather name="download" size={18} color={colors.primary} />
        </View>
        <View style={styles.textContent}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {"Ajouter \u00E0 l'\u00E9cran d'accueil"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {isIOS
              ? "Appuyez sur \uD83D\uDCE4 puis \u00ABSur l'\u00E9cran d'accueil\u00BB"
              : "Installez Sing Sing pour un acc\u00E8s rapide"}
          </Text>
        </View>
        <Pressable onPress={handleDismiss} style={styles.dismissButton}>
          <Feather name="x" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {!isIOS && deferredPrompt && (
        <Pressable
          onPress={handleInstall}
          style={({ pressed }) => [
            styles.installButton,
            {
              backgroundColor: colors.primary,
              borderRadius: colors.radius,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Text style={[styles.installText, { color: colors.primaryForeground }]}>
            {"Installer"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderWidth: 1,
    gap: 10,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textContent: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  dismissButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  installButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 36,
  },
  installText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
