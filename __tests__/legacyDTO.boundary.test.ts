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

describe('legacy DTO boundary', () => {
  it('does not allow LegacyPersonaDTO to reappear outside the DTO module', () => {
    const root = process.cwd();
    const boundaryFile = path.join(root, '__tests__/legacyDTO.boundary.test.ts');
    const hits = walkFiles(root)
      .filter((file) => !file.endsWith(`${path.sep}src${path.sep}application${path.sep}dto${path.sep}PersonaDTO.ts`))
      .filter((file) => file !== boundaryFile)
      .filter((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return text.includes('LegacyPersonaDTO');
      });

    expect(hits).toEqual([]);
  });
});
