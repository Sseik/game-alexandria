import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { User } from '../../../shared/types';

interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hydrateStoredUser = async () => {
      const savedUser = localStorage.getItem('user');

      if (!savedUser) {
        setIsLoading(false);
        return;
      }

      try {
        const parsedUser = JSON.parse(savedUser) as User;
        const resolvedUser = await window.api.getUser(parsedUser.id);

        if (resolvedUser && resolvedUser.email === parsedUser.email) {
          setUser(resolvedUser);
          localStorage.setItem('user', JSON.stringify(resolvedUser));
        } else {
          localStorage.removeItem('user');
        }
      } catch {
        localStorage.removeItem('user');
      } finally {
        setIsLoading(false);
      }
    };

    void hydrateStoredUser();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const isAuthenticated = !!user;

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (user?.id) {
      void window.api.setActiveRemoteUser(user.id);
      return;
    }

    void window.api.clearActiveRemoteUser();
  }, [isLoading, user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used insideof AuthProvider');
  }
  return context;
}

export default AuthProvider;
