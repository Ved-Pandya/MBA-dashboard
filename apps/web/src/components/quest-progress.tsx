"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AppIcon } from "./app-icon";
import { questProgress } from "@/lib/quest";

export function QuestProgress({ completed, pending, loading, onStart, onReview }: {
  completed: number; pending: number; loading: boolean; onStart: () => void; onReview: () => void;
}) {
  const { xp, level, steps, remaining } = questProgress(completed);
  return <section className="quest-banner" aria-label="Your quest progress" aria-busy={loading}>
    <div className="quest-intro"><h2>Small steps.<br />Big wins<span>.</span></h2><p>{pending ? "Your next win is one deadline away. Pick a task, get it done, make room for the good stuff." : "A little progress goes a long way. Check your dates and see what’s coming next."}</p><button className="quest-start" onClick={onStart} disabled={loading}><AppIcon name={pending ? "play" : "book"} />{pending ? "Pick my next task" : "Explore academics"}<AppIcon name="arrow" /></button></div>
    <div className="quest-journey"><div className="quest-level"><span><AppIcon name="flag" />Level {level}</span><strong>{loading ? "Loading…" : `${xp} XP`}</strong></div><div className="quest-track" role="progressbar" aria-label={`Progress to level ${level + 1}`} aria-valuemin={0} aria-valuemax={5} aria-valuenow={steps} aria-valuetext={`${steps} of 5 tasks completed toward level ${level + 1}`} style={{ "--quest-progress": Math.max(0, (steps - 1) / 4) } as CSSProperties}>{Array.from({ length: 5 }, (_, i) => <span className={`quest-stop ${i < steps ? "is-earned" : ""} ${i === steps ? "is-next" : ""}`} key={i}>{i === 4 ? <AppIcon name="trophy" /> : i < steps ? <AppIcon name="check" /> : <AppIcon name="spark" />}</span>)}</div><p><strong>{remaining} {remaining === 1 ? "task" : "tasks"}</strong> to your next level</p><div className="quest-rule"><span>25 XP per completed deadline</span><button onClick={onReview}>See my wins<AppIcon name="arrow" /></button></div></div>
  </section>;
}

const SPRINT_SECONDS = 15 * 60;

export function FocusSprint() {
  const [remaining, setRemaining] = useState(SPRINT_SECONDS);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) setEndsAt(null);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [endsAt]);
  function toggle() {
    if (endsAt !== null) { setRemaining(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))); setEndsAt(null); }
    else { const seconds = remaining || SPRINT_SECONDS; setRemaining(seconds); setEndsAt(Date.now() + seconds * 1000); }
  }
  return <section className={`focus-sprint ${endsAt !== null ? "is-running" : ""}`} aria-label="Focus sprint"><div className="focus-title"><AppIcon name="bolt" /><h2>Focus sprint</h2><span>15 min</span></div><p>One task. A little headspace.</p><div className="focus-controls"><span className="focus-time" role="timer" aria-label="Time remaining">{String(Math.floor(remaining / 60)).padStart(2, "0")}<span>:</span>{String(remaining % 60).padStart(2, "0")}</span><button className="focus-toggle" onClick={toggle} aria-label={endsAt !== null ? "Pause focus sprint" : remaining === 0 ? "Start another focus sprint" : "Start focus sprint"}><AppIcon name={endsAt !== null ? "pause" : "play"} /></button><button className="focus-reset" aria-label="Reset focus sprint" onClick={() => { setEndsAt(null); setRemaining(SPRINT_SECONDS); }}><AppIcon name="reset" /></button></div><p className="focus-status" role="status">{remaining === 0 ? "Sprint complete. Take a breather. You earned it." : endsAt !== null ? "You’ve got this. Keep going." : remaining < SPRINT_SECONDS ? "Paused. Ready when you are." : "Start a timer while you work. Stay on this page."}</p></section>;
}

export function QuestCelebration({ message, earned, onDismiss }: { message: string; earned: boolean; onDismiss: () => void }) {
  useEffect(() => { const timeout = window.setTimeout(onDismiss, 5000); return () => window.clearTimeout(timeout); }, [onDismiss]);
  return <div className={`quest-toast ${earned ? "is-earned" : ""}`}><div className="quest-toast-icon"><AppIcon name={earned ? "trophy" : "reset"} /></div><div role="status"><strong>{earned ? "One more win!" : "Progress updated"}</strong><span>{message}</span></div>{earned && <span className="xp-reward">+25 XP</span>}<button className="icon-button" aria-label="Dismiss progress update" onClick={onDismiss}><AppIcon name="close" /></button>{earned && <div className="quest-confetti" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>}</div>;
}
