'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Profile } from '@/types';
import { getCurrentProfile, setCurrentProfile } from '@/lib/dataService';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  setAuthUser: (profile: Profile) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  setAuthUser: () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Directly set authenticated profile into React memory & local service
  const setAuthUser = useCallback((newProfile: Profile) => {
    console.log('[KATHA AUTH SET_USER]:', newProfile.username, newProfile.id);
    setCurrentProfile(newProfile);
    setProfileState(newProfile);

    // Create synthetic User if no Supabase User instance exists
    const syntheticUser: Partial<User> = {
      id: newProfile.id || newProfile.user_id,
      email: `${newProfile.username}@katha.app`,
      user_metadata: {
        display_name: newProfile.display_name,
        username: newProfile.username,
        avatar_url: newProfile.avatar_url,
      },
    };
    setUser(syntheticUser as unknown as User);
    setLoading(false);

    // Dispatch custom event to notify all tabs/components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('katha_auth_change'));
    }
  }, []);

  // Sync Supabase user with database profile
  const syncUserProfile = useCallback(async (authUser: User) => {
    console.log('[KATHA AUTH SYNC_USER]:', authUser.id, authUser.email);
    setUser(authUser);

    // Check existing stored profile first for instant UI response
    const existing = getCurrentProfile();
    if (existing && (existing.id === authUser.id || existing.user_id === authUser.id)) {
      setProfileState(existing);
      setLoading(false);
      return existing;
    }

    if (isSupabaseConfigured()) {
      try {
        const { data: dbProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', authUser.id)
          .single();

        if (dbProfile) {
          const loaded: Profile = {
            id: dbProfile.id,
            user_id: dbProfile.user_id,
            username: dbProfile.username,
            display_name: dbProfile.display_name,
            avatar_url: dbProfile.avatar_url,
            bio: dbProfile.bio,
            katha_score: dbProfile.katha_score || 100,
            created_at: dbProfile.created_at,
          };
          setCurrentProfile(loaded);
          setProfileState(loaded);
          setLoading(false);
          return loaded;
        }
      } catch (err) {
        console.warn('[KATHA AUTH DB FETCH WARN]:', err);
      }
    }

    // Fallback profile derived from Auth User
    const fallbackProfile: Profile = {
      id: authUser.id,
      user_id: authUser.id,
      username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || `writer_${authUser.id.substring(0, 5)}`,
      display_name: authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || 'Katha Writer',
      avatar_url: authUser.user_metadata?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&auto=format&fit=crop&q=80',
      bio: 'TFI Cinema Storyteller on KATHA',
      katha_score: 100,
      created_at: new Date().toISOString(),
    };

    setCurrentProfile(fallbackProfile);
    setProfileState(fallbackProfile);
    setLoading(false);
    return fallbackProfile;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await syncUserProfile(user);
    } else {
      const p = getCurrentProfile();
      if (p) setProfileState(p);
    }
  }, [user, syncUserProfile]);

  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        if (isSupabaseConfigured()) {
          const { data: { session: initialSession } } = await supabase.auth.getSession();
          if (isMounted) {
            console.log('[KATHA AUTH DEBUG] initialSession:', initialSession ? `User ID ${initialSession.user.id}` : 'No active session');
            setSession(initialSession);
            if (initialSession?.user) {
              await syncUserProfile(initialSession.user);
            } else {
              const localP = getCurrentProfile();
              if (localP) {
                setAuthUser(localP);
              } else {
                setUser(null);
                setProfileState(null);
                setLoading(false);
              }
            }
          }
        } else {
          // Check local stored profile
          const localP = getCurrentProfile();
          if (localP && isMounted) {
            console.log('[KATHA AUTH DEBUG] Local profile detected:', localP.username);
            setAuthUser(localP);
          } else if (isMounted) {
            console.log('[KATHA AUTH DEBUG] No user session found');
            setUser(null);
            setProfileState(null);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('[KATHA AUTH INIT ERROR]:', err);
        if (isMounted) setLoading(false);
      }
    };

    initAuth();

    // Listen to Supabase auth state events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED)
    let authSubscription: { unsubscribe: () => void } | null = null;

    if (isSupabaseConfigured()) {
      const { data } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
        console.log('[KATHA AUTH DEBUG] onAuthStateChange event:', event, 'session:', currentSession?.user?.id || 'none');

        if (!isMounted) return;

        setSession(currentSession);
        if (currentSession?.user) {
          await syncUserProfile(currentSession.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfileState(null);
          setCurrentProfile(null);
          setLoading(false);
        }
      });
      authSubscription = data.subscription;
    }

    // Listen to local storage sync events
    const handleCustomAuthChange = () => {
      const p = getCurrentProfile();
      console.log('[KATHA AUTH EVENT LOGIC]: Custom auth change event, profile:', p?.username || 'none');
      if (p) {
        setProfileState(p);
        if (!user) {
          setUser({
            id: p.id || p.user_id,
            email: `${p.username}@katha.app`,
            user_metadata: { display_name: p.display_name, username: p.username },
          } as unknown as User);
        }
      } else {
        setProfileState(null);
        setUser(null);
      }
      setLoading(false);
    };

    window.addEventListener('katha_auth_change', handleCustomAuthChange);
    window.addEventListener('storage', handleCustomAuthChange);

    return () => {
      isMounted = false;
      if (authSubscription) authSubscription.unsubscribe();
      window.removeEventListener('katha_auth_change', handleCustomAuthChange);
      window.removeEventListener('storage', handleCustomAuthChange);
    };
  }, [syncUserProfile, setAuthUser]);

  const signOut = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
      setUser(null);
      setSession(null);
      setProfileState(null);
      setCurrentProfile(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('katha_auth_change'));
      }
    } catch (err) {
      console.error('[KATHA AUTH SIGNOUT ERROR]:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, setAuthUser, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
