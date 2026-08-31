import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), '.next', 'server_stories_v1.json');

function readServerStories(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading server stories:', err);
  }
  return [];
}

function writeServerStories(stories: any[]) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(stories, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing server stories:', err);
  }
}

// GET /api/stories - Security Enforced: Only returns public stories OR private stories belonging to the requesting user
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || searchParams.get('authorId');
  const slug = searchParams.get('slug');
  const stories = readServerStories();

  // Direct Slug/ID lookup enforcement
  if (slug) {
    const found = stories.find((s: any) => s.slug === slug || s.id === slug);
    if (!found) {
      return NextResponse.json({ error: 'Story not found.' }, { status: 404 });
    }
    const isOwner = userId && (found.author_id === userId || found.author?.id === userId || found.author?.user_id === userId);
    const isPublic = found.visibility === 'public';
    if (!isPublic && !isOwner) {
      return NextResponse.json({ error: 'Private story. Access denied.' }, { status: 403 });
    }
    return NextResponse.json({ story: found });
  }

  // List filtering enforcement
  const filtered = stories.filter((s: any) => {
    const isOwner = userId && (s.author_id === userId || s.author?.id === userId || s.author?.user_id === userId);
    const isPublic = s.visibility === 'public';
    return isPublic || isOwner;
  });

  return NextResponse.json({ stories: filtered });
}

// POST /api/stories - Accepts a story update/creation with mandatory visibility enforcement
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.title || !body.content) {
      return NextResponse.json({ error: 'Title and content are required.' }, { status: 400 });
    }

    const stories = readServerStories();
    const storyVisibility = body.visibility || 'private';

    const existingIdx = stories.findIndex((s: any) => s.id === body.id || s.slug === body.slug);
    if (existingIdx !== -1) {
      stories[existingIdx] = {
        ...stories[existingIdx],
        ...body,
        visibility: body.visibility || stories[existingIdx].visibility || 'private',
        updated_at: new Date().toISOString(),
      };
    } else {
      stories.unshift({
        ...body,
        visibility: storyVisibility,
        created_at: body.created_at || new Date().toISOString(),
        updated_at: body.updated_at || new Date().toISOString(),
      });
    }

    writeServerStories(stories);
    return NextResponse.json({ success: true, story: body });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save story on server.' }, { status: 500 });
  }
}
