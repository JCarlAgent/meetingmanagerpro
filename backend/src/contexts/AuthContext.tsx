import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User, AuthState } from '@/types';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
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
    // Check for stored session
    const storedUser = localStorage.getItem('mmp_user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setAuthState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        localStorage.removeItem('mmp_user');
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password_hash', password)
        .single();

      if (error || !data) {
        return { success: false, error: 'Invalid email or password' };
      }

      const user: User = {
        id: data.id,
        email: data.email,
        company_name: data.company_name,
        industry: data.industry,
        phone: data.phone,
        created_at: data.created_at,
        is_admin: data.is_admin || false,
      };

      localStorage.setItem('mmp_user', JSON.stringify(user));
      setAuthState({
        user,
        isAuthenticated: true,
        isLoading: false,
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: 'An error occurred during login' };
    }
  };

  const logout = () => {
    localStorage.removeItem('mmp_user');
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, logout }}>
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
