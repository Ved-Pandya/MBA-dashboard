"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-provider";
import { StudentView } from "./student-view";
import { NotificationsPanel } from "./notifications-panel";
import { ManagementView } from "./management-view";
import { ComplianceView } from "./compliance-view";
import { AdminView } from "./admin-view";
import { PocSetupView } from "./poc-setup-view";
import { TimetableView } from "./timetable-view";
import { AcademicsView } from "./academics-view";
import { OpportunitiesView } from "./opportunities-view";
import { ReportsView } from "./reports-view";
import { CrBoardView } from "./cr-board-view";
import { SessionsView } from "./sessions-view";
import { PollsView } from "./polls-view";
import { AppSetupPanel } from "./app-setup";
import { usePwa } from "./pwa-provider";

type View = "today" | "academics" | "opportunities" | "more" | "sessions" | "polls" | "forms" | "compliance" | "crBoard" | "poc" | "timetable" | "reports" | "admin";
type PrimaryView = "today" | "academics" | "opportunities" | "more";

function Brand() { return <div className="brand brand-small"><span className="brand-mark"><i /><i /><i /></span><span>Deadline<span>OS</span></span></div>; }

export function Dashboard() {
  const { profile, signOutUser } = useAuth(); const { online } = usePwa(); const [view, setViewState] = useState<View>("today"); const [notificationsOpen, setNotificationsOpen] = useState(false);
  const isWingPoc = Boolean(Object.keys(profile?.scopes.wingPocWings ?? {}).length); const isSubjectPoc = Boolean(Object.keys(profile?.scopes.subjectPocOfferings ?? {}).length); const isGroomingPoc = Boolean(profile?.scopes.batchPocRoles?.grooming); const isCasePoc = Boolean(profile?.scopes.batchPocRoles?.caseCompetition); const isPoc = isWingPoc || isSubjectPoc || isGroomingPoc || isCasePoc; const governor = Boolean(profile?.roles.cr || profile?.roles.systemAdmin);
  const primary = useMemo(() => [{ id: "today" as const, label: "Home", icon: "⌂" }, { id: "academics" as const, label: "Academics", icon: "▤" }, { id: "opportunities" as const, label: "Opportunities", icon: "◎" }, { id: "more" as const, label: "More", icon: "☰" }], []);
  const management = useMemo(() => [{ id: "forms" as const, label: "Wing forms", show: isWingPoc }, { id: "compliance" as const, label: "Task compliance", show: isWingPoc || isSubjectPoc || governor }, { id: "crBoard" as const, label: "CR Board", show: governor }, { id: "reports" as const, label: "Reports", show: isWingPoc || isCasePoc || governor }, { id: "poc" as const, label: "POC setup", show: governor }, { id: "timetable" as const, label: "Timetable setup", show: governor }, { id: "admin" as const, label: "System admin", show: Boolean(profile?.roles.systemAdmin) }].filter((item) => item.show), [isWingPoc, isSubjectPoc, isCasePoc, governor, profile]);
  const allowedViews = useMemo(() => new Set<View>([...primary.map((item) => item.id), "sessions", "polls", ...management.map((item) => item.id)]), [primary, management]);
  useEffect(() => { const applyUrl = () => { const params = new URLSearchParams(window.location.search); const requested = params.get("view") as View | null; setViewState(requested && allowedViews.has(requested) ? requested : "today"); if (params.get("notifications") === "1") setNotificationsOpen(true); }; applyUrl(); window.addEventListener("popstate", applyUrl); return () => window.removeEventListener("popstate", applyUrl); }, [allowedViews]);
  function setView(next: View) { setViewState(next); const url = new URL(window.location.href); url.searchParams.set("view", next); url.searchParams.delete("notifications"); window.history.replaceState({}, "", url); }
  if (!profile) return null;
  const activePrimary: PrimaryView = view === "today" || view === "academics" || view === "opportunities" ? view : "more";
  const roleLabel = profile.roles.systemAdmin ? "System admin" : profile.roles.cr ? `CR · Section ${profile.sectionId}` : isPoc ? "Point of contact" : `Section ${profile.sectionId} · Wing ${profile.wingId}`;

  return <div className="app-shell">{!online && <div className="offline-banner">You are offline. Reconnect before viewing or changing data.</div>}<aside className="sidebar"><Brand /><nav aria-label="Main navigation">{primary.map((item) => <button key={item.id} className={activePrimary === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>{management.length > 0 && <nav className="management-nav" aria-label="Management"><small>MANAGE</small>{management.map((item) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}><span>›</span>{item.label}</button>)}</nav>}<div className="sidebar-foot"><button className="nav-item" onClick={() => setNotificationsOpen(true)}><span>◉</span>Notifications</button><div className="user-chip"><div className="avatar">{profile.displayName.slice(0, 2).toUpperCase()}</div><div><strong>{profile.displayName}</strong><small>{roleLabel}</small></div><button className="icon-button" onClick={signOutUser} aria-label="Sign out">↗</button></div></div></aside>
    <main className="workspace"><header className="mobile-header"><Brand /><button className="notification-button" onClick={() => setNotificationsOpen(true)}>Alerts</button></header>{view === "today" && <StudentView />}{view === "academics" && <AcademicsView />}{view === "opportunities" && <OpportunitiesView />}{view === "sessions" && <SessionsView />}{view === "polls" && <PollsView />}{view === "forms" && <ManagementView />}{view === "compliance" && <ComplianceView />}{view === "crBoard" && <CrBoardView />}{view === "reports" && <ReportsView />}{view === "poc" && <PocSetupView />}{view === "timetable" && <TimetableView />}{view === "admin" && <AdminView />}{view === "more" && <div className="page-wrap"><header className="page-heading"><div><p className="eyebrow">MORE</p><h1>Community and account</h1><p>Open a focused area without crowding your main navigation.</p></div></header><div className="more-grid"><button className="panel more-card" onClick={() => setView("polls")}><span>◫</span><div><h2>General polls</h2><p>Answer named batch polls.</p></div></button><button className="panel more-card" onClick={() => setView("sessions")}><span>✓</span><div><h2>Placement sessions</h2><p>Confirm your attendance intention.</p></div></button><button className="panel more-card" onClick={() => setNotificationsOpen(true)}><span>◉</span><div><h2>Notifications</h2><p>Review alerts and updates.</p></div></button>{management.map((item) => <button className="panel more-card" key={item.id} onClick={() => setView(item.id)}><span>›</span><div><h2>{item.label}</h2><p>Open your authorized management tools.</p></div></button>)}<button className="panel more-card" onClick={signOutUser}><span>↗</span><div><h2>Sign out</h2><p>{profile.rollNumber}</p></div></button></div></div>}</main>
    <nav className="mobile-nav">{primary.map((item) => <button key={item.id} className={activePrimary === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav><NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} /><AppSetupPanel />
  </div>;
}
