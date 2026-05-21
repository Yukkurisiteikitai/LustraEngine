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
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('Chat/Analysis getLatest regression', () => {
  it('does not read persona latest snapshots from Chat/Analysis paths', () => {
    const root = process.cwd();
    const allowedLegacyFile = path.join(root, 'src/infrastructure/repositories/SupabasePersonaRepository.ts');
    const targetFiles = walkFiles(root).filter((file) => {
      if (file === allowedLegacyFile) return false;
      return (
        file.includes(`${path.sep}app${path.sep}`) ||
        file.includes(`${path.sep}src${path.sep}application${path.sep}`) ||
        file.includes(`${path.sep}src${path.sep}container${path.sep}`) ||
        file.endsWith(`${path.sep}worker.ts`) ||
        file.endsWith(`${path.sep}lib${path.sep}mockQueryClient.tsx`)
      );
    });

    const hits = targetFiles
      .map((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return text.includes('getLatest(') ? file : null;
      })
      .filter((file): file is string => file !== null);

    expect(hits).toEqual([]);
  });
});
