/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents the storage level for a skill configuration.
 * - 'project': Stored in `.qwen/skills/` within the project directory
 * - 'user': Stored in `~/.qwen/skills/` in the user's home directory
 */
export type SkillLevel = 'project' | 'user';

/**
 * Validation constants for skills (agentskills.io spec).
 */
export const SkillValidation = {
  /** Maximum length for skill name */
  MaxNameLength: 64,
  /** Maximum length for skill description */
  MaxDescriptionLength: 500,
  /** Maximum length for skill body/instructions */
  MaxBodyLength: 50000,
  /** Maximum length for compatibility field */
  MaxCompatibilityLength: 500,
  /** Pattern for valid skill names (lowercase, alphanumeric, underscores, hyphens) */
  NamePattern: /^[a-z][a-z0-9_-]*$/,
  /** Alternative pattern for agentskills.io spec (alphanumeric with hyphens) */
  AgentSkillsNamePattern: /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/,
  /** Skill manifest file name */
  SkillFileName: 'SKILL.md',
} as const;

/**
 * Represents a validation error for a specific field.
 */
export interface SkillValidationError {
  /** The field that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
  /** The invalid value (if applicable) */
  value?: unknown;
}

/**
 * Validates a skill configuration and returns detailed errors.
 *
 * @param skill - Partial skill configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateSkill(
  skill: Partial<SkillConfig>,
): SkillValidationError[] {
  const errors: SkillValidationError[] = [];

  // Validate name
  if (skill.name === undefined || skill.name === null) {
    errors.push({
      field: 'name',
      message: 'Name is required',
    });
  } else if (typeof skill.name !== 'string') {
    errors.push({
      field: 'name',
      message: 'Name must be a string',
      value: skill.name,
    });
  } else if (skill.name.trim() === '') {
    errors.push({
      field: 'name',
      message: 'Name cannot be empty',
      value: skill.name,
    });
  } else {
    // Check name length
    if (skill.name.length > SkillValidation.MaxNameLength) {
      errors.push({
        field: 'name',
        message: `Name exceeds maximum length of ${SkillValidation.MaxNameLength} characters (got ${skill.name.length})`,
        value: skill.name,
      });
    }
    // Check name pattern
    if (!SkillValidation.NamePattern.test(skill.name)) {
      errors.push({
        field: 'name',
        message:
          'Name must start with a lowercase letter and contain only lowercase alphanumeric characters, underscores, and hyphens',
        value: skill.name,
      });
    }
  }

  // Validate description
  if (skill.description === undefined || skill.description === null) {
    errors.push({
      field: 'description',
      message: 'Description is required',
    });
  } else if (typeof skill.description !== 'string') {
    errors.push({
      field: 'description',
      message: 'Description must be a string',
      value: skill.description,
    });
  } else if (skill.description.trim() === '') {
    errors.push({
      field: 'description',
      message: 'Description cannot be empty',
      value: skill.description,
    });
  } else if (skill.description.length > SkillValidation.MaxDescriptionLength) {
    errors.push({
      field: 'description',
      message: `Description exceeds maximum length of ${SkillValidation.MaxDescriptionLength} characters (got ${skill.description.length})`,
      value: skill.description,
    });
  }

  // Validate body length (if present)
  if (skill.body !== undefined && skill.body !== null) {
    if (typeof skill.body !== 'string') {
      errors.push({
        field: 'body',
        message: 'Body must be a string',
        value: skill.body,
      });
    } else if (skill.body.length > SkillValidation.MaxBodyLength) {
      errors.push({
        field: 'body',
        message: `Body exceeds maximum length of ${SkillValidation.MaxBodyLength} characters (got ${skill.body.length})`,
        value: `[${skill.body.length} characters]`,
      });
    }
  }

  // Validate compatibility (if present)
  if (skill.compatibility !== undefined && skill.compatibility !== null) {
    const compatStr = JSON.stringify(skill.compatibility);
    if (compatStr.length > SkillValidation.MaxCompatibilityLength) {
      errors.push({
        field: 'compatibility',
        message: `Compatibility exceeds maximum length of ${SkillValidation.MaxCompatibilityLength} characters (got ${compatStr.length})`,
        value: skill.compatibility,
      });
    }
  }

  // Validate allowedTools (if present)
  if (skill.allowedTools !== undefined && skill.allowedTools !== null) {
    if (!Array.isArray(skill.allowedTools)) {
      errors.push({
        field: 'allowedTools',
        message: 'allowedTools must be an array',
        value: skill.allowedTools,
      });
    } else {
      for (let i = 0; i < skill.allowedTools.length; i++) {
        if (typeof skill.allowedTools[i] !== 'string') {
          errors.push({
            field: `allowedTools[${i}]`,
            message: 'Each tool in allowedTools must be a string',
            value: skill.allowedTools[i],
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Checks if a skill configuration is valid.
 *
 * @param skill - Partial skill configuration to validate
 * @returns true if valid, false otherwise
 */
