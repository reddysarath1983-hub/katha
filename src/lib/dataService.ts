import {
  Story,
  Profile,
  Comment,
  Genre,
  NotificationItem,
  Report,
} from '@/types';
import {
  SAMPLE_STORIES,
  SAMPLE_PROFILES,
  SAMPLE_COMMENTS,
  SAMPLE_ACHIEVEMENTS,
  SAMPLE_NOTIFICATIONS,
} from './sampleData';

const STORIES_STORAGE_KEY = 'katha_real_stories_v3';
const PROFILES_STORAGE_KEY = 'katha_real_profiles_v3';
const COMMENTS_STORAGE_KEY = 'katha_real_comments_v3';
const LIKES_STORAGE_KEY = 'katha_real_likes_v3';
const VOTES_STORAGE_KEY = 'katha_real_votes_v3';
const RATINGS_STORAGE_KEY = 'katha_real_ratings_v3';
const CASTING_STORAGE_KEY = 'katha_real_casting_v3';
const NOTIFICATIONS_STORAGE_KEY = 'katha_real_notifs_v3';
const REPORTS_STORAGE_KEY = 'katha_real_reports_v3';
const CURRENT_USER_KEY = 'katha_real_auth_user_v3';
const VIEWS_TRACKER_KEY = 'katha_real_views_session';

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  let sid = localStorage.getItem('katha_sid');
  if (!sid) {
    sid = 'sid_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    localStorage.setItem('katha_sid', sid);
  }
  return sid;
}

export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const shortHash = Math.random().toString(36).substring(2, 6);
  return `${base || 'katha'}-${shortHash}`;
}

export function initDataService() {
  if (typeof window === 'undefined') return;

  if (!localStorage.getItem(STORIES_STORAGE_KEY)) {
    localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(PROFILES_STORAGE_KEY)) {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(COMMENTS_STORAGE_KEY)) {
    localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify([]));
  }
  if (!localStorage.getItem(NOTIFICATIONS_STORAGE_KEY)) {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify([]));
  }
}

// ----------------------------------------------------------------------
// AUTHENTICATION & USER PROFILE
// ----------------------------------------------------------------------

export function getCurrentProfile(): Profile | null {
  if (typeof window === 'undefined') return null;
  initDataService();
  const str = localStorage.getItem(CURRENT_USER_KEY);
  return str ? JSON.parse(str) : null;
}

export function setCurrentProfile(profile: Profile | null) {
  if (typeof window === 'undefined') return;
  if (profile) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(profile));
    // Save to profiles registry if missing
    const profilesStr = localStorage.getItem(PROFILES_STORAGE_KEY) || '[]';
    const profiles: Profile[] = JSON.parse(profilesStr);
    const idx = profiles.findIndex((p) => p.id === profile.id || p.username === profile.username);
    if (idx === -1) {
      profiles.push(profile);
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    }
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

export function getProfileByUsername(username: string): Profile | null {
  initDataService();
  const current = getCurrentProfile();
  if (current && current.username.toLowerCase() === username.toLowerCase()) {
    return current;
  }
  const profilesStr = localStorage.getItem(PROFILES_STORAGE_KEY) || '[]';
  const profiles: Profile[] = JSON.parse(profilesStr);
  return profiles.find((p) => p.username.toLowerCase() === username.toLowerCase()) || null;
}

export function updateProfile(userId: string, updates: Partial<Profile>): Profile | null {
  initDataService();
  const profilesStr = localStorage.getItem(PROFILES_STORAGE_KEY) || '[]';
  let profiles: Profile[] = JSON.parse(profilesStr);

  const idx = profiles.findIndex((p) => p.id === userId || p.user_id === userId);
  if (idx !== -1) {
    profiles[idx] = {
      ...profiles[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));

    const current = getCurrentProfile();
    if (current && (current.id === userId || current.user_id === userId)) {
      setCurrentProfile(profiles[idx]);
    }
    return profiles[idx];
  }
  return null;
}

