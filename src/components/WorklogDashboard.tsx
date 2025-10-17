'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'

type ApiWorklog = {
  issueKey: string
  summary: string | null
  timeSpentSeconds: number
  startedISO: string
  endedISO: string
  comment: string | null
}

type ApiResponse = {
  summary: { userEmail: string | null; date: string; totalSeconds: number }
  worklogs: ApiWorklog[]
  error?: unknown
}

function formatSecondsToHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (parts.length === 0) parts.push('0m')
  return parts.join(' ')
}

function formatTimeRange(
  range?: { startISO: string | null; endISO: string | null } | null
): string {
  if (!range || !range.startISO || !range.endISO) return '-'
  const start = new Date(range.startISO as string)
  const end = new Date(range.endISO as string)
  const toHM = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
      2,
      '0'
    )}`
  return `${toHM(start)} - ${toHM(end)}`
}

function formatDateFull(isoString: string): string {
  const date = new Date(isoString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function getDateOnly(isoString: string): string {
  const date = new Date(isoString)
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function WorklogDashboard() {
  const { data: session, status } = useSession()

  const getTodayString = () => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const [startDate, setStartDate] = useState<string>(getTodayString())
  const [endDate, setEndDate] = useState<string>(getTodayString())

  // Date pagination state
  const [currentDateIndex, setCurrentDateIndex] = useState<number>(0)

  const query = useQuery<ApiResponse>({
    queryKey: ['jira-logs', startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (session?.user?.email) params.set('email', session.user.email)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/jira-logs?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || `Request failed: ${res.status}`)
      }
      return res.json()
    },
    enabled: false,
  })

  const { data, isFetching, isError, error, refetch, isSuccess } = query

  const totalHms = useMemo(
    () => formatSecondsToHms(data?.summary.totalSeconds || 0),
    [data]
  )

  // Group worklogs by date
  const worklogsByDate = useMemo(() => {
    const worklogs = data?.worklogs || []
    const grouped = new Map<string, typeof worklogs>()

    worklogs.forEach((worklog) => {
      const dateKey = getDateOnly(worklog.startedISO)
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, [])
      }
      grouped.get(dateKey)!.push(worklog)
    })

    // Sort dates in descending order (newest first)
    const sortedDates = Array.from(grouped.keys()).sort((a, b) =>
      b.localeCompare(a)
    )
    return sortedDates.map((date) => ({
      date,
      worklogs: grouped.get(date)!,
      totalSeconds: grouped
        .get(date)!
        .reduce((sum, w) => sum + w.timeSpentSeconds, 0),
    }))
  }, [data])

  const totalDates = worklogsByDate.length
  const currentDateData = worklogsByDate[currentDateIndex]

  // Reset to first date when data changes
  useEffect(() => {
    setCurrentDateIndex(0)
  }, [data])

  // Calculator states
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  const calcResult = useMemo(() => {
    if (!startTime || !endTime) return '-'

    // Parse time in HH:MM format
    const parseTime = (timeStr: string): number | null => {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
      if (!match) return null
      const hours = Number(match[1])
      const minutes = Number(match[2])
      if (hours > 23 || minutes > 59) return null
      return hours * 3600 + minutes * 60
    }

    const startSec = parseTime(startTime)
    const endSec = parseTime(endTime)

    if (startSec === null || endSec === null) return '-'

    // Calculate difference, handle cases where end time is next day
    let diffSec = endSec - startSec
    if (diffSec < 0) {
      diffSec += 24 * 3600 // Add 24 hours if end is next day
    }

    return formatSecondsToHms(diffSec)
  }, [startTime, endTime])

  if (status === 'loading') {
    return <div className="p-6">Loading session...</div>
  }

  if (!session) {
    return (
      <div className="p-6 flex flex-col gap-4 items-start">
        <Button onClick={() => signIn('google')}>
          กดปุ่มนี้เพื่อ Sign in with Google
        </Button>
        <p className="font-bold text-red-700">
          email end with @lamunpunit.com only!!!
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Signed in as {session.user?.email}
        </div>
        <Button variant="outline" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>ตัวกรองวันที่</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <Label className="text-sm">วันที่เริ่มต้น (Start Date)</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              <Label className="text-sm">วันที่สิ้นสุด (End Date)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? 'Fetching...' : 'Fetch Data'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isError && (
        <div className="text-sm text-destructive">
          {(error as Error)?.message || 'Failed to load'}
        </div>
      )}

      {isSuccess && (
        <>
          {currentDateData ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">
                    วันที่:{' '}
                    {formatDateFull(currentDateData.worklogs[0].startedISO)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    รวมเวลาวันนี้:{' '}
                    <span className="font-medium">
                      {formatSecondsToHms(currentDateData.totalSeconds)}
                    </span>
                  </div>
                  {totalDates > 1 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div>
                        ทั้งหมด{' '}
                        <span className="font-medium">
                          {currentDateData.worklogs.length}
                        </span>{' '}
                        รายการ
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCurrentDateIndex((prev) => Math.max(0, prev - 1))
                          }
                          disabled={currentDateIndex === 0}
                        >
                          ← วันถัดไป
                        </Button>
                        <div className="text-xs">
                          ({currentDateIndex + 1} / {totalDates})
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCurrentDateIndex((prev) =>
                              Math.min(totalDates - 1, prev + 1)
                            )
                          }
                          disabled={currentDateIndex === totalDates - 1}
                        >
                          วันก่อนหน้า →
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Issue Key</TableHead>
                          <TableHead>Task</TableHead>
                          <TableHead>Comment</TableHead>
                          <TableHead>From - To</TableHead>
                          <TableHead>Total Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentDateData.worklogs.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">
                              <a
                                href={`${process.env.NEXT_PUBLIC_JIRA_DOMAIN}/browse/${row.issueKey}`}
                                className="text-primary underline"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {row.issueKey}
                              </a>
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.summary || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.comment || '-'}
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatTimeRange({
                                startISO: row.startedISO,
                                endISO: row.endedISO,
                              })}
                            </TableCell>
                            <TableCell>
                              {formatSecondsToHms(row.timeSpentSeconds)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {totalDates > 1 && (
                <div className="text-xs text-muted-foreground text-center">
                  รวมเวลาทั้งหมด ({totalDates} วัน):{' '}
                  <span className="font-medium">{totalHms}</span>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-center py-8">
              ไม่พบข้อมูล worklog
            </div>
          )}

          <Separator />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>คำนวณเวลา Worklog</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">เวลาเริ่ม</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">เวลาจบ</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm">ผลลัพธ์</Label>
                  <div className="px-3 py-2 rounded border bg-secondary text-secondary-foreground font-medium">
                    {calcResult}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
