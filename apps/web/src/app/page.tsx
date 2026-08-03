"use client";

import { useState, type FormEvent } from "react";
import { firebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import { Dashboard } from "@/components/dashboard";

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>Deadline<span>OS</span></span>
    </div>
  );
}

function Login() {
  const { signIn, loading, error } = useAuth();
  const [rollNumber, setRollNumber] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    await signIn(rollNumber, password);
  }
  return (
    <main className="login-page">
      <header className="landing-nav"><Brand /><span className="secure-chip">Institution access only</span></header>
      <section className="login-grid">
        <div className="login-copy">
          <p className="eyebrow">MBA DEADLINE COMMAND CENTER</p>
          <h1>Every deadline.<br /><em>Zero surprises.</em></h1>
          <p className="hero-copy">Assignments, pre-reads, forms, and case competitions—prioritized in one calm, high-speed workspace.</p>
          <div className="promise-row">
            <span><b>24h</b> early warning</span>
            <span><b>2h</b> final reminder</span>
            <span><b>100%</b> auditable</span>
          </div>
        </div>
        <div className="login-card">
          <div className="mini-orbit"><span>24h</span><span>2h</span><strong>NOW</strong></div>
          <h2>Enter your command center</h2>
          <p>Use your roll number and the password issued by your system administrator.</p>
          <form className="login-form" onSubmit={submit}>
            <label>Roll number<input value={rollNumber} onChange={(event) => setRollNumber(event.target.value.toUpperCase())} autoComplete="username" autoCapitalize="characters" spellCheck={false} pattern="24M2[0-9]{3}" placeholder="24M2001" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required /></label>
            <button className="sign-in-button" disabled={loading}>{loading ? "Checking access…" : "Sign in"}</button>
          </form>
          {error && <p className="form-error" role="alert">{error}</p>}
          <small>Credentials are set by the administrator. Access is role-scoped and every privileged change is recorded.</small>
        </div>
      </section>
      <footer className="landing-footer">Built for deadline-heavy weeks and very little sleep.</footer>
    </main>
  );
}

export default function Home() {
  const { user, profile, loading, error } = useAuth();
  if (!firebaseConfigured) {
    return (
      <main className="setup-page">
        <Brand />
        <div className="setup-card">
          <p className="eyebrow">SETUP REQUIRED</p>
          <h1>Connect your Firebase project</h1>
          <p>Copy <code>.env.example</code> to <code>apps/web/.env.local</code>, add the Firebase web configuration, then restart the development server.</p>
        </div>
      </main>
    );
  }
  if (loading) return <main className="loading-page"><Brand /><div className="loader" /><p>Loading your command center…</p></main>;
  if (!user || !profile) return <Login />;
  if (error) return <main className="loading-page"><Brand /><p className="form-error">{error}</p></main>;
  return <Dashboard />;
}