// ----------------------------------------------------------------------
// STORIES & REAL DATA QUERIES
// ----------------------------------------------------------------------

export interface QueryOptions {
  genre?: string;
  sortBy?: 'Trending' | 'Newest' | 'Most Read' | 'Highest Rated' | 'Most Discussed' | string;
  search?: string;
  authorId?: string;
  publishedOnly?: boolean;
}

export function getStories(options: QueryOptions = {}): Story[] {
  if (typeof window === 'undefined') return [];
  initDataService();

  const str = localStorage.getItem(STORIES_STORAGE_KEY);
  let stories: Story[] = str ? JSON.parse(str) : [];

  // Filter published status
  if (options.publishedOnly !== false) {
    stories = stories.filter((s) => s.published);
  }

  // Filter Author
  if (options.authorId) {
    stories = stories.filter((s) => s.author_id === options.authorId || s.author?.id === options.authorId);
  }

  // Filter Genre
  if (options.genre && options.genre !== 'All') {
    stories = stories.filter((s) => s.genre.toLowerCase() === options.genre!.toLowerCase());
  }

  // Search Query
  if (options.search && options.search.trim()) {
    const q = options.search.toLowerCase().trim();
    stories = stories.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.pitch.toLowerCase().includes(q) ||
        s.genre.toLowerCase().includes(q) ||
        (s.author && s.author.display_name.toLowerCase().includes(q)) ||
        (s.author && s.author.username.toLowerCase().includes(q)) ||
        s.content.toLowerCase().includes(q)
    );
  }

  // Sort & Weighted Trending Algorithm
  const now = new Date().getTime();
  stories.sort((a, b) => {
    switch (options.sortBy) {
      case 'Newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'Most Read':
        return b.views - a.views;
      case 'Highest Rated':
        return b.average_rating - a.average_rating;
      case 'Most Discussed':
        return b.likes_count * 2 + (b.rating_count || 0) - (a.likes_count * 2 + (a.rating_count || 0));
      case 'Trending':
      default: {
        const daysA = Math.max(1, (now - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24));
        const daysB = Math.max(1, (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24));

        const scoreA =
          a.views * 1 +
          a.likes_count * 4 +
          a.would_watch_yes * 6 +
          a.average_rating * 10 -
          daysA * 2;
        const scoreB =
          b.views * 1 +
          b.likes_count * 4 +
          b.would_watch_yes * 6 +
          b.average_rating * 10 -
          daysB * 2;

        return scoreB - scoreA;
      }
    }
  });

  return stories;
}

export function getStoryBySlugOrId(identifier: string): Story | null {
  const stories = getStories({ publishedOnly: false });
  return stories.find((s) => s.slug === identifier || s.id === identifier) || null;
}

export function recordStoryView(storyId: string) {
  if (typeof window === 'undefined') return;
  initDataService();

  const viewedStr = sessionStorage.getItem(VIEWS_TRACKER_KEY) || '[]';
  const viewedList: string[] = JSON.parse(viewedStr);

  if (viewedList.includes(storyId)) return;

  viewedList.push(storyId);
  sessionStorage.setItem(VIEWS_TRACKER_KEY, JSON.stringify(viewedList));

  const str = localStorage.getItem(STORIES_STORAGE_KEY);
  if (!str) return;
  const stories: Story[] = JSON.parse(str);
  const idx = stories.findIndex((s) => s.id === storyId);

  if (idx !== -1) {
    stories[idx].views += 1;
    localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(stories));
  }
}

