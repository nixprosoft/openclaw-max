import type { MaxInlineKeyboard, MaxInlineKeyboardButton } from "../max/client.js";

export type ButtonSpec = {
  text: string;
  /** Callback payload — required for callback buttons. */
  payload?: string;
  /** URL — when present, creates a "link" button instead of a callback button. */
  url?: string;
  intent?: "positive" | "negative" | "default";
};

/**
 * Build a MAX inline_keyboard attachment from a 2-D array of ButtonSpec.
 * Each inner array represents one row of buttons.
 */
export function buildMaxInlineKeyboard(rows: ButtonSpec[][]): MaxInlineKeyboard {
  const buttons: MaxInlineKeyboardButton[][] = rows.map((row) =>
    row.map((spec): MaxInlineKeyboardButton => {
      if (spec.url) {
        return {
          type: "link",
          text: spec.text,
          url: spec.url,
          ...(spec.intent ? { intent: spec.intent } : {}),
        };
      }
      return {
        type: "callback",
        text: spec.text,
        payload: spec.payload ?? spec.text,
        ...(spec.intent ? { intent: spec.intent } : {}),
      };
    }),
  );

  return {
    type: "inline_keyboard",
    payload: { buttons },
  };
}
