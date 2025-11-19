/**
 * Resource name to human-readable label mapping.
 * Used for displaying usage data in the UI.
 */
export const RESOURCE_LABELS: Record<string, string> = {
  convo_tts_seconds: "TTS minutes",
  lesson_custom_generated: "Custom lessons",
  curriculum_generated: "Curriculum generations",
  assessment_taken: "Assessments",
  convo_stream: "Concurrent conversation streams",
  community_lesson_full_view: "Community full lesson views",
  curriculum_unit_full_access: "Full curriculum units unlocked",
  convo_manual_notes: "Note generations",
} as const;

/**
 * Resource display order for the usage page.
 * Resources are displayed in this order on the usage page.
 */
export const RESOURCE_ORDER: string[] = [
  "convo_tts_seconds",
  "lesson_custom_generated",
  "curriculum_generated",
  "assessment_taken",
  "community_lesson_full_view",
  "curriculum_unit_full_access",
  "convo_manual_notes",
  "convo_stream",
];

/**
 * Get human-readable label for a resource.
 * @param resource Resource name (e.g., "convo_message_text")
 * @returns Human-readable label (e.g., "Conversation messages")
 */
export function getResourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] || resource;
}

/**
 * Check if a resource should be displayed on the usage page.
 * Some resources (like convo_stream with cap 0) may be hidden.
 * @param resource Resource name
 * @param cap Resource cap
 * @returns True if resource should be displayed
 */
export function shouldDisplayResource(resource: string, cap: number): boolean {
  if (resource === "convo_message_text" || resource === "convo_message_audio") {
    return false;
  }
  // Hide resources with cap 0 (unlimited or not applicable)
  if (cap === 0) {
    return false;
  }
  return true;
}

/**
 * Transform resource usage data for display.
 * Handles special cases like converting TTS seconds to minutes.
 * @param resource Resource name
 * @param used Amount used
 * @param cap Resource cap
 * @returns Transformed usage data
 */
export function transformResourceUsage(
  resource: string,
  used: number,
  cap: number
): { used: number; cap: number; label: string } {
  let transformedUsed = used;
  let transformedCap = cap;
  let label = getResourceLabel(resource);

  // Convert TTS seconds to minutes for display
  if (resource === "convo_tts_seconds") {
    transformedUsed = Math.round(used / 60);
    transformedCap = Math.round(cap / 60);
    label = "TTS minutes";
  }

  return {
    used: transformedUsed,
    cap: transformedCap,
    label,
  };
}
