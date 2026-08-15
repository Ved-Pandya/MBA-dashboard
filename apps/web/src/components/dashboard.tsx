"use client";

import { useMemo, useState } from "react";
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

type View = "today" | "academics" | "opportunities" | "teams" | "forms" | "compliance" | "crBoard" | "poc" | "timetable" | "reports" | "admin";

function Brand() {
  return <div className="brand brand-small"><span className="brand-mark"><i /><i /><i /></span><span>Deadline<span>OS</span></span></div>;
}

export function Dashboard() {
  const { profile, signOutUser } = useAuth();
  const [view, setView] = useState<View>("today");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const isWingPoc = Boolean(Object.keys(profile?.scopes.wingPocWings ?? {}).length);
  const isSubjectPoc = Boolean(Object.keys(profile?.scopes.subjectPocOfferings ?? {}).length);
  const isPoc = isWingPoc || isSubjectPoc;
  const governor = Boolean(profile?.roles.cr || profile?.roles.systemAdmin);
  const navigation = useMemo(() => [
    { id: "today" as const, label: "My day", icon: "1", show: true },
    { id: "academics" as const, label: isSubjectPoc ? "Academic calendar" : "Academics", icon: "A", show: true },
    { id: "opportunities" as const, label: "Opportunities", icon: "O", show: true },
    { id: "teams" as const, label: "My teams", icon: "T", show: true },
    { id: "forms" as const, label: "Wing forms", icon: "F", show: isWingPoc },
    { id: "compliance" as const, label: "Task compliance", icon: "C", show: isPoc || governor },
    { id: "crBoard" as const, label: "CR Board", icon: "B", show: governor },
    { id: "reports" as const, label: "Reports", icon: "R", show: isWingPoc || governor },
    { id: "poc" as const, label: "POC setup", icon: "P", show: governor },
    { id: "timetable" as const, label: "Timetable", icon: "W", show: governor },
    { id: "admin" as const, label: "Admin", icon: "S", show: Boolean(profile?.roles.systemAdmin) },
  ].filter((item) => item.show), [isPoc, isWingPoc, isSubjectPoc, governor, profile]);

  if (!profile) return null;
  const roleLabel = profile.roles.systemAdmin ? "System admin" : profile.roles.cr ? `CR · Section ${profile.sectionId}` : isPoc ? "Point of contact" : `Section ${profile.sectionId} · Wing ${profile.wingId}`;

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <nav aria-label="Main navigation">{navigation.map((item) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-foot"><button className="nav-item" onClick={() => setNotificationsOpen(true)}><span>N</span>Notifications</button><div className="user-chip"><div className="avatar">{profile.displayName.slice(0, 2).toUpperCase()}</div><div><strong>{profile.displayName}</strong><small>{roleLabel}</small></div><button className="icon-button" onClick={signOutUser} aria-label="Sign out">↗</button></div></div>
    </aside>
    <main className="workspace">
      <header className="mobile-header"><Brand /><button className="notification-button" onClick={() => setNotificationsOpen(true)}>Alerts</button></header>
      {view === "today" && <StudentView />}
      {view === "academics" && <AcademicsView />}
      {view === "opportunities" && <OpportunitiesView />}
      {view === "teams" && <OpportunitiesView mode="teams" />}
      {view === "forms" && <ManagementView />}
      {view === "compliance" && <ComplianceView />}
      {view === "crBoard" && <CrBoardView />}
      {view === "reports" && <ReportsView />}
      {view === "poc" && <PocSetupView />}
      {view === "timetable" && <TimetableView />}
      {view === "admin" && <AdminView />}
    </main>
    <nav className="mobile-nav">{navigation.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
    <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
  </div>;
}
