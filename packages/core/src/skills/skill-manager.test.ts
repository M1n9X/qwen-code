/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SkillManager } from './skill-manager.js';
import {
  type SkillConfig,
  SkillError,
  SkillValidation,
  validateSkill,
  isValidSkill,
} from './types.js';
import type { Config } from '../config/config.js';
import { makeFakeConfig } from '../test-utils/config.js';

// Mock file system operations
vi.mock('fs/promises');
vi.mock('os');

// Mock yaml parser - use vi.hoisted for proper hoisting
const mockParseYaml = vi.hoisted(() => vi.fn());

vi.mock('../utils/yaml-parser.js', () => ({
  parse: mockParseYaml,
  stringify: vi.fn(),
}));

describe('SkillManager', () => {
  let manager: SkillManager;
  let mockConfig: Config;

  beforeEach(() => {
    // Create mock Config object using test utility
    mockConfig = makeFakeConfig({});

    // Mock the project root method
    vi.spyOn(mockConfig, 'getProjectRoot').mockReturnValue('/test/project');

    // Mock os.homedir
    vi.mocked(os.homedir).mockReturnValue('/home/user');

    // Reset and setup mocks
    vi.clearAllMocks();

    // Setup yaml parser mocks with sophisticated behavior
    mockParseYaml.mockImplementation((yamlString: string) => {
      // Handle different test cases based on YAML content
      if (yamlString.includes('allowedTools:')) {
        return {
          name: 'test-skill',
          description: 'A test skill',
          allowedTools: ['read_file', 'write_file'],
        };
      }
      if (yamlString.includes('name: skill1')) {
        return { name: 'skill1', description: 'First skill' };
      }
      if (yamlString.includes('name: skill2')) {
        return { name: 'skill2', description: 'Second skill' };
      }
      if (yamlString.includes('name: skill3')) {
        return { name: 'skill3', description: 'Third skill' };
      }
      if (!yamlString.includes('name:')) {
        return { description: 'A test skill' }; // Missing name case
      }
      if (!yamlString.includes('description:')) {
        return { name: 'test-skill' }; // Missing description case
      }
      // Default case
      return {
        name: 'test-skill',
        description: 'A test skill',
      };
    });

    manager = new SkillManager(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validSkillConfig: SkillConfig = {
    name: 'test-skill',
    description: 'A test skill',
    level: 'project',
    filePath: '/test/project/.qwen/skills/test-skill/SKILL.md',
    body: 'You are a helpful assistant with this skill.',
  };

  const validMarkdown = `---
name: test-skill
description: A test skill
---

You are a helpful assistant with this skill.
`;

  describe('parseSkillContent', () => {
    it('should parse valid markdown content', () => {
      const config = manager.parseSkillContent(
        validMarkdown,
        validSkillConfig.filePath,
        'project',
      );

      expect(config.name).toBe('test-skill');
      expect(config.description).toBe('A test skill');
      expect(config.body).toBe('You are a helpful assistant with this skill.');
      expect(config.level).toBe('project');
      expect(config.filePath).toBe(validSkillConfig.filePath);
    });

    it('should parse content with allowedTools', () => {
      const markdownWithTools = `---
name: test-skill
description: A test skill
allowedTools:
  - read_file
  - write_file
---

You are a helpful assistant with this skill.
`;

      const config = manager.parseSkillContent(
        markdownWithTools,
        validSkillConfig.filePath,
        'project',
      );

      expect(config.allowedTools).toEqual(['read_file', 'write_file']);
    });

    it('should determine level from file path', () => {
      const projectPath = '/test/project/.qwen/skills/test-skill/SKILL.md';
      const userPath = '/home/user/.qwen/skills/test-skill/SKILL.md';

      const projectConfig = manager.parseSkillContent(
        validMarkdown,
        projectPath,
        'project',
      );
      const userConfig = manager.parseSkillContent(
        validMarkdown,
        userPath,
        'user',
      );

      expect(projectConfig.level).toBe('project');
      expect(userConfig.level).toBe('user');
    });

    it('should throw error for invalid frontmatter format', () => {
      const invalidMarkdown = `No frontmatter here
Just content`;

      expect(() =>
        manager.parseSkillContent(
          invalidMarkdown,
          validSkillConfig.filePath,
          'project',
        ),
      ).toThrow(SkillError);
    });

    it('should throw error for missing name', () => {
      const markdownWithoutName = `---
description: A test skill
---

You are a helpful assistant.
`;

      expect(() =>
        manager.parseSkillContent(
          markdownWithoutName,
          validSkillConfig.filePath,
          'project',
        ),
      ).toThrow(SkillError);
    });

    it('should throw error for missing description', () => {
      const markdownWithoutDescription = `---
name: test-skill
---

You are a helpful assistant.
`;

      expect(() =>
        manager.parseSkillContent(
          markdownWithoutDescription,
          validSkillConfig.filePath,
          'project',
        ),
      ).toThrow(SkillError);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configuration', () => {
      const result = manager.validateConfig(validSkillConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report error for missing name', () => {
      const invalidConfig = { ...validSkillConfig, name: '' };
      const result = manager.validateConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('"name" cannot be empty');
    });

    it('should report error for missing description', () => {
      const invalidConfig = { ...validSkillConfig, description: '' };
      const result = manager.validateConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('"description" cannot be empty');
    });

    it('should report error for invalid allowedTools type', () => {
      const invalidConfig = {
        ...validSkillConfig,
        allowedTools: 'not-an-array' as unknown as string[],
      };
      const result = manager.validateConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('"allowedTools" must be an array');
    });

    it('should warn for empty body', () => {
      const configWithEmptyBody = { ...validSkillConfig, body: '' };
      const result = manager.validateConfig(configWithEmptyBody);

      expect(result.isValid).toBe(true); // Still valid
      expect(result.warnings).toContain('Skill body is empty');
    });
  });

  describe('loadSkill', () => {
    it('should load skill from project level first', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test-skill', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);

      const config = await manager.loadSkill('test-skill');

      expect(config).toBeDefined();
      expect(config!.name).toBe('test-skill');
    });

    it('should fall back to user level if project level fails', async () => {
      vi.mocked(fs.readdir)
        .mockRejectedValueOnce(new Error('Project dir not found')) // project level fails
        .mockResolvedValueOnce([
          { name: 'test-skill', isDirectory: () => true, isFile: () => false },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>); // user level succeeds
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);

      const config = await manager.loadSkill('test-skill');

      expect(config).toBeDefined();
      expect(config!.name).toBe('test-skill');
    });

    it('should return null if not found at either level', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

      const config = await manager.loadSkill('nonexistent');

      expect(config).toBeNull();
    });
  });

  describe('loadSkillForRuntime', () => {
    it('should load skill for runtime', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: 'test-skill', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(validMarkdown); // SKILL.md

      const config = await manager.loadSkillForRuntime('test-skill');

      expect(config).toBeDefined();
      expect(config!.name).toBe('test-skill');
    });

    it('should return null if skill not found', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

      const config = await manager.loadSkillForRuntime('nonexistent');

      expect(config).toBeNull();
    });
  });

  describe('listSkills', () => {
    beforeEach(() => {
      // Mock directory listing for skills directories (with Dirent objects)
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce([
          { name: 'skill1', isDirectory: () => true, isFile: () => false },
          { name: 'skill2', isDirectory: () => true, isFile: () => false },
          {
            name: 'not-a-dir.txt',
            isDirectory: () => false,
            isFile: () => true,
          },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
        .mockResolvedValueOnce([
          { name: 'skill3', isDirectory: () => true, isFile: () => false },
          { name: 'skill1', isDirectory: () => true, isFile: () => false },
        ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      vi.mocked(fs.access).mockResolvedValue(undefined);

      // Mock file reading for valid skills
      vi.mocked(fs.readFile).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('skill1')) {
          return Promise.resolve(`---
name: skill1
description: First skill
---
Skill 1 content`);
        } else if (pathStr.includes('skill2')) {
          return Promise.resolve(`---
name: skill2
description: Second skill
---
Skill 2 content`);
        } else if (pathStr.includes('skill3')) {
          return Promise.resolve(`---
name: skill3
description: Third skill
---
Skill 3 content`);
        }
        return Promise.reject(new Error('File not found'));
      });
    });

    it('should list skills from both levels', async () => {
      const skills = await manager.listSkills();

      expect(skills).toHaveLength(3); // skill1 (project takes precedence), skill2, skill3
      expect(skills.map((s) => s.name).sort()).toEqual([
        'skill1',
        'skill2',
        'skill3',
      ]);
    });

    it('should prioritize project level over user level', async () => {
      const skills = await manager.listSkills();
      const skill1 = skills.find((s) => s.name === 'skill1');

      expect(skill1!.level).toBe('project');
    });

    it('should filter by level', async () => {
      const projectSkills = await manager.listSkills({
        level: 'project',
      });

      expect(projectSkills).toHaveLength(2); // skill1, skill2
      expect(projectSkills.every((s) => s.level === 'project')).toBe(true);
    });

    it('should handle empty directories', async () => {
      vi.mocked(fs.readdir).mockReset();
      vi.mocked(fs.readdir).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
      );

      const skills = await manager.listSkills({ force: true });

      expect(skills).toHaveLength(0);
    });

    it('should handle directory read errors', async () => {
      vi.mocked(fs.readdir).mockReset();
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

      const skills = await manager.listSkills({ force: true });

      expect(skills).toHaveLength(0);
    });
  });

  describe('getSkillsBaseDir', () => {
    it('should return project-level base dir', () => {
      const baseDir = manager.getSkillsBaseDir('project');

      expect(baseDir).toBe(path.join('/test/project', '.qwen', 'skills'));
    });

    it('should return user-level base dir', () => {
      const baseDir = manager.getSkillsBaseDir('user');

      expect(baseDir).toBe(path.join('/home/user', '.qwen', 'skills'));
    });
  });

  describe('change listeners', () => {
    it('should notify listeners when cache is refreshed', async () => {
      const listener = vi.fn();
      manager.addChangeListener(listener);

      vi.mocked(fs.readdir).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
      );

      await manager.refreshCache();

      expect(listener).toHaveBeenCalled();
    });

    it('should remove listener when cleanup function is called', async () => {
      const listener = vi.fn();
      const removeListener = manager.addChangeListener(listener);

      removeListener();

      vi.mocked(fs.readdir).mockResolvedValue(
        [] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
      );

      await manager.refreshCache();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('parse errors', () => {
    it('should track parse errors', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'bad-skill', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(
        'invalid content without frontmatter',
      );

      await manager.listSkills({ force: true });

      const errors = manager.getParseErrors();
      expect(errors.size).toBeGreaterThan(0);
    });
  });
});

describe('validateSkill', () => {
  it('should return empty array for valid skill', () => {
    const skill: Partial<SkillConfig> = {
      name: 'valid-skill',
      description: 'A valid skill description',
      body: 'Skill instructions here',
    };

    const errors = validateSkill(skill);
    expect(errors).toHaveLength(0);
  });

  it('should return error for missing name', () => {
    const skill: Partial<SkillConfig> = {
      description: 'A skill without name',
    };

    const errors = validateSkill(skill);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('name');
    expect(errors[0].message).toBe('Name is required');
  });

  it('should return error for empty name', () => {
    const skill: Partial<SkillConfig> = {
      name: '',
      description: 'A skill with empty name',
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) => e.field === 'name' && e.message.includes('cannot be empty'),
      ),
    ).toBe(true);
  });

  it('should return error for name exceeding max length', () => {
    const skill: Partial<SkillConfig> = {
      name: 'a'.repeat(SkillValidation.MaxNameLength + 1),
      description: 'A skill with long name',
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) =>
          e.field === 'name' && e.message.includes('exceeds maximum length'),
      ),
    ).toBe(true);
  });

  it('should return error for invalid name pattern', () => {
    const skill: Partial<SkillConfig> = {
      name: 'Invalid-Name', // uppercase not allowed
      description: 'A skill with invalid name',
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) =>
          e.field === 'name' &&
          e.message.includes('must start with a lowercase'),
      ),
    ).toBe(true);
  });

  it('should return error for missing description', () => {
    const skill: Partial<SkillConfig> = {
      name: 'valid-name',
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) => e.field === 'description' && e.message.includes('required'),
      ),
    ).toBe(true);
  });

  it('should return error for description exceeding max length', () => {
    const skill: Partial<SkillConfig> = {
      name: 'valid-name',
      description: 'a'.repeat(SkillValidation.MaxDescriptionLength + 1),
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) =>
          e.field === 'description' &&
          e.message.includes('exceeds maximum length'),
      ),
    ).toBe(true);
  });

  it('should return error for body exceeding max length', () => {
    const skill: Partial<SkillConfig> = {
      name: 'valid-name',
      description: 'Valid description',
      body: 'a'.repeat(SkillValidation.MaxBodyLength + 1),
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) =>
          e.field === 'body' && e.message.includes('exceeds maximum length'),
      ),
    ).toBe(true);
  });

  it('should return error for invalid allowedTools type', () => {
    const skill: Partial<SkillConfig> = {
      name: 'valid-name',
      description: 'Valid description',
      allowedTools: 'not-an-array' as unknown as string[],
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) =>
          e.field === 'allowedTools' && e.message.includes('must be an array'),
      ),
    ).toBe(true);
  });

  it('should return error for non-string items in allowedTools', () => {
    const skill: Partial<SkillConfig> = {
      name: 'valid-name',
      description: 'Valid description',
      allowedTools: ['valid', 123 as unknown as string],
    };

    const errors = validateSkill(skill);
    expect(
      errors.some(
        (e) =>
          e.field.startsWith('allowedTools[') &&
          e.message.includes('must be a string'),
      ),
    ).toBe(true);
  });
});

