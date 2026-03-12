import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const faviconPath = path.join(process.cwd(), 'favicon_io', 'favicon.ico');
    const faviconBuffer = await readFile(faviconPath);

    return new Response(faviconBuffer, {
      headers: {
        'Content-Type': 'image/x-icon',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Favicon route error:', error);
    return new Response('Not Found', { status: 404 });
  }
}
