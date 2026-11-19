"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AcademicEventRecord } from "@/lib/models";
import { academicDateKey, calendarMonthDays, shiftCalendarDay, shiftCalendarMonth } from "@/lib/academic-calendar";
import { AppIcon } from "./app-icon";
import "@/app/academic-calendar.css";

const types = { assignment_deadline: "Assignments", pre_read: "Pre-reads", quiz: "Quizzes", midterm: "Midterms", endterm: "Endterms" };
const fullDate = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const monthDate = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const wallDate = (key: string) => new Date(`${key}T00:00:00Z`);

export function AcademicCalendar({ events, now, loading, renderEvent }: { events: AcademicEventRecord[]; now: number; loading: boolean; renderEvent: (event: AcademicEventRecord) => ReactNode }) {
  const today = academicDateKey(now);
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [eventType, setEventType] = useState("all");
  const table = useRef<HTMLTableElement>(null);
  const focusPending = useRef(false);
  const days = useMemo(() => calendarMonthDays(month), [month]);
  const byDate = useMemo(() => {
    const grouped = new Map<string, AcademicEventRecord[]>();
    for (const event of events) {
      if (eventType !== "all" && event.eventType !== eventType) continue;
      const key = academicDateKey(event.occursAt.toDate());
      const day = grouped.get(key) ?? [];
      day.push(event); grouped.set(key, day);
    }
    return grouped;
  }, [events, eventType]);
  const monthCount = days.filter(day => day.startsWith(month)).reduce((total, day) => total + (byDate.get(day)?.length ?? 0), 0);
  const selectedEvents = byDate.get(selected) ?? [];

  function selectDate(key: string, focus = false) {
    focusPending.current = focus;
    setSelected(key); setMonth(key.slice(0, 7));
  }
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    table.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected, month]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    const weekday = (wallDate(key).getUTCDay() + 6) % 7;
    const destination = ({ ArrowLeft: () => shiftCalendarDay(key, -1), ArrowRight: () => shiftCalendarDay(key, 1), ArrowUp: () => shiftCalendarDay(key, -7), ArrowDown: () => shiftCalendarDay(key, 7), Home: () => shiftCalendarDay(key, -weekday), End: () => shiftCalendarDay(key, 6 - weekday), PageUp: () => shiftCalendarMonth(key, -1), PageDown: () => shiftCalendarMonth(key, 1) } as Record<string, () => string>)[event.key];
    if (!destination) return;
    event.preventDefault(); selectDate(destination(), true);
  }

  return <section className="academic-calendar" aria-label="Academic calendar" aria-busy={loading}>
    <div className="academic-calendar-toolbar">
      <div><h2 id="calendar-month" aria-live="polite">{monthDate.format(wallDate(`${month}-01`))}</h2><p>{loading ? "Loading academic dates…" : `${monthCount} ${monthCount === 1 ? "academic date" : "academic dates"} this month`} · IST</p></div>
      <div className="calendar-controls"><button className="icon-button calendar-previous" aria-label="Previous month" onClick={() => selectDate(shiftCalendarMonth(selected, -1))}><AppIcon name="chevron" /></button><button className="secondary-button" onClick={() => selectDate(today)}>Today</button><button className="icon-button" aria-label="Next month" onClick={() => selectDate(shiftCalendarMonth(selected, 1))}><AppIcon name="chevron" /></button></div>
      <label className="calendar-filter">Event type<select value={eventType} onChange={event => setEventType(event.target.value)}><option value="all">All academic dates</option>{Object.entries(types).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    </div>
    <div className="academic-calendar-layout">
      <div className="academic-calendar-month">
        <table ref={table} className="academic-month-table" aria-labelledby="calendar-month">
          <thead><tr>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => <th scope="col" key={day}><abbr title={day}>{day.slice(0, 3)}</abbr></th>)}</tr></thead>
          <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(key => {
            const items = byDate.get(key) ?? [];
            return <td key={key}><button data-date={key} className={`calendar-day${key.startsWith(month) ? "" : " is-outside"}${key === selected ? " is-selected" : ""}`} aria-label={`${fullDate.format(wallDate(key))}, ${items.length} ${items.length === 1 ? "academic event" : "academic events"}`} aria-pressed={key === selected} aria-current={key === today ? "date" : undefined} tabIndex={key === selected ? 0 : -1} onClick={() => selectDate(key)} onKeyDown={event => navigate(event, key)}>
              <span className="calendar-date-number">{Number(key.slice(-2))}</span>
              <span className="calendar-event-previews" aria-hidden="true">{items.slice(0, 2).map(item => <span className={`calendar-event-preview calendar-type-${item.eventType}`} key={item.id}>{item.title}</span>)}{items.length > 2 && <span className="calendar-more">+{items.length - 2} more</span>}</span>
              {items.length > 0 && <span className="calendar-mobile-count" aria-hidden="true">{items.length}</span>}
            </button></td>;
          })}</tr>)}</tbody>
        </table>
        <p className="calendar-keyboard-help">Select a day to see details. Use arrow keys to move between dates.</p>
      </div>
      <section className="calendar-day-agenda" aria-label="Selected day events">
        <div className="calendar-agenda-heading"><h2>{new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(wallDate(selected))}</h2><span>{selected === today ? "Today · " : ""}{selectedEvents.length} {selectedEvents.length === 1 ? "event" : "events"}</span></div>
        <div aria-live="polite" className="calendar-selection-announcement">{loading ? "Loading academic dates…" : `${fullDate.format(wallDate(selected))}: ${selectedEvents.length} ${selectedEvents.length === 1 ? "event" : "events"}`}</div>
        {loading ? <p className="quiet-note" role="status">Loading academic dates…</p> : selectedEvents.length ? selectedEvents.map(item => <div className="calendar-agenda-event" key={item.id}><time dateTime={item.occursAt.toDate().toISOString()}>{time.format(item.occursAt.toDate())}{item.endsAt ? ` – ${time.format(item.endsAt.toDate())}` : ""} IST</time>{renderEvent(item)}</div>) : <p className="quiet-note">{eventType === "all" ? "No academic events on this day. Choose another date to see what’s scheduled." : "No matching events on this day. Choose another date or change the event type."}</p>}
      </section>
    </div>
  </section>;
}
