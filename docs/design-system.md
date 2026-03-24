# Catwa Design System

Bu doküman Catwa arayüzündeki premium dark tasarım sistemini özetler.

## 1) Tema ve Renk Paleti

Tüm ana tokenlar `apps/desktop/src/styles/index.css` içinde tutulur:

- Arka plan: `--catwa-bg-0..3`
- Panel yüzeyleri: `--catwa-panel`, `--catwa-panel-alt`
- Kenarlık: `--catwa-border`, `--catwa-border-soft`, `--catwa-border-strong`
- Metin: `--catwa-text-main`, `--catwa-text-muted`, `--catwa-text-soft`
- Vurgu: `--catwa-accent`, `--catwa-accent-soft`, `--catwa-accent-strong`, `--catwa-accent-ring`
- Durum: `--catwa-success`, `--catwa-danger`

## 2) Boyut ve Tipografi Ölçeği

- Spacing: `--catwa-space-xs` → `--catwa-space-2xl`
- Radius: `--catwa-radius-sm` → `--catwa-radius-2xl`
- Chat metin ölçeği: `--catwa-chat-font-size`, `--catwa-message-gap`
- Font stack: `Sora, Manrope, IBM Plex Sans, Noto Sans, Segoe UI, sans-serif`

## 3) Gölge ve Hareket

- Yumuşak gölge: `--catwa-shadow-soft`
- Katman gölgesi: `--catwa-shadow-layer`
- Accent glow: `--catwa-shadow-glow`
- Geçiş eğrisi: `--catwa-ease`
- Süreler: `--catwa-duration-fast`, `--catwa-duration-mid`

## 4) Tailwind Extension

`apps/desktop/tailwind.config.ts` içinde:

- `colors.catwa.*`
- ek spacing/radius değerleri
- `boxShadow.catwa-*`
- `fontFamily.sans` (Catwa stack)
- `transitionTimingFunction.catwa`

## 5) Reusable Primitives

`apps/desktop/src/components/ui/CatwaPrimitives.tsx` içinde:

- `CatwaButton` (`primary`, `ghost`, `danger`)
- `CatwaInput`
- `CatwaCard`
- `CatwaBadge`
- `CatwaAvatar`
- `CatwaTabs`

Bu primitive'ler yeni ekranlar veya modal eklemelerinde tek tip görsel dil sağlar.

## 6) Uygulanan Ana Alanlar

- Ana shell: `apps/desktop/src/components/workspace/AppShell.tsx`
- Header: `apps/desktop/src/components/workspace/ChatHeader.tsx`
- Server rail: `apps/desktop/src/components/workspace/ServerRail.tsx`
- Sol panel: `apps/desktop/src/components/workspace/ConversationSidebar.tsx`
- Composer: `apps/desktop/src/components/workspace/MessageComposer.tsx`
- Sağ panel: `apps/desktop/src/components/workspace/RightSidebar.tsx`
- Auth kartı: `apps/desktop/src/components/AuthPanel.tsx`
- Tam profil modalı: `apps/desktop/src/components/workspace/FriendProfileModal.tsx`
