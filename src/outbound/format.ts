/**
 * Text formatting utilities for the MAX Bot API.
 * MAX supports two message formats: "markdown" and "html".
 */

/**
 * Escape special Markdown characters in a plain-text string so it can be
 * safely embedded in a MAX Markdown message.
 */
export function escapeMaxMarkdown(text: string): string {
  // Escape characters that have special meaning in MAX Markdown
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

/**
 * Escape HTML entities for use in a MAX html-formatted message.
 */
export function escapeMaxHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