describe('isValidSkill', () => {
  it('should return true for valid skill', () => {
    const skill: Partial<SkillConfig> = {
      name: 'valid-skill',
      description: 'A valid skill',
    };

    expect(isValidSkill(skill)).toBe(true);
  });

  it('should return false for invalid skill', () => {
    const skill: Partial<SkillConfig> = {
      name: '', // invalid
      description: 'A skill',
    };

    expect(isValidSkill(skill)).toBe(false);
  });
});

describe('SkillManager - toPromptXML', () => {
  let manager: SkillManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = makeFakeConfig({});
    vi.spyOn(mockConfig, 'getProjectRoot').mockReturnValue('/test/project');
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    manager = new SkillManager(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return empty skills tag for empty array', () => {
    const xml = manager.toPromptXML([]);
    expect(xml).toBe('<skills />');
  });

  it('should generate valid XML for single skill', () => {
    const skills: SkillConfig[] = [
      {
        name: 'test-skill',
        description: 'A test skill',
        level: 'project',
        filePath: '/test/SKILL.md',
        body: 'Test instructions',
      },
    ];

    const xml = manager.toPromptXML(skills);

    expect(xml).toContain('<skills>');
    expect(xml).toContain('</skills>');
    expect(xml).toContain('<skill name="test-skill">');
    expect(xml).toContain('<description>A test skill</description>');
    expect(xml).toContain('<instructions>');
    expect(xml).toContain('Test instructions');
    expect(xml).toContain('</instructions>');
  });

  it('should generate valid XML for multiple skills', () => {
    const skills: SkillConfig[] = [
      {
        name: 'skill1',
        description: 'First skill',
        level: 'project',
        filePath: '/test/skill1/SKILL.md',
        body: 'Instructions 1',
      },
      {
        name: 'skill2',
        description: 'Second skill',
        level: 'user',
        filePath: '/home/user/.qwen/skills/skill2/SKILL.md',
        body: 'Instructions 2',
      },
    ];

    const xml = manager.toPromptXML(skills);

    expect(xml).toContain('<skill name="skill1">');
    expect(xml).toContain('<skill name="skill2">');
    expect(xml).toContain('First skill');
    expect(xml).toContain('Second skill');
  });

  it('should include tools in XML when present', () => {
    const skills: SkillConfig[] = [
      {
        name: 'tool-skill',
        description: 'A skill with tools',
        level: 'project',
        filePath: '/test/SKILL.md',
        body: 'Instructions',
        allowedTools: ['read_file', 'write_file'],
      },
    ];

    const xml = manager.toPromptXML(skills);

    expect(xml).toContain('<tools>');
    expect(xml).toContain('<tool>read_file</tool>');
    expect(xml).toContain('<tool>write_file</tool>');
    expect(xml).toContain('</tools>');
  });

  it('should escape XML special characters', () => {
    const skills: SkillConfig[] = [
      {
        name: 'escape-test',
        description: 'Test <special> & "characters"',
        level: 'project',
        filePath: '/test/SKILL.md',
        body: 'Instructions with <tags> & stuff',
      },
    ];

    const xml = manager.toPromptXML(skills);

    expect(xml).toContain('&lt;special&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;characters&quot;');
  });
});

