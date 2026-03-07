import { DmPolicySchema, GroupPolicySchema, requireOpenAllowFrom } from "openclaw/plugin-sdk";
import { z } from "zod";

const MAX_COMMANDS_LIMIT = 32;

const MaxGroupConfigSchema = z
  .object({
    requireMention: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    systemPrompt: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const MaxBotCommandSchema = z
  .object({
    name: z.string(),
    description: z.string(),
  })
  .strict();

const MaxAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    botToken: z.string().optional(),
    apiBaseUrl: z.string().url().optional(),
    mode: z.enum(["polling", "webhook"]).optional(),
    webhookUrl: z.string().url().optional(),
    webhookSecret: z.string().optional(),
    webhookPath: z.string().optional(),
    webhookHost: z.string().optional(),
    webhookPort: z.number().int().positive().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groups: z.record(z.string(), MaxGroupConfigSchema).optional(),
    textChunkLimit: z.number().int().positive().optional(),
    format: z.enum(["markdown", "html"]).optional(),
    streaming: z.enum(["off", "partial"]).optional(),
    notify: z.boolean().optional(),
    mediaMaxMb: z.number().int().positive().optional(),
    actions: z
      .object({
        sendMessage: z.boolean().optional(),
        editMessage: z.boolean().optional(),
        deleteMessage: z.boolean().optional(),
      })
      .optional(),
    commands: z.array(MaxBotCommandSchema).max(MAX_COMMANDS_LIMIT).optional(),
  })
  .strict();

export const MaxAccountSchema = MaxAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.max.dmPolicy="open" requires channels.max.allowFrom to include "*"',
  });
});

export const MaxConfigSchema = MaxAccountSchemaBase.extend({
  accounts: z.record(z.string(), MaxAccountSchema.optional()).optional(),
  defaultAccount: z.string().optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.max.dmPolicy="open" requires channels.max.allowFrom to include "*"',
  });
});