export function toggleStoryLike(storyId: string): { isLiked: boolean; newCount: number } {
  if (typeof window === 'undefined') return { isLiked: false, newCount: 0 };
  initDataService();

  const user = getCurrentProfile();
  if (!user) throw new Error('Authentication required to like stories.');

  const likesStr = localStorage.getItem(LIKES_STORAGE_KEY) || '{}';
  const likes: Record<string, string[]> = JSON.parse(likesStr);

  if (!likes[storyId]) likes[storyId] = [];

  const userIdx = likes[storyId].indexOf(user.id);
  let isLiked = false;

  if (userIdx !== -1) {
    likes[storyId].splice(userIdx, 1);
  } else {
    likes[storyId].push(user.id);
    isLiked = true;
  }
  localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(likes));

  const storiesStr = localStorage.getItem(STORIES_STORAGE_KEY);
  let newCount = 0;
  if (storiesStr) {
    const stories: Story[] = JSON.parse(storiesStr);
    const storyIdx = stories.findIndex((s) => s.id === storyId);
    if (storyIdx !== -1) {
      stories[storyIdx].likes_count = isLiked
        ? stories[storyIdx].likes_count + 1
        : Math.max(0, stories[storyIdx].likes_count - 1);
      newCount = stories[storyIdx].likes_count;
      localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(stories));
    }
  }

  return { isLiked, newCount };
}

export function getStoryLikeState(storyId: string): boolean {
  if (typeof window === 'undefined') return false;
  const user = getCurrentProfile();
  if (!user) return false;
  const likesStr = localStorage.getItem(LIKES_STORAGE_KEY) || '{}';
  const likes: Record<string, string[]> = JSON.parse(likesStr);
  return likes[storyId]?.includes(user.id) || false;
}

export function submitStoryRating(storyId: string, ratingValue: number): Story | null {
  if (typeof window === 'undefined') return null;
  initDataService();

  const user = getCurrentProfile();
  if (!user) throw new Error('Authentication required to rate stories.');

  const story = getStoryBySlugOrId(storyId);
  if (story && (story.author_id === user.id || story.author?.id === user.id)) {
    throw new Error('As the writer of this story, you cannot rate your own story.');
  }

  const ratingsStr = localStorage.getItem(RATINGS_STORAGE_KEY) || '{}';
  const ratingsMap: Record<string, Record<string, number>> = JSON.parse(ratingsStr);

  if (!ratingsMap[storyId]) ratingsMap[storyId] = {};
  ratingsMap[storyId][user.id] = ratingValue;
  localStorage.setItem(RATINGS_STORAGE_KEY, JSON.stringify(ratingsMap));

  const storiesStr = localStorage.getItem(STORIES_STORAGE_KEY);
  if (storiesStr) {
    const stories: Story[] = JSON.parse(storiesStr);
    const storyIdx = stories.findIndex((s) => s.id === storyId);
    if (storyIdx !== -1) {
      const allVals = Object.values(ratingsMap[storyId]);
      const avg = Number((allVals.reduce((sum, v) => sum + v, 0) / allVals.length).toFixed(1));
      stories[storyIdx].average_rating = avg;
      stories[storyIdx].rating_count = allVals.length;
      localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(stories));
      return stories[storyIdx];
    }
  }

  return story;
}

export function submitWouldWatchVote(storyId: string, vote: 'yes' | 'no'): { yesPercent: number; noPercent: number; totalVotes: number; userVote: 'yes' | 'no' | null } {
  if (typeof window === 'undefined') return { yesPercent: 0, noPercent: 0, totalVotes: 0, userVote: vote };
  initDataService();

  const user = getCurrentProfile();
  if (!user) throw new Error('Authentication required to vote.');

  const story = getStoryBySlugOrId(storyId);
  if (story && (story.author_id === user.id || story.author?.id === user.id)) {
    throw new Error('As the writer of this story, you cannot vote on your own story.');
  }

  const votesStr = localStorage.getItem(VOTES_STORAGE_KEY) || '{}';
  const votesMap: Record<string, Record<string, 'yes' | 'no'>> = JSON.parse(votesStr);

  if (!votesMap[storyId]) votesMap[storyId] = {};
  votesMap[storyId][user.id] = vote;
  localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(votesMap));

  const storiesStr = localStorage.getItem(STORIES_STORAGE_KEY);
  if (storiesStr) {
    const stories: Story[] = JSON.parse(storiesStr);
    const storyIdx = stories.findIndex((s) => s.id === storyId);
    if (storyIdx !== -1) {
      if (vote === 'yes') {
        stories[storyIdx].would_watch_yes += 1;
      } else {
        stories[storyIdx].would_watch_no += 1;
      }
      localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(stories));
    }
  }

  return getWouldWatchStats(storyId);
}

