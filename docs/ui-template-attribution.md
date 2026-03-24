# UI Template Attribution

This redesign integrates a ready open-source Discord-like layout scaffold from:

- Source: **Valkyrie**
- Repository: `https://github.com/sentrionic/Valkyrie`
- License: MIT

Integrated scaffold in Catwa:
- `apps/desktop/src/components/workspace/templates/ValkyrieDiscordTemplate.tsx`
- Adaptation scope:
  - 4-column Discord-style shell (rail, sidebar, main chat, member panel)
  - Catwa slot wiring (`topBar`, `rail`, `sidebar`, `main`, `rightSidebar`)
  - Catwa routing, realtime, and existing workspace logic preserved

The old custom scaffold was removed and replaced in `AppShell`.
