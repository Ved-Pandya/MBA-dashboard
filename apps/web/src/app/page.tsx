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
    <div className="login-grid"><section className="login-copy"><h1>Your MBA.<br />One quest<br /> at a time<span>.</span></h1><p>Big days start with small wins. Keep up with deadlines, show up for your batch, and turn “to do” into “done”.</p><div className="login-quest"><div className="login-quest-heading"><h2>How a win works</h2><AppIcon name="spark" /></div><ol><li><span><AppIcon name="flag" /></span><div><strong>Pick your next task</strong><small>Your deadlines, all in one place.</small></div></li><li><span><AppIcon name="check" /></span><div><strong>Submit it. Tick it off.</strong><small>The actual work comes first.</small></div></li><li><span><AppIcon name="trophy" /></span><div><strong>Watch your progress grow</strong><small>25 XP per deadline. Every five unlock a level.</small></div></li></ol></div><div className="login-footnote"><AppIcon name="bolt" /><span>A little less deadline dread.<br /><strong>A lot more “I’ve got this”.</strong></span></div></section>
    <section className="login-form-panel"><div className="login-welcome"><AppIcon name="play" /></div><h2>Ready, set, go.</h2><p>Sign in to your batch workspace.<br />Your next small win is waiting.</p><form className="login-form" onSubmit={submit}>
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
