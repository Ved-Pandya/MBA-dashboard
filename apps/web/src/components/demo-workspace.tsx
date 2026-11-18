"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { DEMO_ACCOUNTS, DEMO_PRESENTATION_STEPS, type DemoCredential, type DemoSummary } from "@mba/domain";
import { getFirebase } from "@/lib/firebase";
import { callFunction, readableError } from "@/lib/callable";
import { AppIcon } from "./app-icon";

type StoredSummary = Pick<DemoSummary, "counts" | "generatedAt" | "reminderAt"> & { status?: string; phase?: string };

export function DemoWorkspace({ disabled, onBusyChange }: { disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [summary, setSummary] = useState<StoredSummary | null>(null);
  const [credentials, setCredentials] = useState<DemoCredential[]>([]);
  const [operation, setOperation] = useState<"inject" | "reset" | "clear" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const credentialsHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (credentials.length) credentialsHeading.current?.focus(); }, [credentials]);
  useEffect(() => onSnapshot(doc(getFirebase().db, "systemHealth", "demoData"), (snap) => setSummary(snap.exists() ? snap.data() as StoredSummary : null), (err) => setError(readableError(err))), []);
  const ready = summary?.status === "ready";
  const duration = DEMO_PRESENTATION_STEPS.reduce((total, step) => total + step.minutes, 0);
  const phase = ({ accounts: "Preparing the six demo sign-ins…", clearing: "Refreshing the tagged sample records…", writing: "Writing linked tasks, responses and report scenarios…" } as Record<string, string>)[summary?.phase ?? ""];
  const date = (value: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));

  async function prepare(resetPasswords = false) {
    if (disabled) return;
    if (resetPasswords && !window.confirm("Replace the six demo passwords? Existing demo passwords will stop working. Sample records and responses will stay as they are.")) return;
    if (resetPasswords) setCredentials([]);
    setOperation(resetPasswords ? "reset" : "inject"); onBusyChange(true); setMessage(""); setError("");
    try {
      if (resetPasswords) {
        const result = await callFunction<unknown, { credentials: DemoCredential[] }>("resetDemoPasswords", {});
        setCredentials(result.credentials);
        setMessage("Demo passwords reset. Copy the new passwords below before leaving. Sample records and responses are unchanged.");
        return;
      }
      const result = await callFunction<{ origin: string; resetPasswords: boolean }, DemoSummary>("prepareDemoData", { origin: window.location.origin, resetPasswords });
      setSummary({ ...result, status: "ready" });
      if (result.credentials.length) setCredentials(result.credentials);
      setMessage(result.credentials.length ? "Sample workspace ready. Copy the new passwords below before leaving this page." : "Sample records refreshed. Existing demo passwords still work; use Reset demo passwords if you need new ones.");
    } catch (err) { setError(resetPasswords ? readableError(err) : `${readableError(err)} Retry preparation after resolving any record collision.`); }
    finally { setOperation(null); onBusyChange(false); }
  }
  async function clear() {
    if (disabled || !window.confirm("Remove the tagged sample records and report-only students? The six demo login accounts and unrelated records will remain.")) return;
    setOperation("clear"); onBusyChange(true); setMessage(""); setError("");
    try {
      const result = await callFunction<unknown, { deleted: number }>("clearTestData", {});
      setSummary(null); setMessage(`${result.deleted} sample records removed. The six demo logins remain available.`);
    } catch (err) { setError(readableError(err)); }
    finally { setOperation(null); onBusyChange(false); }
  }
  return <section className="demo-workspace" aria-labelledby="demo-workspace-title">
    <div className="demo-workspace-heading"><div><h2 id="demo-workspace-title">Presentation workspace</h2><p>One click prepares linked sample records for a 14-minute walkthrough of every feature.</p></div><button className="primary-button" disabled={disabled} onClick={() => void prepare()}><AppIcon name="plus" />{operation === "inject" ? "Preparing sample data…" : "Prepare 15-minute demo"}</button></div>
    <p className="helper">Creates six protected demo logins, fictional feature records and 110 report-only students for pagination. Fresh deadlines are relative to injection time. Existing demo passwords are preserved.</p>
    <p className="helper">Sample data shares this project&apos;s catalogue and queries. Use a dedicated demo Firebase project for presentations. Injection does not replace unrelated records or send notifications to real students.</p>
    {operation && <p role="status" className="helper">{operation === "reset" ? "Replacing the six demo passwords…" : operation === "clear" ? "Removing tagged sample data…" : phase || "Preparing accounts and linked sample records…"}</p>}
    {message && <p role="status" className="success-banner">{message}</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {ready && summary && <div className="demo-manifest" aria-label="Sample data summary"><strong>Sample data ready</strong><p>Prepared {date(summary.generatedAt)}. Reminder check scheduled from {date(summary.reminderAt)}; actual delivery depends on maintenance and device permission.</p><dl>{Object.entries(summary.counts).map(([label, count]) => <div key={label}><dt>{label.replace(/([A-Z])/g, " $1").toLowerCase()}</dt><dd>{count}</dd></div>)}</dl></div>}
    {credentials.length > 0 && <section className="demo-credentials" aria-label="Demo sign-in credentials"><div className="panel-head"><h3 ref={credentialsHeading} tabIndex={-1}>Copy these passwords now</h3><button className="text-button" onClick={() => setCredentials([])}>Hide passwords</button></div><p className="helper">Passwords are shown only in this page session. They are not saved in Firestore or browser storage. Report-only students have no login.</p><div className="table-scroll"><table><thead><tr><th>Role</th><th>Roll number</th><th>Password</th></tr></thead><tbody>{credentials.map((item) => <tr key={item.rollNumber}><td>{item.role}</td><td><code>{item.rollNumber}</code></td><td><code className="demo-password">{item.password}</code></td></tr>)}</tbody></table></div></section>}
    <details className="demo-instructions"><summary>Demo accounts and presentation order<AppIcon name="chevron" /></summary><p className="helper">Keep your current System admin session. Open separate browser profiles for the other roles. Refreshing sample data resets the seeded responses, dates and reports.</p><div className="table-scroll"><table><thead><tr><th>Demo role</th><th>Roll number</th></tr></thead><tbody>{DEMO_ACCOUNTS.map((a) => <tr key={a.key}><td>{a.role}</td><td>{a.rollNumber}</td></tr>)}</tbody></table></div><p className="demo-duration">{duration}-minute presentation plan</p><ol className="demo-presentation-order">{DEMO_PRESENTATION_STEPS.map((step) => <li key={step.title}><strong>{step.title}</strong><span>{step.minutes} min · {step.role} · {step.view}</span><p>{step.detail}</p></li>)}</ol><a className="text-link" href="/demo/presentation-guide.html" target="_blank" rel="noreferrer">Open the 14-minute presentation script<AppIcon name="arrow" /></a></details>
    <div className="demo-maintenance-actions"><button className="secondary-button" disabled={disabled} onClick={() => void prepare(true)}>{operation === "reset" ? "Resetting demo passwords…" : "Reset demo passwords"}</button><button className="danger-button" disabled={disabled} onClick={() => void clear()}>Remove sample data</button><span className="helper">Removal affects tagged fixtures. Items you create separately during the demo are managed through their own lifecycle controls.</span></div>
  </section>;
}
