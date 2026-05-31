import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HardHat, ArrowLeft } from 'lucide-react';
import './Auth.css';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Mock login/signup - straight to quote
    navigate('/quote');
  };

  return (
    <div className="auth-container">
      <div className="auth-visual">
        <div className="auth-overlay"></div>
        <img src="/hero.png" alt="Construction background" className="auth-bg-img" />
        
        <div className="auth-visual-content">
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <div className="auth-brand">
            <HardHat size={48} className="orange-text" />
            <h2 className="brand-text">Construct<span className="orange-text">IQ</span></h2>
          </div>
          <p className="auth-quote">
            "Streamlining project operations, so you can build with confidence and precision."
          </p>
        </div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form-container animate-fade-in glass-panel">
          <div className="form-header">
            <h2>{isLogin ? 'Welcome Back' : 'Create an Account'}</h2>
            <p>{isLogin ? 'Sign in to access your dashboard' : 'Join to start managing your projects'}</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {!isLogin && (
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input type="text" className="input-field" placeholder="John Doe" required />
              </div>
            )}
            
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input type="email" className="input-field" placeholder="john@example.com" required />
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input type="password" className="input-field" placeholder="••••••••" required />
            </div>

            <button type="submit" className="btn-primary full-width">
              {isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="auth-toggle">
            <p>
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button 
                type="button" 
                className="toggle-btn"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? 'Sign up here' : 'Log in instead'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
