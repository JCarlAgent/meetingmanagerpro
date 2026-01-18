import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User, AuthState } from '@/types';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginWithMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    let isMounted = true;

    // 1) Prefer Supabase Auth session
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user ?? null;
      if (!isMounted) return;

      if (sessionUser) {
        // Map Supabase user -> our User type
        const user: User = {
          id: sessionUser.id,
          email: sessionUser.email ?? '',
          company_name: null,
          industry: null,
          phone: null,
          created_at: sessionUser.created_at,
          is_admin: false,
        };
        localStorage.setItem('mmp_user', JSON.stringify(user));
        setAuthState({ user, isAuthenticated: true, isLoading: false });
        return;
      }

      // 2) Backward compat: fallback to stored session
      const storedUser = localStorage.getItem('mmp_user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          setAuthState({ user, isAuthenticated: true, isLoading: false });
          return;
        } catch {
          localStorage.removeItem('mmp_user');
        }
      }

      setAuthState(prev => ({ ...prev, isLoading: false }));
    };

    init();

    // Keep state in sync when magiclink/recovery redirects land
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      if (!isMounted) return;

      if (sessionUser) {
        const user: User = {
          id: sessionUser.id,
          email: sessionUser.email ?? '',
          company_name: null,
          industry: null,
          phone: null,
          created_at: sessionUser.created_at,
          is_admin: false,
        };
        localStorage.setItem('mmp_user', JSON.stringify(user));
        setAuthState({ user, isAuthenticated: true, isLoading: false });
      } else {
        localStorage.removeItem('mmp_user');
        setAuthState({ user: null, isAuthenticated: false, isLoading: false });
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { success: false, error: error.message || 'Invalid email or password' };
      }

      const sessionUser = data.user;
      if (!sessionUser) {
        return { success: false, error: 'No user returned from Supabase' };
      }

      const user: User = {
        id: sessionUser.id,
        email: sessionUser.email ?? email,
        company_name: null,
        industry: null,
        phone: null,
        created_at: sessionUser.created_at,
        is_admin: false,
      };

      // onAuthStateChange will also update state, but we set immediately for snappy UI
      localStorage.setItem('mmp_user', JSON.stringify(user));
      setAuthState({ user, isAuthenticated: true, isLoading: false });
      return { success: true };
    } catch (err) {
      return { success: false, error: 'An error occurred during login' };
    }
  };

  const loginWithMagicLink = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch {
      return { success: false, error: 'An error occurred sending the magic link' };
    }
  };

  const logout = () => {
    supabase.auth.signOut();
    localStorage.removeItem('mmp_user');
    setAuthState({ user: null, isAuthenticated: false, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, loginWithMagicLink, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
