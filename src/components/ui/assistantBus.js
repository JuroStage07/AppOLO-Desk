/**
 * Tiny event bus to open/close the global <AssistantModal/> from anywhere.
 */
export const OPEN_ASSISTANT_EVENT = "appolo:open-assistant";

export function openAssistantModal() {
  window.dispatchEvent(new Event(OPEN_ASSISTANT_EVENT));
}
