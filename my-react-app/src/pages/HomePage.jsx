import React from "react";
import { useNavigate } from "react-router-dom";
import "./HomePage.css";

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      {/* Navigation Header */}
      <nav className="home-navbar">
        <div className="home-navbar-container">
          <div className="home-logo">
            <span className="logo-text">Notarize Pro</span>
          </div>
          <div className="home-nav-buttons">
            <button
              className="nav-btn login-btn"
              onClick={() => navigate("/auth")}
            >
              Login
            </button>
            <button
              className="nav-btn signup-btn"
              onClick={() => navigate("/register")}
            >
              Sign Up
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Secure Digital Notarization Made Simple
          </h1>
          <p className="hero-subtitle">
            Real-time document signing, verification, and notarization with industry-leading security and ease of use
          </p>
          <div className="hero-cta">
            <button
              className="cta-btn primary-cta"
              onClick={() => navigate("/register")}
            >
              Get Started Free
            </button>
            <button
              className="cta-btn secondary-cta"
              onClick={() => document.getElementById("features").scrollIntoView({ behavior: "smooth" })}
            >
              Learn More
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-graphic">
            <div className="graphic-circle circle-1"></div>
            <div className="graphic-circle circle-2"></div>
            <div className="graphic-circle circle-3"></div>
            <div className="graphic-document" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section" id="features">
        <div className="section-header">
          <h2>Powerful Features for Every User</h2>
          <p>Everything you need for secure digital notarization</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon" />
            <h3>Easy Upload & Sharing</h3>
            <p>Upload documents and share secure links with recipients instantly</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" />
            <h3>Digital Signatures</h3>
            <p>Draw, type, or upload your signature with full authentication</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" />
            <h3>Drag & Drop Tools</h3>
            <p>Intuitive interface to place signatures and stamps anywhere on documents</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" />
            <h3>Bank-Level Security</h3>
            <p>End-to-end encryption and secure signature verification</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" />
            <h3>Real-Time Sync</h3>
            <p>Live updates and synchronization across all connected users</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon" />
            <h3>Session Recording</h3>
            <p>Record notarization sessions with WebRTC for compliance and records</p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <div className="section-header">
          <h2>How It Works</h2>
          <p>Three simple steps to complete your notarization</p>
        </div>
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>Upload Your Document</h3>
            <p>Submit your document and share an invitation link with the notary</p>
          </div>
          <div className="step-arrow" />
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>Sign & Notarize</h3>
            <p>Add your signatures and notary verification in real-time</p>
          </div>
          <div className="step-arrow" />
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>Download & Done</h3>
            <p>Get your notarized document instantly in your secure account</p>
          </div>
        </div>
      </section>

      {/* User Roles Section */}
      <section className="roles-section">
        <div className="section-header">
          <h2>Trusted by All Types of Users</h2>
          <p>Choose your role to get started</p>
        </div>
        <div className="roles-grid">
          <div className="role-card">
            <div className="role-icon" />
            <h3>Document Owners</h3>
            <p>Securely upload documents and get them notarized with e-signatures</p>
            <button
              className="role-btn"
              onClick={() => {
                localStorage.setItem("notary.role", "owner");
                navigate("/owner");
              }}
            >
              Continue as Owner
            </button>
          </div>
          <div className="role-card">
            <div className="role-icon" />
            <h3>Notaries</h3>
            <p>Review, verify, and notarize documents from clients in real-time</p>
            <button
              className="role-btn"
              onClick={() => {
                localStorage.setItem("notary.role", "notary");
                navigate("/notary");
              }}
            >
              Continue as Notary
            </button>
          </div>
          <div className="role-card admin-card">
            <div className="role-icon" />
            <h3>Administrators</h3>
            <p>Manage platform users, sessions, and oversee all notarization activity</p>
            <button
              className="role-btn"
              onClick={() => {
                localStorage.setItem("notary.role", "admin");
                navigate("/admin");
              }}
            >
              Continue as Admin
            </button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="stat-item">
          <h3>10M+</h3>
          <p>Documents Processed</p>
        </div>
        <div className="stat-item">
          <h3>250K+</h3>
          <p>Active Users</p>
        </div>
        <div className="stat-item">
          <h3>99.9%</h3>
          <p>Uptime Guarantee</p>
        </div>
        <div className="stat-item">
          <h3>24/7</h3>
          <p>Customer Support</p>
        </div>
      </section>

      {/* CTA Section */}
      <section className="final-cta">
        <h2>Ready to Notarize Your Documents?</h2>
        <p>Join thousands of users who rely on our platform every day</p>
        <button
          className="cta-btn large-cta"
          onClick={() => navigate("/register")}
        >
          Start Your Free Account Today
        </button>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Notarize Pro</h4>
            <p>Your trusted digital notarization platform</p>
          </div>
          <div className="footer-section">
            <h4>Legal</h4>
            <ul>
              <li><a href="#privacy">Privacy Policy</a></li>
              <li><a href="#terms">Terms of Service</a></li>
              <li><a href="#security">Security</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Support</h4>
            <ul>
              <li><a href="#help">Help Center</a></li>
              <li><a href="#contact">Contact Us</a></li>
              <li><a href="#blog">Blog</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Notarize Pro. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
