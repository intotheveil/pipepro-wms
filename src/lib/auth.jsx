import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let subscription;

    try {
      const supabase = getSupabase();

      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      });

      ({ data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => setSession(session)
      ));
    } catch {
      setLoading(false);
    }

    return () => subscription?.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await getSupabase().auth.signOut();
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
