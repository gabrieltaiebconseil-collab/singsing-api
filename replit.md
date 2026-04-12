# Sing Sing App

## Overview

Sing Sing is a mobile application built as a pnpm workspace monorepo using TypeScript, designed for sharing song clips. Its primary purpose is to enable users to search for songs, select specific lyric passages, extract corresponding audio clips, and share them across various platforms. The app aims to provide a rich user experience with synchronized lyrics, AI-powered search capabilities, and a unique sharing mechanism.

Key capabilities include:
- Song search via iTunes Search API with multiple AI-enhanced search modes (lyrics, artist, title, mood, soundtrack, event, vocal).
- Synchronized lyric display from multiple sources, including `lrclib.net` and AI generation.
- Audio clip extraction from iTunes previews or YouTube videos using FFmpeg.
- Sharing of generated clips via Web Share API, WhatsApp, iMessage, Telegram, and Instagram.
- A viral share page for hosted clips with Apple Music Late Night design.
- AI-powered song identification and reply suggestions.
- A "Clash" mode for AI-judged song battles.
- A native keyboard extension for integrated sharing.

The project seeks to revolutionize how users share and interact with music, offering a personalized and engaging experience for musical expression and communication.

## User Preferences

I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the `artifacts/mobile/` folder.
Do not make changes to the `artifacts/api-server/` folder.
Do not make changes to the `keyboard-extension/` folder.
Do not make changes to the `lib/` folder.
Do not make changes to the `pnpm-workspace.yaml` file.
Do not make changes to the `replit.nix` file.
Do not make changes to the `.replit` file.
Do not make changes to the `package.json` file.
Do not make changes to the `pnpm-lock.yaml` file.
Do not make changes to the `tsconfig.json` file.
I like functional programming paradigms where appropriate.
I prefer a clear and concise communication style.

## System Architecture

The project is structured as a pnpm monorepo with separate packages for mobile frontend (`artifacts/mobile/`) and API backend (`artifacts/api-server/`).

### UI/UX Decisions
The application's design adheres to an "Apple Music Late Night Mode" aesthetic, featuring a dark, rich gradient background, glassmorphism for container overlays, and subtle specular highlights.
- **Color Scheme**: Predominantly dark tones with an accent color of `#C2185B` (deep rose) and supporting purple/navy hues.
- **Typography**: Georgia serif bold for app name and lyrics, Inter (system) for UI labels.
- **Global Design**: Border radius of 20px, dark mode only.
- **Dynamic Elements**: Ambient orbs (purple, rose, navy) with breathing animations, and a dynamic orb that extracts color from album art.
- **Animations**: Various micro-animations for logos, search bars, song cards, waveforms, word taps, and button shimmers to enhance user engagement.
- **Waveform**: Interactive glass container waveform with inactive bars in `rgba(255,255,255,0.2)` and selected bars in `#FFFFFF` with a glow.

### Technical Implementations
- **Monorepo**: pnpm workspaces for managing multiple packages.
- **Node.js**: Version 24.
- **TypeScript**: Version 5.9.
- **Frontend**: Expo (React Native) for mobile development.
- **Backend**: Express 5 for API server development.
- **Database**: PostgreSQL with Drizzle ORM (primarily for development, though the current API server is largely stateless with in-memory caching).
- **Validation**: Zod (`zod/v4`) and `drizzle-zod`.
- **API Codegen**: Orval, generated from OpenAPI specification.
- **Build Tool**: esbuild for CJS bundling.
- **Audio Processing**: FFmpeg for extracting and encoding audio clips to .m4a/AAC for cross-platform compatibility, especially with WhatsApp.
- **YouTube Integration**: `yt-dlp` for downloading full audio from YouTube, complementing iTunes previews.
- **AI Integration**: Anthropic (Claude Haiku) is used for various AI functionalities including:
    - Interpreting user intent for search queries.
    - Generating optimized iTunes search terms.
    - Lyrics generation fallback.
    - AI song identification (`/api/songs/identify`).
    - AI-powered song reply suggestions (`/api/songs/reply-suggestions`).
    - AI clash judging (`/api/songs/clash-verdict`).
- **Chorus Detection**: Automatic chorus detection from LRC synchronized lyrics, identifying repeated phrases and scoring them.
- **Lyrics Fallback Chain**: A robust system ensuring lyrics availability across `synced`, `plain`, `ai_available`, and `waveform_only` tiers.
- **Search Agent**: An AI search agent uses Claude Haiku to interpret user queries for various search modes, merging and ranking results from multiple sources.
- **Native Keyboard Extension**: Boilerplate for iOS (Swift, UIKit) and Android (Kotlin, InputMethodService) keyboard extensions to integrate app features directly into the native keyboard.

### Feature Specifications
- **Language Preference**: Global language selector (fr, en, es, it, tr, ar, pt, de, mix) persisted via AsyncStorage. Used as DEFAULT for vague queries (mood, events); never filters specific artist/song searches. AI detects intent language from query (e.g., "Despacito" → Spanish store, "Shakira" → Spanish) and only falls back to user preference when query is vague. "Voir aussi en" pills below results allow one-time language override without changing global preference. Onboarding modal with subtitle "Tu peux toujours chercher dans n'importe quelle langue". Flag pill in header for quick access.
- **Song Search**: Supports various modes like "Paroles", "Artiste", "Titre", "Humeur", "Soundtrack", "Événement", "Vocal", and "Album".
- **TappableLyrics**: Simple word-by-word tap selection. ALL words displayed in white, ALL tappable. 1st tap = start (white bg, black text), 2nd tap = end (red #E8183A bg). Words between highlighted. No preview markers or restrictions — clip timestamp mapping handled silently on backend. Chorus auto-selected on load when detected.
- **Lyrics Display**: Adaptable editor based on lyrics source, with features like auto-scroll to preview window and out-of-preview tap warnings.
- **Audio Clip Creation**: Clips can be generated from iTunes previews (30s) or any part of a YouTube song (up to 30s).
- **Sharing**: Integrates with Web Share API and provides platform-specific instructions for sharing. Clips can be hosted temporarily for viral sharing.
- **AI Song Identification**: Utilizes `CLASSICS_DB` for instant lookup of 228 curated songs, falling back to Claude Haiku for broader identification. Genius API search runs in parallel for "paroles" mode — identifies songs by lyrics snippets (e.g., "attaché finira comme sushi" → Maes Akatsuki). Results merged with iTunes/YouTube fallback.
- **Clash Mode**: Two-player song battles with AI verdict, jury voting, and a Hall of Fame.
- **Quick Clip Mode**: A streamlined search and editor for fast clipping.

## External Dependencies

- **iTunes Search API**: For song search functionality.
- **lrclib.net**: Primary source for synchronized lyrics.
- **Genius API**: Used to confirm song existence, acting as a fallback for lyrics.
- **Anthropic (Claude AI)**: Used for AI-powered features such as search intent interpretation, lyrics generation, song identification, reply suggestions, and clash judging.
- **FFmpeg**: External audio processing tool for clipping and encoding audio.
- **yt-dlp**: Command-line program to download videos from YouTube and other sites, used for full song audio extraction.
- **PostgreSQL**: Relational database for development.
- **Drizzle ORM**: TypeScript ORM for interacting with PostgreSQL.
- **Zod**: Schema declaration and validation library.
- **Orval**: OpenAPI to TypeScript client generator.
- **Web Speech API**: For vocal search mode transcription.
- **Web Share API**: For sharing generated audio clips on mobile devices.
- **AsyncStorage**: For storing recent clips locally on mobile.