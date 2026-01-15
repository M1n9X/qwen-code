/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider authentication storage module.
 * Follows opencode's pattern for storing provider credentials.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';

/**
 * OAuth authentication info
 */
export interface OAuthInfo {
  type: 'oauth';
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
}

/**
 * API key authentication info
 */
export interface ApiInfo {
  type: 'api';
  key: string;
}

/**
 * Well-known authentication info (for some enterprise setups)
 */
export interface WellKnownInfo {
  type: 'wellknown';
  key: string;
  token: string;
}

/**
 * Union type for all supported auth types
 */
export type AuthInfo = OAuthInfo | ApiInfo | WellKnownInfo;

const AUTH_FILE = 'auth.json';

/**
 * Get the path to the auth.json file
 */
function getFilePath(): string {
  return path.join(Storage.getGlobalQwenDir(), AUTH_FILE);
}

/**
 * Ensure the global qwen directory exists
 */
function ensureDirectory(): void {
  const dir = Storage.getGlobalQwenDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Type guard for AuthInfo
 */
function isValidAuthInfo(value: unknown): value is AuthInfo {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;
  const type = obj['type'];

  if (type === 'oauth') {
    return (
      typeof obj['access'] === 'string' &&
      typeof obj['refresh'] === 'string' &&
      typeof obj['expires'] === 'number'
    );
  }

  if (type === 'api') {
    return typeof obj['key'] === 'string';
  }

  if (type === 'wellknown') {
    return typeof obj['key'] === 'string' && typeof obj['token'] === 'string';
  }

  return false;
}

/**
 * Read all auth entries from auth.json
 */
export async function getAllAuth(): Promise<Record<string, AuthInfo>> {
  try {
    const filepath = getFilePath();
    if (!fs.existsSync(filepath)) {
      return {};
    }
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;

    // Validate and filter valid entries
    const result: Record<string, AuthInfo> = {};
    for (const [key, value] of Object.entries(data)) {
      if (isValidAuthInfo(value)) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Get auth info for a specific provider
 */
export async function getAuth(
  providerId: string,
): Promise<AuthInfo | undefined> {
  const data = await getAllAuth();
  return data[providerId];
}

/**
 * Set auth info for a provider
 */
export async function setAuth(
  providerId: string,
  info: AuthInfo,
): Promise<void> {
  ensureDirectory();
  const filepath = getFilePath();
  const data = await getAllAuth();
  data[providerId] = info;
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  // Set file permissions to 600 (owner read/write only) for security
  fs.chmodSync(filepath, 0o600);
}

/**
 * Remove auth info for a provider
 */
export async function removeAuth(providerId: string): Promise<void> {
  ensureDirectory();
  const filepath = getFilePath();
  const data = await getAllAuth();
  delete data[providerId];
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  fs.chmodSync(filepath, 0o600);
}

/**
 * Check if a provider is connected (has valid auth)
 */
export async function isProviderConnected(
  providerId: string,
): Promise<boolean> {
  const info = await getAuth(providerId);
  if (!info) return false;

  // For OAuth, check if not expired
  if (info.type === 'oauth') {
    return info.expires > Date.now();
  }

  // For API key and wellknown, just check existence
  return true;
}

/**
 * Get list of connected provider IDs
 */
export async function getConnectedProviders(): Promise<string[]> {
  const data = await getAllAuth();
  const connected: string[] = [];

  for (const [providerId, info] of Object.entries(data)) {
    if (info.type === 'oauth') {
      if (info.expires > Date.now()) {
        connected.push(providerId);
      }
    } else {
      connected.push(providerId);
    }
  }

  return connected;
}

/**
 * Get API key for a provider
 * Returns the key if using API auth, or access token if using OAuth
 */
export async function getProviderApiKey(
  providerId: string,
): Promise<string | undefined> {
  const info = await getAuth(providerId);
  if (!info) return undefined;

  if (info.type === 'api') {
    return info.key;
  }
  if (info.type === 'oauth') {
    return info.access;
  }
  if (info.type === 'wellknown') {
    return info.key;
  }

  return undefined;
}

/**
 * ProviderAuth object for backwards compatibility
 * Provides a namespace-like interface with all auth functions
 */
export const ProviderAuth = {
  all: getAllAuth,
  get: getAuth,
  set: setAuth,
  remove: removeAuth,
  isConnected: isProviderConnected,
  getConnected: getConnectedProviders,
  getApiKey: getProviderApiKey,
} as const;

export default ProviderAuth;
