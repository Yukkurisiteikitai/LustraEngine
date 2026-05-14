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

describe('legacyCompatibility boundary', () => {
  it('does not allow legacyCompatibility:true to appear in app or src code', () => {
    const root = process.cwd();
    const files = walkFiles(root).filter((file) =>
      file.includes(`${path.sep}app${path.sep}`) ||
      file.includes(`${path.sep}src${path.sep}`) ||
      file.includes(`${path.sep}worker.ts`),
    );

    const hits = files
      .map((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return text.includes('legacyCompatibility: true') ? file : null;
      })
      .filter((file): file is string => file !== null);

    expect(hits).toEqual([]);
  });

  it('does not keep a hidden legacy bridge in the public infer route', () => {
    const root = process.cwd();
    const routePath = path.join(root, 'app/api/traits/infer/route.ts');
    const text = fs.readFileSync(routePath, 'utf8');
    expect(text).not.toContain('legacyCompatibility: true');
  });
});
