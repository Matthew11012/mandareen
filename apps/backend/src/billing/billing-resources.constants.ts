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
} as const;

/**
 * Type for billing resource keys.
 */
export type BillingResource =
  (typeof BILLING_RESOURCES)[keyof typeof BILLING_RESOURCES];