describe('SkillManager - getSkillAsXml', () => {
  let manager: SkillManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = makeFakeConfig({});
    vi.spyOn(mockConfig, 'getProjectRoot').mockReturnValue('/test/project');
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    manager = new SkillManager(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate XML for a skill without tools', () => {
    const skill: SkillConfig = {
      name: 'simple-skill',
      description: 'A simple skill',
      level: 'project',
      filePath: '/test/SKILL.md',
      body: 'Do something helpful',
    };

    const xml = manager.getSkillAsXml(skill);

    expect(xml).toContain('<skill name="simple-skill">');
    expect(xml).toContain('<description>A simple skill</description>');
    expect(xml).toContain('<instructions>');
    expect(xml).toContain('Do something helpful');
    expect(xml).not.toContain('<tools>');
  });

  it('should generate XML for a skill with tools', () => {
    const skill: SkillConfig = {
      name: 'tool-skill',
      description: 'A skill with tools',
      level: 'project',
      filePath: '/test/SKILL.md',
      body: 'Use these tools',
      allowedTools: ['tool1', 'tool2'],
    };

    const xml = manager.getSkillAsXml(skill);

    expect(xml).toContain('<tools>');
    expect(xml).toContain('<tool>tool1</tool>');
    expect(xml).toContain('<tool>tool2</tool>');
    expect(xml).toContain('</tools>');
  });

  it('should handle multi-line body content', () => {
    const skill: SkillConfig = {
      name: 'multiline-skill',
      description: 'A skill with multiline body',
      level: 'project',
      filePath: '/test/SKILL.md',
      body: 'Line 1\nLine 2\nLine 3',
    };

    const xml = manager.getSkillAsXml(skill);

    expect(xml).toContain('Line 1');
    expect(xml).toContain('Line 2');
    expect(xml).toContain('Line 3');
  });
});

