"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { NotificationRecord } from "@/lib/models";
import { getFirebase } from "@/lib/firebase";
import { useAuth } from "./auth-provider";
import { callFunction } from "@/lib/callable";
import { formatDeadline } from "@/lib/date";

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(getFirebase().db, "users", user.uid, "notifications"), orderBy("createdAt", "desc"), limit(50)), (snap) => {
      setNotifications(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as NotificationRecord));
    });
  }, [user]);
  const unread = notifications.filter((item) => !item.readAt);
  async function markAllRead() {
    if (!unread.length) return;
    await callFunction("markNotificationsRead", { notificationIds: unread.map((item) => item.id) });
  }
  return (
    <>
      {open && <button className="drawer-backdrop" onClick={onClose} aria-label="Close notifications" />}
      <aside className={open ? "notification-drawer open" : "notification-drawer"} aria-hidden={!open}>
        <div className="drawer-head"><div><p className="eyebrow">INBOX</p><h2>Notifications <span>{unread.length}</span></h2></div><button className="icon-button" onClick={onClose}>×</button></div>
        <button className="text-button" onClick={markAllRead} disabled={!unread.length}>Mark all as read</button>
        <div className="notification-list">
          {!notifications.length && <div className="empty-state"><span>◌</span><h3>Quiet for now</h3><p>Deadline alerts will appear here.</p></div>}
          {notifications.map((item) => <article key={item.id} className={item.readAt ? "notification read" : "notification"}><i /><div><strong>{item.title}</strong><p>{item.body}</p><small>{item.createdAt ? formatDeadline(item.createdAt) : "Just now"}</small></div></article>)}
        </div>
      </aside>
    </>
  );
}
