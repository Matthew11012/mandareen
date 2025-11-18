/**
 * Billing resource constants.
 * These match the resource keys used in the PlanLimit table.
 */
export const BILLING_RESOURCES = {
  CONVO_MESSAGE_TEXT: 'convo_message_text',
  CONVO_MESSAGE_AUDIO: 'convo_message_audio',
  CONVO_TTS_SECONDS: 'convo_tts_seconds',
  LESSON_CUSTOM_GENERATED: 'lesson_custom_generated',
  CURRICULUM_GENERATED: 'curriculum_generated',
  ASSESSMENT_TAKEN: 'assessment_taken',
  CONVO_STREAM: 'convo_stream',
  COMMUNITY_LESSON_FULL_VIEW: 'community_lesson_full_view',
  CURRICULUM_UNIT_FULL_ACCESS: 'curriculum_unit_full_access',
  CONVO_MANUAL_NOTES: 'convo_manual_notes',
} as const;

/**
 * Type for billing resource keys.
 */
export type BillingResource =
  (typeof BILLING_RESOURCES)[keyof typeof BILLING_RESOURCES];
