import { Link } from 'react-router-dom';
import { HardHat } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import './Navbar.css';

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-brand">
          <HardHat size={28} className="brand-icon orange-text" />
          <span className="brand-text">Construct<span className="orange-text">IQ</span></span>
        </Link>
        
        <div className="nav-links">
          <Link to="/" className="nav-link">Home</Link>
          <Link to="#services" className="nav-link">Services</Link>
          <Link to="#projects" className="nav-link">Projects</Link>
        </div>

        <div className="nav-actions">
          <ThemeToggle />
          <Link to="/auth" className="btn-outline">Sign In</Link>
          <Link to="/quote" className="btn-primary">Get a Quote</Link>
        </div>
      </div>
    </nav>
  );
}
