"use client";

import { useMemo, useState } from "react";
import { useAuth } from "./auth-provider";
import { StudentView } from "./student-view";
import { NotificationsPanel } from "./notifications-panel";
import { ManagementView } from "./management-view";
import { ComplianceView } from "./compliance-view";
import { AdminView } from "./admin-view";

type View = "today" | "manage" | "compliance" | "admin";

function Brand() {
  return <div className="brand brand-small"><span className="brand-mark"><i /><i /><i /></span><span>Deadline<span>OS</span></span></div>;
}

export function Dashboard() {
  const { profile, signOutUser } = useAuth();
  const [view, setView] = useState<View>("today");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const isPoc = Boolean(Object.keys(profile?.scopes.wingPocWings ?? {}).length || Object.keys(profile?.scopes.subjectPocOfferings ?? {}).length);
  const navigation = useMemo(() => [
    { id: "today" as const, label: "My day", icon: "⌁", show: true },
    { id: "manage" as const, label: "Manage", icon: "+", show: isPoc },
    { id: "compliance" as const, label: "Compliance", icon: "◫", show: isPoc || profile?.roles.cr || profile?.roles.systemAdmin },
    { id: "admin" as const, label: "Admin", icon: "⚙", show: Boolean(profile?.roles.systemAdmin) },
  ].filter((item) => item.show), [isPoc, profile]);

  if (!profile) return null;
  const roleLabel = profile.roles.systemAdmin ? "System admin" : profile.roles.cr ? `CR · Section ${profile.sectionId}` : isPoc ? "Point of contact" : `Section ${profile.sectionId} · ${profile.wingId}`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" onClick={() => setNotificationsOpen(true)}><span>●</span>Notifications</button>
          <div className="user-chip">
            <div className="avatar">{profile.displayName.slice(0, 2).toUpperCase()}</div>
            <div><strong>{profile.displayName}</strong><small>{roleLabel}</small></div>
            <button className="icon-button" onClick={signOutUser} aria-label="Sign out">↗</button>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="mobile-header"><Brand /><button className="notification-button" onClick={() => setNotificationsOpen(true)}>Alerts</button></header>
        {view === "today" && <StudentView />}
        {view === "manage" && <ManagementView />}
        {view === "compliance" && <ComplianceView />}
        {view === "admin" && <AdminView />}
      </main>

      <nav className="mobile-nav">
        {navigation.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>
      <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}
