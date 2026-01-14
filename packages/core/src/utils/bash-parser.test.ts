import { describe, it, expect } from 'vitest';
import { parseCommand } from './bash-parser.js';

describe('BashParser', () => {
  it('should parse simple commands', async () => {
    const commands = await parseCommand('ls -la');
    expect(commands).toContain('ls');
  });

  it('should parse piped commands', async () => {
    const commands = await parseCommand('cat file.txt | grep "hello"');
    expect(commands).toContain('cat');
    expect(commands).toContain('grep');
  });

  it('should parse sequences', async () => {
    const commands = await parseCommand('cd /tmp && rm -rf *');
    expect(commands).toContain('cd');
    expect(commands).toContain('rm');
  });

  it('should parse background commands', async () => {
    const commands = await parseCommand('sleep 10 &');
    expect(commands).toContain('sleep');
  });

  it('should parse subshells', async () => {
    const commands = await parseCommand('(cd /tmp; ls)');
    expect(commands).toContain('cd');
    expect(commands).toContain('ls');
  });

  it('should return empty array for empty string', async () => {
    const commands = await parseCommand('');
    expect(commands).toEqual([]);
  });
});
