/**
 * SignInPage.tsx
 *
 * A hidden authentication page accessible only at /signin.
 * Not linked from the main navigation — the owner navigates here
 * directly when needed. Triggers Google Sign-In via Firebase
 * Authentication and redirects to the home page on success.
 */

import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { signInWithGoogle } from '../firebase';
import { useOwnerAuth } from '../hooks/useOwnerAuth';

export default function SignInPage() {
  const navigate = useNavigate();
  const { isOwner, authLoading } = useOwnerAuth();
  const [error, setError] = useState<string | null>(null);

  if (!import.meta.env.DEV && authLoading) {
    return null;
  }

  if (isOwner) {
    return <Navigate to="/workspace" replace />;
  }

  const handleSignIn = async () => {
    try {
      setError(null);
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please try again.');
      }
    }
  };

  const sharedButtonStyle = {
    padding: '0.75rem 1.5rem' as const,
    fontFamily: 'Inter, sans-serif' as const,
    fontSize: '0.875rem' as const,
    borderRadius: '4px' as const,
    cursor: 'pointer' as const,
    letterSpacing: '0.025em' as const,
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'Inter, sans-serif',
      color: '#1A1A1A',
      backgroundColor: '#F9F9F7',
    }}>
      <h1 style={{
        fontFamily: 'Cormorant Garamond, serif',
        fontSize: '1.5rem',
        fontWeight: 600,
        marginBottom: '1.5rem',
      }}>
        Owner Authentication
      </h1>
      <button
        type="button"
        onClick={handleSignIn}
        style={{
          ...sharedButtonStyle,
          backgroundColor: '#8B2C2C',
          color: '#F9F9F7',
          border: 'none',
        }}
      >
        Sign In with Google
      </button>
      {error && (
        <p style={{
          marginTop: '1rem',
          color: '#8B2C2C',
          fontSize: '0.875rem',
        }}>
          {error}
        </p>
      )}
    </div>
  );
}
