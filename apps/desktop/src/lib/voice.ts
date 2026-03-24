import type { VoiceMember } from "../types/chat";

export function formatVoiceParticipantState(participant: Pick<VoiceMember, "speaking" | "muted" | "deafened">): string {
  if (participant.speaking) {
    return "Konuşuyor";
  }

  if (participant.deafened) {
    return "Ses kapalı";
  }

  if (participant.muted) {
    return "Mikrofon kapalı";
  }

  return "Bağlı";
}
