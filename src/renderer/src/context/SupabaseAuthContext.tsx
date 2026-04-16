import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../shared/supabaseClient';

interface User {
  id: number;
  username: string;
  email: string;
  roleId: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check existing session
    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (data.session?.user) {
          // Fetch user profile from your RLS-protected users table in Supabase
          const { data: userData, error } = await supabase
            .from('users')
            .select('id, username, email, role_id')
            .eq('id', data.session.user.id)
            .single();

          if (userData && !error) {
            setUser({
              id: userData.id,
              username: userData.username,
              email: userData.email,
              roleId: userData.role_id
            });
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, username, email, role_id')
          .eq('id', session.user.id)
          .single();

        if (userData) {
          setUser({
            id: userData.id,
            username: userData.username,
            email: userData.email,
            roleId: userData.role_id
          });
        }
      } else {
        setUser(null);
      }
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, username: string, password: string) => {
    setIsLoading(true);
    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Sign up failed');

      // Create user profile
      const { error: profileError } = await supabase.from('users').insert({
        id: authData.user.id,
        username,
        email,
        role_id: 2 // Default user role
      });

      if (profileError) throw profileError;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
