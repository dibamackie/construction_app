import { Link } from 'react-router-dom';
import { ArrowRight, Activity, Shield, Clock } from 'lucide-react';
import './Landing.css';

export default function Landing() {
  return (
    <div className="landing-page">
      <section className="hero">
        <div className="hero-bg">
          <img src="/hero.png" alt="Modern Construction" className="hero-image" />
          <div className="hero-overlay"></div>
        </div>
        
        <div className="hero-content animate-fade-in">
          <div className="badge">Next-Gen Construction Management</div>
          <h1 className="hero-title">
            Build the Future with <br />
            <span className="gradient-text">Unmatched Precision</span>
          </h1>
          <p className="hero-subtitle">
            ConstructIQ brings intelligent workflows, predictive quoting, and powerful management tools to modern construction teams.
          </p>
          <div className="hero-actions">
            <Link to="/quote" className="btn-primary">
              Start Free Quote <ArrowRight size={20} />
            </Link>
            <Link to="/auth" className="btn-outline">
              Partner Login
            </Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="features-grid">
          <div className="feature-card glass-panel delay-1 animate-fade-in">
            <div className="feature-icon"><Activity className="orange-text" size={32} /></div>
            <h3>Real-time Analytics</h3>
            <p>Track project progress, resource allocation, and budget variations instantly.</p>
          </div>
          <div className="feature-card glass-panel delay-2 animate-fade-in">
            <div className="feature-icon"><Shield className="orange-text" size={32} /></div>
            <h3>Safety Compliance</h3>
            <p>Automated safety checks and compliance reporting built directly into your daily logs.</p>
          </div>
          <div className="feature-card glass-panel delay-3 animate-fade-in">
            <div className="feature-icon"><Clock className="orange-text" size={32} /></div>
            <h3>Timeline Precision</h3>
            <p>Advanced scheduling algorithms to ensure your project delivers exactly on time.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
