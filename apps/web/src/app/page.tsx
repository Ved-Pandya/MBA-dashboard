"use client";

import { useState, type FormEvent } from "react";
import { firebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import { Dashboard } from "@/components/dashboard";

import { AppIcon, Brand } from "@/components/app-icon";

function Login() {
  const { signIn, loading, error } = useAuth();
  const [rollNumber, setRollNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); await signIn(rollNumber, password); }
  return <main className="login-page"><header className="landing-nav"><Brand /><span>For your MBA batch</span></header>
    <div className="login-grid"><section className="login-copy"><h1>Keep the day<br />in order<span>.</span></h1><p>Deadlines, academic dates and the replies your batch is waiting on. A shared place to keep things moving.</p><dl className="login-index"><div><dt>Your next deadline</dt><dd>Know what needs doing and when.</dd></div><div><dt>Your batch, connected</dt><dd>Answer polls, sessions and registration requests.</dd></div><div><dt>Your responsibility, clear</dt><dd>Publish to the right people. Follow up with the facts.</dd></div></dl></section>
    <section className="login-form-panel"><h2>Sign in</h2><p>Use your roll number and the password issued by your administrator.</p><form className="login-form" onSubmit={submit}>
      <label htmlFor="login-roll">Roll number</label><input id="login-roll" value={rollNumber} onChange={(event) => setRollNumber(event.target.value.toUpperCase())} autoComplete="username" autoCapitalize="characters" spellCheck={false} pattern="(?:24|26)M2[0-9]{3}" placeholder="26M2301" required />
      <label htmlFor="login-password">Password</label><div className="password-field"><input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}<button className="sign-in-button" disabled={loading}>{loading ? "Signing in…" : "Sign in"}<AppIcon name="arrow" /></button>
    </form><p className="access-help">Need access or a new password?<br />Contact your system administrator.</p></section></div>
    <footer className="landing-footer"><span>DeadlineOS</span><span>All dates & times in IST</span></footer>
  </main>;
}

export default function Home() {
  const { user, profile, loading, error, signOutUser } = useAuth();
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
  if (user && error) return <main className="loading-page"><Brand /><p className="form-error" role="alert">{error}</p><div className="form-actions"><button className="secondary-button" onClick={() => window.location.reload()}>Try again</button><button className="secondary-button" onClick={() => void signOutUser()}>Sign out</button></div></main>;
  if (!user || !profile) return <Login />;
  return <Dashboard />;
}
