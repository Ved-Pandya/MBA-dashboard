"use client";

import { useEffect, useState } from "react";
import { ModalDrawer } from "./modal-drawer";
import { AppIcon } from "./app-icon";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { NotificationRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { callFunction, readableError } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";
import { usePwa } from "./pwa-provider";

export function NotificationsPanel({ open, onClose, onUnreadChange }: { open: boolean; onClose: () => void; onUnreadChange?: (count: number) => void }) {
  const { user } = useAuth();
  const { openSetup, pushState } = usePwa();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(getFirebase().db, "users", user.uid, "notifications"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
      setNotifications(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as NotificationRecord));
    }, (err) => setError(readableError(err)));
  }, [user]);
  const unread = notifications.filter((item) => !item.readAt);
  useEffect(() => { onUnreadChange?.(unread.length); }, [unread.length, onUnreadChange]);
  async function markAllRead() {
    if (!unread.length) return;
    setBusy(true); setError("");
    try { await callFunction("markNotificationsRead", { notificationIds: unread.map((item) => item.id) }); }
    catch (err) { setError(readableError(err)); }
    finally { setBusy(false); }
  }
  if (!open) return null;
  return (
    <>
      <ModalDrawer title="Notifications" onClose={onClose}>
        <div className="drawer-head"><div><h2>Notifications <span>{unread.length}</span></h2></div><button className="icon-button" onClick={onClose} aria-label="Close notifications"><AppIcon name="close" /></button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="text-button" onClick={markAllRead} disabled={busy || !unread.length}>Mark all as read</button>
        <button className="text-button app-setup-link" onClick={() => { onClose(); openSetup(); }}>App setup - {pushState === "enabled" ? "notifications on" : "action needed"}</button>
        <div className="notification-list">
          {!notifications.length && <div className="empty-state"><h3>Quiet for now</h3><p>Deadline alerts will appear here.</p></div>}
          {notifications.map((item) => <article key={item.id} className={item.readAt ? "notification read" : "notification"}><i /><div><strong>{item.title}</strong><p>{item.body}</p><small>{item.createdAt ? formatDeadline(item.createdAt) : "Just now"}</small></div></article>)}
        </div>
      </ModalDrawer>
    </>
  );
}
