'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Heart, MessageCircle, Search, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PageHeader,
  Panel,
  StatusBadge,
  SearchInput,
  FilterBar,
  NativeSelect,
  EmptyState,
  TableWrap,
  th,
  td,
} from '@/components/app/shared'
import { PlatformBadge } from '@/components/app/platform-badge'
import { api, type SocialPost, type PostStatus } from '@/lib/api'
import { fmtDate, fmt } from '@/lib/mock-data'

const statusOptions = ['All', 'Draft', 'Scheduled', 'Published', 'Failed'] as const

export default function SocialPostsPage() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')

  useEffect(() => {
    api.socialPosts.list().then(setPosts)
  }, [])

  const filtered = posts.filter((p) => {
    if (statusFilter !== 'All' && p.status !== statusFilter) return false
    if (search && !p.caption.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <PageHeader
        title="Social Posts"
        description="All your published, scheduled, and draft social content in one place."
        actions={
          <Button asChild>
            <a href="/social/composer">Create post</a>
          </Button>
        }
      />

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search posts…" />
        <NativeSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[...statusOptions]}
        />
      </FilterBar>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Search}
            title="No posts found"
            description="Create a new post or adjust your filters."
          />
        </Panel>
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="border-b border-border bg-muted">
              <tr>
                {['Caption', 'Platforms', 'Date', 'Status', 'Engagement'].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="group">
                  <td className={`${td} max-w-xs font-medium`}>
                    <span className="line-clamp-2">{p.caption}</span>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {p.platforms.map((pl) => (
                        <PlatformBadge key={pl} platform={pl} />
                      ))}
                    </div>
                  </td>
                  <td className={td}>{fmtDate(p.date)}</td>
                  <td className={td}>
                    <StatusBadge status={p.status} />
                  </td>
                  <td className={td}>
                    {p.likes ? (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Heart className="size-3" /> {fmt(p.likes)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="size-3" /> {fmt(p.comments!)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Share2 className="size-3" /> {fmt(p.shares!)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </div>
  )
}
