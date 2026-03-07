import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId, normalizeOptionalAccountId } from "openclaw/plugin-sdk/account-id";
import type { MaxAccountConfig, ResolvedMaxAccount } from "../types.js";

export type { ResolvedMaxAccount } from "../types.js";
import { normalizeMaxApiBase } from "./client.js";

const DEFAULT_MAX_API_BASE = "https://api.max.ru";

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = (cfg.channels as Record<string, unknown>)?.max as MaxAccountConfig | undefined;
  const accts = accounts?.accounts;
  if (!accts || typeof accts !== "object") {
    return [];
  }
  return Object.keys(accts).filter(Boolean);
}

export function listMaxAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultMaxAccountId(cfg: OpenClawConfig): string {
  const maxCfg = getMaxChannelConfig(cfg);
  const preferred = normalizeOptionalAccountId(maxCfg?.defaultAccount);
  if (
    preferred &&
    listMaxAccountIds(cfg).some((id) => normalizeAccountId(id) === preferred)
  ) {
    return preferred;
  }
  const ids = listMaxAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function getMaxChannelConfig(cfg: OpenClawConfig): MaxAccountConfig | undefined {
  return (cfg.channels as Record<string, unknown>)?.max as MaxAccountConfig | undefined;
}

function mergeMaxAccountConfig(cfg: OpenClawConfig, accountId: string): MaxAccountConfig {
  const base = getMaxChannelConfig(cfg) ?? {};
  const { accounts: _a, defaultAccount: _d, ...baseRest } = base as MaxAccountConfig & {
    accounts?: unknown;
    defaultAccount?: unknown;
  };
  const accounts = base.accounts ?? {};
  const accountCfg = (accounts[accountId] ?? {}) as MaxAccountConfig;
  return { ...baseRest, ...accountCfg };
}

export function resolveMaxAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedMaxAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseCfg = getMaxChannelConfig(params.cfg);
  const baseEnabled = (baseCfg?.enabled) !== false;
  const merged = mergeMaxAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
  const envToken = allowEnv ? process.env.MAX_BOT_TOKEN?.trim() : undefined;
  const configToken = merged.botToken?.trim();
  const botToken = configToken || envToken;
  const botTokenSource = configToken ? "config" : envToken ? "env" : "none";

  const apiBaseUrl = normalizeMaxApiBase(merged.apiBaseUrl) || DEFAULT_MAX_API_BASE;

  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    botToken,
    botTokenSource,
    apiBaseUrl,
    config: merged,
  };
}

export function listEnabledMaxAccounts(cfg: OpenClawConfig): ResolvedMaxAccount[] {
  return listMaxAccountIds(cfg)
    .map((accountId) => resolveMaxAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