export function isValidSkill(skill: Partial<SkillConfig>): boolean {
  return validateSkill(skill).length === 0;
}

/**
 * Compatibility information for a skill.
 */
export interface SkillCompatibility {
  /** Minimum version required (semver) */
  minVersion?: string;
  /** Maximum version supported (semver) */
  maxVersion?: string;
  /** Supported platforms (e.g., 'linux', 'darwin', 'win32') */
  platforms?: string[];
}

/**
 * Core configuration for a skill as stored in SKILL.md files.
 * Each skill directory contains a SKILL.md file with YAML frontmatter
 * containing metadata, followed by markdown content describing the skill.
 */
export interface SkillConfig {
  /** Unique name identifier for the skill */
  name: string;

  /** Human-readable description of what this skill provides */
  description: string;

  /**
   * Optional list of tool names that this skill is allowed to use.
   * For v1, this is informational only (no gating).
   */
  allowedTools?: string[];

  /**
   * Storage level - determines where the configuration file is stored
   */
  level: SkillLevel;

  /**
   * Absolute path to the skill directory containing SKILL.md
   */
  filePath: string;

  /**
   * The markdown body content from SKILL.md (after the frontmatter)
   */
  body: string;

  /**
   * SPDX license identifier (agentskills.io spec).
   * Example: 'MIT', 'Apache-2.0', 'UNLICENSED'
   */
  license?: string;

  /**
   * Version compatibility information (agentskills.io spec).
   */
  compatibility?: SkillCompatibility;

  /**
   * Additional metadata for the skill (agentskills.io spec).
   * Can contain arbitrary key-value pairs for extensibility.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime configuration for a skill when it's being actively used.
 * Extends SkillConfig with additional runtime-specific fields.
 */
export type SkillRuntimeConfig = SkillConfig;

/**
 * Result of a validation operation on a skill configuration.
 */
export interface SkillValidationResult {
  /** Whether the configuration is valid */
  isValid: boolean;

  /** Array of error messages if validation failed */
  errors: string[];

  /** Array of warning messages (non-blocking issues) */
  warnings: string[];
}

/**
 * Options for listing skills.
 */
export interface ListSkillsOptions {
  /** Filter by storage level */
  level?: SkillLevel;

  /** Force refresh from disk, bypassing cache. Defaults to false. */
  force?: boolean;
}

/**
 * Error thrown when a skill operation fails.
 */
export class SkillError extends Error {
  constructor(
    message: string,
    readonly code: SkillErrorCode,
    readonly skillName?: string,
  ) {
    super(message);
    this.name = 'SkillError';
  }
}

/**
 * Error codes for skill operations.
 */
export const SkillErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID_CONFIG: 'INVALID_CONFIG',
  INVALID_NAME: 'INVALID_NAME',
  FILE_ERROR: 'FILE_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
} as const;

export type SkillErrorCode =
  (typeof SkillErrorCode)[keyof typeof SkillErrorCode];
