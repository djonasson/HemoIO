/**
 * An AI service's error text with the API key taken out. Some services
 * repeat the key they were sent in their error message, and that message is
 * shown to the user and may be copied into a bug report.
 */
export function withoutKey(message: string, apiKey: string): string {
  return apiKey ? message.split(apiKey).join('[API key]') : message;
}