export function getWouldWatchStats(storyId: string): { yesPercent: number; noPercent: number; totalVotes: number; userVote: 'yes' | 'no' | null } {
  if (typeof window === 'undefined') return { yesPercent: 0, noPercent: 0, totalVotes: 0, userVote: null };
  const user = getCurrentProfile();
  const story = getStoryBySlugOrId(storyId);

  const votesStr = localStorage.getItem(VOTES_STORAGE_KEY) || '{}';
  const votesMap: Record<string, Record<string, 'yes' | 'no'>> = JSON.parse(votesStr);

  const userVote = user ? votesMap[storyId]?.[user.id] || null : null;

  const yesCount = story?.would_watch_yes || 0;
  const noCount = story?.would_watch_no || 0;
  const total = yesCount + noCount;

  if (total === 0) return { yesPercent: 0, noPercent: 0, totalVotes: 0, userVote };

  const yesPercent = Math.round((yesCount / total) * 100);
  const noPercent = 100 - yesPercent;

  return { yesPercent, noPercent, totalVotes: total, userVote };
}

export function submitCastingVote(storyId: string, category: 'hero' | 'director', choice: string) {
  if (typeof window === 'undefined') return;
  initDataService();
  const user = getCurrentProfile();
  if (!user) throw new Error('Authentication required to cast votes.');

  const castingStr = localStorage.getItem(CASTING_STORAGE_KEY) || '{}';
  const castingMap: Record<string, Record<string, Record<string, string>>> = JSON.parse(castingStr);

  if (!castingMap[storyId]) castingMap[storyId] = {};
  if (!castingMap[storyId][category]) castingMap[storyId][category] = {};

  castingMap[storyId][category][user.id] = choice;
  localStorage.setItem(CASTING_STORAGE_KEY, JSON.stringify(castingMap));

  const storiesStr = localStorage.getItem(STORIES_STORAGE_KEY);
  if (storiesStr) {
    const stories: Story[] = JSON.parse(storiesStr);
    const storyIdx = stories.findIndex((s) => s.id === storyId);
    if (storyIdx !== -1) {
      const field = category === 'hero' ? 'hero_casting' : 'director_casting';
      if (!stories[storyIdx][field]) stories[storyIdx][field] = {};
      stories[storyIdx][field]![choice] = (stories[storyIdx][field]![choice] || 0) + 1;
      localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(stories));
    }
  }
}

// ----------------------------------------------------------------------
// COMMENTS & DISCUSSION
// ----------------------------------------------------------------------

export function getComments(storyId: string): Comment[] {
  if (typeof window === 'undefined') return [];
  initDataService();
  const str = localStorage.getItem(COMMENTS_STORAGE_KEY);
  const list: Comment[] = str ? JSON.parse(str) : [];
  return list.filter((c) => c.story_id === storyId);
}

export function createComment(storyId: string, content: string, parentId?: string | null): Comment {
  if (typeof window === 'undefined') throw new Error('Client side only');
  initDataService();
  const user = getCurrentProfile();
  if (!user) throw new Error('Authentication required to comment.');

  const newComment: Comment = {
    id: 'c_' + Date.now().toString(36),
    story_id: storyId,
    author_id: user.id,
    author_name: user.display_name,
    author_avatar: user.avatar_url,
    parent_id: parentId || null,
    content: content.trim(),
    likes_count: 0,
    created_at: new Date().toISOString(),
  };

  const str = localStorage.getItem(COMMENTS_STORAGE_KEY);
  const list: Comment[] = str ? JSON.parse(str) : [];
  list.unshift(newComment);
  localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(list));

  const story = getStoryBySlugOrId(storyId);
  if (story && story.author_id !== user.id) {
    addNotification({
      user_id: story.author_id,
      type: 'comment',
      title: `New Comment on ${story.title}`,
      message: `${user.display_name} commented: "${content.substring(0, 40)}..."`,
      link: `/story/${story.slug}`,
    });
  }

  return newComment;
}