describe('SkillManager - getSkill', () => {
  let manager: SkillManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = makeFakeConfig({});
    vi.spyOn(mockConfig, 'getProjectRoot').mockReturnValue('/test/project');
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.clearAllMocks();

    mockParseYaml.mockImplementation((yamlString: string) => {
      if (yamlString.includes('name: cached-skill')) {
        return { name: 'cached-skill', description: 'A cached skill' };
      }
      if (yamlString.includes('name: user-skill')) {
        return { name: 'user-skill', description: 'A user skill' };
      }
      return { name: 'test-skill', description: 'A test skill' };
    });

    manager = new SkillManager(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return undefined when cache is empty', () => {
    const skill = manager.getSkill('nonexistent');
    expect(skill).toBeUndefined();
  });

  it('should return skill from cache after refresh', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([
        { name: 'cached-skill', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockResolvedValueOnce(
        [] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
      );
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`---
name: cached-skill
description: A cached skill
---
Cached skill body`);

    await manager.refreshCache();

    const skill = manager.getSkill('cached-skill');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('cached-skill');
  });

  it('should prioritize project skills over user skills', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([
        { name: 'cached-skill', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockResolvedValueOnce([
        { name: 'cached-skill', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue(`---
name: cached-skill
description: A cached skill
---
Cached skill body`);

    await manager.refreshCache();

    const skill = manager.getSkill('cached-skill');
    expect(skill).toBeDefined();
    expect(skill!.level).toBe('project');
  });
});

describe('SkillManager - discoverSkills', () => {
  let manager: SkillManager;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = makeFakeConfig({});
    vi.spyOn(mockConfig, 'getProjectRoot').mockReturnValue('/test/project');
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    vi.clearAllMocks();

    mockParseYaml.mockImplementation((yamlString: string) => {
      if (yamlString.includes('name: discovered1')) {
        return { name: 'discovered1', description: 'First discovered skill' };
      }
      if (yamlString.includes('name: discovered2')) {
        return { name: 'discovered2', description: 'Second discovered skill' };
      }
      return { name: 'test-skill', description: 'A test skill' };
    });

    manager = new SkillManager(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should discover skills from root path', async () => {
    // Mock directory structure
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([
        { name: 'skill1', isDirectory: () => true, isFile: () => false },
        { name: 'skill2', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockResolvedValueOnce([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockResolvedValueOnce([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.readFile).mockImplementation((filePath) => {
      const pathStr = String(filePath);
      if (pathStr.includes('skill1')) {
        return Promise.resolve(`---
name: discovered1
description: First discovered skill
---
Skill 1 body`);
      }
      if (pathStr.includes('skill2')) {
        return Promise.resolve(`---
name: discovered2
description: Second discovered skill
---
Skill 2 body`);
      }
      return Promise.reject(new Error('File not found'));
    });

    const skills = await manager.discoverSkills('/test/root');

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual([
      'discovered1',
      'discovered2',
    ]);
  });

  it('should skip node_modules directories', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'skill1', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockResolvedValueOnce([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    vi.mocked(fs.readFile).mockResolvedValue(`---
name: discovered1
description: First discovered skill
---
Skill body`);

    const skills = await manager.discoverSkills('/test/root');

    // Should only find skill1, not anything in node_modules
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('discovered1');
  });

  it('should handle empty directories', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(
      [] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
    );

    const skills = await manager.discoverSkills('/test/empty');

    expect(skills).toHaveLength(0);
  });

  it('should filter invalid skills when validateOnDiscovery is true', async () => {
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce([
        { name: 'valid-skill', isDirectory: () => true, isFile: () => false },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>)
      .mockResolvedValueOnce([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

    // Return a skill with invalid name (uppercase)
    mockParseYaml.mockReturnValue({
      name: 'Invalid-Name',
      description: 'A skill with invalid name',
    });

    vi.mocked(fs.readFile).mockResolvedValue(`---
name: Invalid-Name
description: A skill with invalid name
---
Body`);

    const skills = await manager.discoverSkills('/test/root', {
      validateOnDiscovery: true,
    });

    // Should be filtered out due to invalid name
    expect(skills).toHaveLength(0);
  });
});

describe('SkillValidation constants', () => {
  it('should have correct max lengths', () => {
    expect(SkillValidation.MaxNameLength).toBe(64);
    expect(SkillValidation.MaxDescriptionLength).toBe(500);
    expect(SkillValidation.MaxBodyLength).toBe(50000);
    expect(SkillValidation.MaxCompatibilityLength).toBe(500);
  });

  it('should have correct name pattern', () => {
    expect(SkillValidation.NamePattern.test('valid-name')).toBe(true);
    expect(SkillValidation.NamePattern.test('valid_name')).toBe(true);
    expect(SkillValidation.NamePattern.test('valid123')).toBe(true);
    expect(SkillValidation.NamePattern.test('Invalid')).toBe(false);
    expect(SkillValidation.NamePattern.test('123invalid')).toBe(false);
    expect(SkillValidation.NamePattern.test('')).toBe(false);
  });

  it('should have skill file name constant', () => {
    expect(SkillValidation.SkillFileName).toBe('SKILL.md');
  });
});
