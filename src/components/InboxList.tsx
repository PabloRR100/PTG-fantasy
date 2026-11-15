import Link from "next/link";
import { markNotificationsRead } from "@/app/actions";
import { timeAgo, type InboxEntry } from "@/services/feed";

/** The Buzón list. Unread entries are marked; one button marks them all as read. */
export function InboxList({ entries, now = new Date() }: { entries: InboxEntry[]; now?: Date }) {
  const unread = entries.filter((e) => e.unread).length;
  return (
    <div className="stack">
      {unread > 0 && (
        <form action={markNotificationsRead}>
          <button type="submit" className="secondary">Marcar {unread === 1 ? "la notificación" : `las ${unread} notificaciones`} como leída{unread === 1 ? "" : "s"}</button>
        </form>
      )}
      {entries.length === 0 ? (
        <p className="empty-feed">No tienes notificaciones. Te avisaremos de pujas ganadas o perdidas y de cuándo abre el mercado.</p>
      ) : (
        <ul className="feed">
          {entries.map((e) => (
            <li key={e.id} className={`feed-item${e.unread ? " is-unread" : ""}`}>
              <div>
                <p><Link href={e.href}><strong>{e.title}</strong></Link>{e.unread && <span className="sr-only"> (sin leer)</span>}</p>
                <p>{e.body}</p>
                <p className="feed-meta"><time dateTime={e.created_at}>{timeAgo(e.created_at, now)}</time></p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
