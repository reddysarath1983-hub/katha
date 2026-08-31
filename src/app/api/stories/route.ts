import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Server-side global store file for zero-config fallback when Supabase is not configured
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

// GET /api/stories - Returns all worldwide stories published by any user
export async function GET(request: Request) {
  const stories = readServerStories();
  return NextResponse.json({ stories });
}

// POST /api/stories - Accepts a newly published story from any user
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || !body.title || !body.content) {
      return NextResponse.json({ error: 'Title and content are required.' }, { status: 400 });
    }

    const stories = readServerStories();
    
    // Check if story already exists by ID or slug
    const existingIdx = stories.findIndex((s: any) => s.id === body.id || s.slug === body.slug);
    if (existingIdx !== -1) {
      stories[existingIdx] = { ...stories[existingIdx], ...body, updated_at: new Date().toISOString() };
    } else {
      stories.unshift({
        ...body,
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
