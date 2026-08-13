'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/actions/notifications'

/**
 * The in-app inbox.
 *
 * Loads lazily — the list is fetched when the dropdown is first opened rather
 * than on every page render — and takes its initial unread count from the
 * server-rendered layout so the badge is correct on first paint.
 */
export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [, startTransition] = useTransition()

  // Derived rather than held in state: before the list loads the badge uses the
  // server-rendered count, and once loaded it follows the list — which is also
  // what the optimistic updates below mutate. Nothing to keep in sync.
  const unread = items ? items.filter(i => !i.read).length : initialUnreadCount

  useEffect(() => {
    if (!open || items !== null) return
    let cancelled = false
    getMyNotifications()
      .then(rows => {
        if (!cancelled) setItems(rows)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [open, items])

  function handleOpenItem(item: NotificationItem) {
    if (!item.read) {
      setItems(rows => rows?.map(r => (r.id === item.id ? { ...r, read: true } : r)) ?? rows)
      startTransition(async () => {
        await markNotificationRead(item.id)
      })
    }
    if (item.linkUrl) {
      setOpen(false)
      router.push(item.linkUrl)
    }
  }

  function handleMarkAll() {
    setItems(rows => rows?.map(r => ({ ...r, read: true })) ?? rows)
    startTransition(async () => {
      await markAllNotificationsRead()
      router.refresh()
    })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <button
            aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
            className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none"
          />
        }
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={handleMarkAll}>
              Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-96 overflow-y-auto">
          {items === null && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {items !== null && items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing here yet.
            </p>
          )}
          {items?.map(item => (
            <button
              key={item.id}
              onClick={() => handleOpenItem(item)}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent ${
                item.read ? '' : 'bg-accent/40'
              }`}
            >
              <div className="flex w-full items-start gap-2">
                {!item.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                <span className={`text-sm ${item.read ? 'font-normal' : 'font-medium'}`}>
                  {item.title}
                </span>
              </div>
              <span className="pl-0 text-xs text-muted-foreground">{item.body}</span>
              <span className="text-[11px] text-muted-foreground/70">{relativeTime(item.createdAt)}</span>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
