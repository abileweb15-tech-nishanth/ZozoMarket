'use client'

import { useEffect, useState } from 'react'
import { Download, FileImage, FileVideo, Grid, List, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PageHeader,
  Panel,
  SearchInput,
  EmptyState,
  ConfirmDialog,
  FilterBar,
  Segmented,
  TableWrap,
  th,
  td,
} from '@/components/app/shared'
import { api, type MediaAsset } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type View = 'Grid' | 'List'

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('Grid')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<MediaAsset | null>(null)
  const [renameName, setRenameName] = useState('')

  useEffect(() => {
    api.media.list().then(setAssets)
  }, [])

  const filtered = assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()),
  )

  const handleUpload = () => {
    const newAsset: MediaAsset = {
      id: `m_${Date.now()}`,
      name: `new-upload-${Date.now()}.png`,
      type: 'Image',
      size: '500 KB',
      src: '/images/post-latte.png',
    }
    api.media.create(newAsset).then((a) => {
      setAssets((prev) => [a, ...prev])
      toast.success('File uploaded (simulated)')
    })
  }

  const handleDelete = (id: string) => {
    api.media.delete(id).then(() => {
      setAssets((prev) => prev.filter((a) => a.id !== id))
      toast.success('Asset deleted')
    })
  }

  const handleRename = () => {
    if (!renameTarget || !renameName.trim()) return
    api.media.rename(renameTarget.id, renameName.trim()).then((updated) => {
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      setRenameTarget(null)
      toast.success('Asset renamed')
    })
  }

  const TypeIcon = ({ type }: { type: string }) =>
    type === 'Video' ? (
      <FileVideo className="size-4 text-chart-2" />
    ) : (
      <FileImage className="size-4 text-chart-1" />
    )

  return (
    <div>
      <PageHeader
        title="Media Library"
        description="Manage images, videos and assets for your campaigns."
        actions={
          <Button onClick={handleUpload}>
            <Upload /> Upload file
          </Button>
        }
      />

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search assets…" />
        <div className="ml-auto">
          <Segmented label="View" value={view} onChange={setView} options={['Grid', 'List'] as const} />
        </div>
      </FilterBar>

      {filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Search}
            title="No assets found"
            description="Upload files or adjust your search."
          />
        </Panel>
      ) : view === 'Grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((asset) => (
            <div
              key={asset.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className="relative flex aspect-square items-center justify-center bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.src}
                  alt={asset.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).src = ''
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="size-8"
                      onClick={() => {
                        setRenameTarget(asset)
                        setRenameName(asset.name)
                      }}
                      aria-label={`Rename ${asset.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="size-8"
                      onClick={() => toast.success('Download started (simulated)')}
                      aria-label={`Download ${asset.name}`}
                    >
                      <Download className="size-3.5" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="size-8"
                      onClick={() => setDeleteTarget(asset.id)}
                      aria-label={`Delete ${asset.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="px-3 py-2.5">
                <p className="truncate text-sm font-medium">{asset.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TypeIcon type={asset.type} />
                  {asset.type} · {asset.size}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <TableWrap>
          <table className="w-full">
            <thead className="border-b border-border bg-muted">
              <tr>
                {['Name', 'Type', 'Size', 'Actions'].map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((asset) => (
                <tr key={asset.id}>
                  <td className={`${td} font-medium`}>
                    <span className="flex items-center gap-2">
                      <TypeIcon type={asset.type} />
                      {asset.name}
                    </span>
                  </td>
                  <td className={td}>{asset.type}</td>
                  <td className={td}>{asset.size}</td>
                  <td className={td}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setRenameTarget(asset)
                          setRenameName(asset.name)
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setDeleteTarget(asset.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete asset"
        description="This asset will be removed permanently. Continue?"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={() => setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename asset</DialogTitle>
            <DialogDescription>Enter a new name for this file.</DialogDescription>
          </DialogHeader>
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