// ----------------------------------------------------------------------
// STORY CREATION, DRAFTS & DASHBOARD
// ----------------------------------------------------------------------

export function createStory(data: {
  title: string;
  genre: Genre;
  pitch: string;
  content: string;
  cover_image_url?: string;
  casting_note?: string;
  published?: boolean;
}): Story {
  if (typeof window === 'undefined') throw new Error('Client side only');
  initDataService();

  const user = getCurrentProfile();
  if (!user) throw new Error('Authentication required to create a story.');

  const slug = generateSlug(data.title);
  const defaultCover = 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=1000&auto=format&fit=crop&q=80';

  const newStory: Story = {
    id: 'story_' + Date.now().toString(36),
    author_id: user.id,
    author: user,
    title: data.title.trim(),
    slug,
    genre: data.genre,
    pitch: data.pitch.trim(),
    content: data.content.trim(),
    cover_image_url: data.cover_image_url?.trim() || defaultCover,
    views: 1,
    likes_count: 1,
    would_watch_yes: 1,
    would_watch_no: 0,
    average_rating: 9.0,
    rating_count: 1,
    published: data.published !== false,
    casting_note: data.casting_note?.trim(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    hero_casting: {},
    director_casting: {},
  };

  const stories = getStories({ publishedOnly: false });
  stories.unshift(newStory);
  localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(stories));

  updateProfile(user.id, { katha_score: (user.katha_score || 100) + 100 });

  return newStory;
}

export function updateStoryStatus(storyId: string, published: boolean): Story | null {
  initDataService();
  const str = localStorage.getItem(STORIES_STORAGE_KEY);
  if (!str) return null;
  const stories: Story[] = JSON.parse(str);

  const idx = stories.findIndex((s) => s.id === storyId);
  if (idx !== -1) {
    stories[idx].published = published;
    stories[idx].updated_at = new Date().toISOString();
    localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(stories));
    return stories[idx];
  }
  return null;
}

export function deleteStory(storyId: string) {
  initDataService();
  const str = localStorage.getItem(STORIES_STORAGE_KEY);
  if (!str) return;
  const stories: Story[] = JSON.parse(str);
  const filtered = stories.filter((s) => s.id !== storyId);
  localStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(filtered));
}

// ----------------------------------------------------------------------
// NOTIFICATIONS & REPORTS
// ----------------------------------------------------------------------

export function getNotifications(userId?: string): NotificationItem[] {
  if (typeof window === 'undefined') return [];
  initDataService();
  const str = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
  const list: NotificationItem[] = str ? JSON.parse(str) : [];
  if (userId) {
    return list.filter((n) => n.user_id === userId);
  }
  return list;
}

export function addNotification(item: Omit<NotificationItem, 'id' | 'created_at' | 'is_read'>) {
  if (typeof window === 'undefined') return;
  initDataService();
  const newNotif: NotificationItem = {
    ...item,
    id: 'notif_' + Date.now().toString(36),
    is_read: false,
    created_at: new Date().toISOString(),
  };
  const list = getNotifications();
  list.unshift(newNotif);
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(list));
}

export function markNotificationRead(id: string) {
  if (typeof window === 'undefined') return;
  const list = getNotifications();
  const idx = list.findIndex((n) => n.id === id);
  if (idx !== -1) {
    list[idx].is_read = true;
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(list));
  }
}
