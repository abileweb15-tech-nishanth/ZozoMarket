export const fmt = (n: number) => n.toLocaleString('en-US')

export const fmtDate = (d: string) =>
  new Date(d.length <= 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
