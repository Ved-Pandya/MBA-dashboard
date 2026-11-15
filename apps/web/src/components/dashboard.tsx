"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "./auth-provider";
import { StudentView } from "./student-view";
import { NotificationsPanel } from "./notifications-panel";
const ManagementView = dynamic(() => import("./management-view").then((module) => module.ManagementView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const ComplianceView = dynamic(() => import("./compliance-view").then((module) => module.ComplianceView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const AdminView = dynamic(() => import("./admin-view").then((module) => module.AdminView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const PocSetupView = dynamic(() => import("./poc-setup-view").then((module) => module.PocSetupView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const TimetableView = dynamic(() => import("./timetable-view").then((module) => module.TimetableView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const AcademicsView = dynamic(() => import("./academics-view").then((module) => module.AcademicsView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const OpportunitiesView = dynamic(() => import("./opportunities-view").then((module) => module.OpportunitiesView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const ReportsView = dynamic(() => import("./reports-view").then((module) => module.ReportsView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const CrBoardView = dynamic(() => import("./cr-board-view").then((module) => module.CrBoardView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const SessionsView = dynamic(() => import("./sessions-view").then((module) => module.SessionsView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const PollsView = dynamic(() => import("./polls-view").then((module) => module.PollsView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
const PlacementStatusView = dynamic(() => import("./placement-status-view").then((module) => module.PlacementStatusView), { loading: () => <p className="page-wrap" role="status">Loading view...</p> });
import { AppSetupPanel } from "./app-setup";
import { usePwa } from "./pwa-provider";

import { AppIcon, Brand, type IconName } from "./app-icon";

type View = "today" | "academics" | "opportunities" | "more" | "sessions" | "polls" | "forms" | "compliance" | "crBoard" | "poc" | "placement" | "timetable" | "reports" | "admin";
type NavItem = { id: View; label: string; icon: IconName; description?: string };
const studentNav: NavItem[] = [
  { id: "today", label: "Today", icon: "today", description: "Your deadlines and things to answer" },
  { id: "academics", label: "Academics", icon: "book", description: "Classes, assignments and exams" },
  { id: "opportunities", label: "Opportunities", icon: "briefcase", description: "Competitions and internships" },
  { id: "sessions", label: "Placement sessions", icon: "people", description: "Attendance and session history" },
  { id: "polls", label: "Batch polls", icon: "poll", description: "Questions from your batch" },
];

export function Dashboard() {
  const { profile, signOutUser } = useAuth();
  const { online, openSetup } = usePwa();
  const [view, setViewState] = useState<View>("today");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const isWingPoc = Boolean(Object.keys(profile?.scopes.wingPocWings ?? {}).length);
  const isSubjectPoc = Boolean(Object.keys(profile?.scopes.subjectPocOfferings ?? {}).length);
  const governor = Boolean(profile?.roles.cr || profile?.roles.systemAdmin);
  const management = useMemo<NavItem[]>(() => [
    { id: "forms" as const, label: "Wing forms", icon: "form" as const, description: "Publish and manage your wing's deadlines", show: isWingPoc },
    { id: "compliance" as const, label: "Task compliance", icon: "report" as const, description: "Find pending responses and export records", show: isWingPoc || isSubjectPoc || governor },
    { id: "crBoard" as const, label: "CR Board", icon: "board" as const, description: "Shared work for class representatives", show: governor },
    { id: "reports" as const, label: "Reports", icon: "report" as const, description: "Competition and internship responses by wing", show: isWingPoc || governor },
    { id: "poc" as const, label: "POC setup", icon: "people" as const, description: "Assign responsibilities and subject seats", show: governor },
    { id: "placement" as const, label: "Placement status", icon: "briefcase" as const, description: "Manage private placement eligibility", show: governor },
    { id: "timetable" as const, label: "Timetable setup", icon: "today" as const, description: "Import or correct a term timetable", show: governor },
    { id: "admin" as const, label: "System admin", icon: "settings" as const, description: "Roster, subjects and system health", show: Boolean(profile?.roles.systemAdmin) },
  ].filter((item) => item.show), [profile, isWingPoc, isSubjectPoc, governor]);
  const allowedViews = useMemo(() => new Set<View>([...studentNav.map((item) => item.id), "more", ...management.map((item) => item.id)]), [management]);
  useEffect(() => {
    const applyUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("view") as View | null;
      setViewState(requested && allowedViews.has(requested) ? requested : "today");
      if (params.get("notifications") === "1") setNotificationsOpen(true);
    };
    applyUrl(); window.addEventListener("popstate", applyUrl);
    return () => window.removeEventListener("popstate", applyUrl);
  }, [allowedViews]);
  function setView(next: View) {
    if (next === view) return;
    setViewState(next);
    const url = new URL(window.location.href); url.searchParams.set("view", next); url.searchParams.delete("notifications");
    window.history.pushState({}, "", url); window.scrollTo({ top: 0 });
  }
  if (!profile) return null;
  const current = [...studentNav, ...management].find((item) => item.id === view);
  const managing = management.some((item) => item.id === view);
  const role = profile.roles.systemAdmin ? "Administrator" : profile.roles.cr ? "Class representative" : isWingPoc ? `Wing ${Object.keys(profile.scopes.wingPocWings).join(", ")} POC` : isSubjectPoc ? "Subject POC" : "Student";
  const mobileNav: NavItem[] = [...studentNav.slice(0, 3), { id: "more", label: "My desk", icon: "menu" }];
  const navButton = (item: NavItem) => <button key={item.id} title={item.label} className={view === item.id ? "nav-item active" : "nav-item"} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)}><AppIcon name={item.icon} /><span>{item.label}</span></button>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    {!online && <div className="offline-banner" role="status">You're offline. Reconnect to view updates or save changes.</div>}
    <aside className="sidebar">
      <div className="rail-brand"><Brand /><span className="batch-label">MBA workspace</span></div>
      <div className="rail-scroll"><nav aria-label="My desk"><h2 className="nav-group-title">My desk</h2>{studentNav.map(navButton)}</nav>
      {management.length > 0 && <nav className="management-nav" aria-label="Management"><h2 className="nav-group-title">Manage batch</h2>{management.map(navButton)}</nav>}</div>
      <div className="sidebar-foot"><div className="user-chip"><strong>{profile.displayName}</strong><span>{role}</span><small>{profile.rollNumber} · Section {profile.sectionId}</small></div><button className="signout-button" onClick={() => void signOutUser()}><AppIcon name="logout" />Sign out</button></div>
    </aside>
    <main className="workspace" id="main-content">
      <header className="workspace-header"><div className="mobile-brand"><Brand /></div><div className="workspace-location"><span>{managing ? "Manage batch" : "My desk"}</span><AppIcon name="chevron" /><strong>{current?.label ?? "My desk"}</strong></div><div className="workspace-tools"><button className="utility-link" aria-label="App setup" onClick={openSetup}><AppIcon name="settings" /><span>App setup</span></button><button className="inbox-button" aria-label="Notifications" onClick={() => setNotificationsOpen(true)}><AppIcon name="bell" /><span>Inbox</span>{unread > 0 && <b>{unread}</b>}</button></div></header>
      {view === "today" && <StudentView onNavigate={setView} />}{view === "academics" && <AcademicsView />}{view === "opportunities" && <OpportunitiesView />}{view === "sessions" && <SessionsView />}{view === "polls" && <PollsView />}{view === "forms" && <ManagementView />}{view === "compliance" && <ComplianceView />}{view === "crBoard" && <CrBoardView />}{view === "reports" && <ReportsView />}{view === "poc" && <PocSetupView />}{view === "placement" && <PlacementStatusView />}{view === "timetable" && <TimetableView />}{view === "admin" && <AdminView />}
      {view === "more" && <div className="page-wrap desk-page"><header className="page-heading"><div><h1>My desk</h1><p>{profile.displayName} · {role} · Wing {profile.wingId}</p></div></header><div className="desk-directory"><section><h2>Batch life</h2><div className="directory-list">{studentNav.slice(1).map((item) => <button key={item.id} onClick={() => setView(item.id)}><AppIcon name={item.icon} /><span><strong>{item.label}</strong><small>{item.description}</small></span><AppIcon name="chevron" /></button>)}</div></section>{management.length > 0 && <section><h2>Manage batch</h2><div className="directory-list">{management.map((item) => <button key={item.id} onClick={() => setView(item.id)}><AppIcon name={item.icon} /><span><strong>{item.label}</strong><small>{item.description}</small></span><AppIcon name="chevron" /></button>)}</div></section>}<section><h2>Account</h2><div className="directory-list"><button onClick={openSetup}><AppIcon name="settings" /><span><strong>Install & notification settings</strong><small>Set up this device for deadline alerts</small></span><AppIcon name="chevron" /></button><button onClick={() => void signOutUser()}><AppIcon name="logout" /><span><strong>Sign out</strong><small>{profile.rollNumber}</small></span><AppIcon name="chevron" /></button></div></section></div></div>}
    </main>
    <nav className="mobile-nav" aria-label="Main navigation">{mobileNav.map((item) => { const active = view === item.id || item.id === "more" && (managing || view === "sessions" || view === "polls"); return <button key={item.id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => setView(item.id)}><AppIcon name={item.icon} /><span>{item.label}</span></button>; })}</nav>
    <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} onUnreadChange={setUnread} /><AppSetupPanel />
  </div>;
}
