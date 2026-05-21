import fs from 'node:fs';
import path from 'node:path';

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.open-next' || entry.name === '.claude') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, acc);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('legacy persona boundary', () => {
  it('keeps legacy persona APIs out of app/src code and keeps deleted files deleted', () => {
    const root = process.cwd();
    const createRepositoriesPath = path.join(root, 'src/container/createRepositories.ts');
    const deletedFiles = [
      path.join(root, 'src/core/domains/persona/IPersonaRepository.ts'),
      path.join(root, 'src/infrastructure/repositories/SupabasePersonaRepository.ts'),
      path.join(root, 'src/core/domains/persona/Persona.ts'),
      path.join(root, 'src/application/mappers/PersonaMapper.ts'),
    ];
    deletedFiles.forEach((file) => {
      expect(fs.existsSync(file)).toBe(false);
    });

    const forbiddenPatterns = [
      'saveSnapshot(',
      'getLatest(',
      'PersonaMapper',
      'IPersonaRepository',
      'SupabasePersonaRepository',
      'persona:',
    ];

    const createRepositoriesText = fs.readFileSync(createRepositoriesPath, 'utf8');
    expect(createRepositoriesText).not.toContain('SupabasePersonaRepository');
    expect(createRepositoriesText).not.toContain('persona:');

    const hits = walkFiles(root)
      .filter((file) => file.includes(`${path.sep}app${path.sep}`) || file.includes(`${path.sep}src${path.sep}`))
      .map((file) => {
        const text = fs.readFileSync(file, 'utf8');
        const matched = forbiddenPatterns.find((pattern) => text.includes(pattern));
        return matched ? `${file}:${matched}` : null;
      })
      .filter((value): value is string => value !== null);

    expect(hits).toEqual([]);
  });
});
