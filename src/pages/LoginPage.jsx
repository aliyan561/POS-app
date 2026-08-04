import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { LogIn } from 'lucide-react';
import logoImg from '../../assets/logo-white-bg.png'; // Better for dark backgrounds
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
    }
    // If successful, AuthContext will update and App will re-render
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src={logoImg} alt="Prime Diagnostic Centre" className="login-logo" />
          <h2>Welcome Back</h2>
          <p>Please sign in to access the POS system</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label className="form-label" style={{ color: '#e2e8f0' }}>Email Address</label>
            <input
              type="email"
              className="form-control login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@primediagnostic.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ color: '#e2e8f0' }}>Password</label>
            <input
              type="password"
              className="form-control login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary login-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              'Signing in...'
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
