import { Parser, Language } from 'web-tree-sitter';
// path is unused, removing it
import { createRequire } from 'node:module';

// Use createRequire to resolve paths relative to this file
// This is necessary because we are in an ES module context
const require = createRequire(import.meta.url);

let parser: Parser | null = null;
let language: Language | null = null;

async function initialize() {
  if (parser && language) return { parser, language };

  await Parser.init();
  parser = new Parser();

  const bashWasmPath = require.resolve(
    'tree-sitter-bash/tree-sitter-bash.wasm',
  );
  language = await Language.load(bashWasmPath);

  parser.setLanguage(language);
  return { parser, language };
}

/**
 * Parses a bash command string and returns specific command names used.
 * This is useful for validating if a command contains disallowed operations.
 */
export async function parseCommand(command: string): Promise<string[]> {
  const { parser } = await initialize();
  const tree = parser.parse(command);

  if (!tree) {
    return [];
  }

  const commands: string[] = [];
  // Fallback if descendantsOfType failed or returned empty
  if (commands.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traverse = (node: any) => {
      if (node.type === 'command_name') {
        commands.push(node.text);
      }
      for (let i = 0; i < node.childCount; i++) {
        traverse(node.child(i));
      }
    };
    traverse(tree.rootNode);
  }

  return [...new Set(commands)];
}
