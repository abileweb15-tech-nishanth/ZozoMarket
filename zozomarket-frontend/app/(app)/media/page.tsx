'use client'

import { useEffect, useState } from 'react'
import { Download, FileImage, FileVideo, Loader2, Pencil, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PageHeader,
  Panel,
  SearchInput,
  EmptyState,
  ConfirmDialog,
  FilterBar,
  Segmented,
  CardGridSkeleton,
  TableSkeleton,
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
  const [loading, setLoading] = useState(true)
  const [uploadingFiles, setUploadingFiles] = useState<{ id: string; name: string }[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('Grid')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<MediaAsset | null>(null)
  const [renameName, setRenameName] = useState('')

  useEffect(() => {
    let active = true
    api.media
      .list()
      .then((rows) => { if (active) setAssets(rows) })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const filtered = assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()),
  )

  const handleUpload = async (fileList: FileList | File[] | undefined) => {
    const files = fileList ? Array.from(fileList) : []
    if (files.length === 0) return

    for (const file of files) {
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setUploadingFiles((prev) => [{ id: tempId, name: file.name }, ...prev])
      try {
        const created = await api.media.upload(file)
        setAssets((prev) => [created, ...prev])
        toast.success(`Uploaded ${file.name}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Upload failed for ${file.name}`)
      } finally {
        setUploadingFiles((prev) => prev.filter((item) => item.id !== tempId))
      }
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleUpload(e.dataTransfer.files)
    }
  }

  const handleDelete = (id: string) => {
    api.media.delete(id).then(() => {
      setAssets((prev) => prev.filter((a) => a.id !== id))
      setDeleteTarget(null)
      toast.success('Asset deleted')
    }).catch((err: Error) => toast.error(err.message))
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
          <Button nativeButton={false} render={<label />} className="cursor-pointer">
            {uploadingFiles.length > 0 ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploadingFiles.length > 0 ? `Uploading (${uploadingFiles.length})…` : 'Upload file'}
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,application/pdf"
              className="sr-only"
              onChange={(e) => { void handleUpload(e.target.files ?? undefined); e.target.value = '' }}
            />
          </Button>
        }
      />

      {/* Drag & drop upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
        }}
        onDrop={handleDrop}
        className={cn(
          'mb-6 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card hover:border-muted-foreground/40',
        )}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {uploadingFiles.length > 0 ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <Upload className="size-5" />
          )}
        </div>
        <div className="text-sm font-medium">
          {isDragging ? 'Drop files here to upload' : 'Drag and drop images or videos here'}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, GIF, WebP, MP4, WebM, or PDF ·{' '}
          <label className="cursor-pointer font-medium text-primary hover:underline">
            browse files
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,application/pdf"
              className="sr-only"
              onChange={(e) => { void handleUpload(e.target.files ?? undefined); e.target.value = '' }}
            />
          </label>
        </p>
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search assets…" />
        <div className="ml-auto">
          <Segmented label="View" value={view} onChange={setView} options={['Grid', 'List'] as const} />
        </div>
      </FilterBar>

      {loading ? (
        view === 'Grid' ? (
          <CardGridSkeleton count={8} />
        ) : (
          <TableSkeleton columns={4} rows={5} />
        )
      ) : filtered.length === 0 && uploadingFiles.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Search}
            title="No assets found"
            description="Upload files, drag and drop above, or adjust your search."
          />
        </Panel>
      ) : view === 'Grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {uploadingFiles.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <div className="relative flex aspect-square flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Uploading…</span>
              </div>
              <div className="space-y-1.5 px-3 py-2.5">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
          {filtered.map((asset) => (
            <div
              key={asset.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
            >
              <div className="relative flex aspect-square items-center justify-center bg-muted">
                {!loadedImages[asset.id] && (
                  <Skeleton className="absolute inset-0 rounded-none" />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.src}
                  alt={asset.name}
                  className={cn(
                    'h-full w-full object-cover transition-opacity duration-200',
                    loadedImages[asset.id] ? 'opacity-100' : 'opacity-0',
                  )}
                  onLoad={() => setLoadedImages((prev) => ({ ...prev, [asset.id]: true }))}
                  onError={(e) => {
                    setLoadedImages((prev) => ({ ...prev, [asset.id]: true }))
                    ;(e.target as HTMLImageElement).src = ''
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
                <div className="absolute inset-x-2 bottom-2 flex justify-center gap-1">
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
                        size="sm"
                        onClick={() => setDeleteTarget(asset.id)}
                      >
                        <Trash2 className="size-3.5" /> Delete
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
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
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
