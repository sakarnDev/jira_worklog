"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type ApiWorklog = {
  issueKey: string;
  summary: string | null;
  timeSpentSeconds: number;
  startedISO: string;
  endedISO: string;
  comment: string | null;
};

type ApiResponse = {
  summary: { userEmail: string | null; date: string; totalSeconds: number };
  worklogs: ApiWorklog[];
  error?: unknown;
};

function formatSecondsToHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push("0m");
  return parts.join(" ");
}

function formatTimeRange(range?: { startISO: string | null; endISO: string | null } | null): string {
  if (!range || !range.startISO || !range.endISO) return "-";
  const start = new Date(range.startISO as string);
  const end = new Date(range.endISO as string);
  const toHM = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${toHM(start)} - ${toHM(end)}`;
}

function parseFlexibleDateTime(input: string): Date | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  // Normalize separator between date/time
  const normalized = raw.replace(/\s+/, "T");
  const [datePart, timePart] = normalized.split("T");
  if (!datePart || !timePart) return null;

  // Parse time hh:mm (optional seconds)
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!timeMatch) return null;
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  let year: number, month: number, day: number;
  if (datePart.includes("/")) {
    // Assume dd/mm/yyyy
    const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
  } else if (datePart.includes("-")) {
    // Assume yyyy-mm-dd
    const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    return null;
  }

  // Basic range checks
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(year, month - 1, day, hours, minutes, seconds, 0);
  // Validate that fields did not overflow (e.g., 31/02)
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day ||
    d.getHours() !== hours ||
    d.getMinutes() !== minutes
  ) {
    return null;
  }
  return d;
}

export default function WorklogDashboard() {
  const { data: session, status } = useSession();

  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  const query = useQuery<ApiResponse>({
    queryKey: ["jira-logs", date],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (session?.user?.email) params.set("email", session.user.email);
      if (date) params.set("date", date);
      const res = await fetch(`/api/jira-logs?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed: ${res.status}`);
      }
      return res.json();
    },
    enabled: false,
  });

  const { data, isFetching, isError, error, refetch, isSuccess } = query;

  const totalHms = useMemo(() => formatSecondsToHms(data?.summary.totalSeconds || 0), [data]);

  // Calculator states
  const [startText, setStartText] = useState<string>("");
  const [endText, setEndText] = useState<string>("");
  const calcResult = useMemo(() => {
    const start = parseFlexibleDateTime(startText);
    const end = parseFlexibleDateTime(endText);
    if (!start || !end) return "-";
    const diffSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    return formatSecondsToHms(diffSec);
  }, [startText, endText]);

  if (status === "loading") {
    return <div className="p-6">Loading session...</div>;
  }

  if (!session) {
    return (
      <div className="p-6 flex flex-col gap-4 items-start">
        <button
          onClick={() => signIn("google")}
          className="px-4 py-2 rounded bg-black text-white hover:opacity-90 cursor-pointer"
        >
          กดปุ่มนี้เพื่อ Sign in with Google
        </button>
        <p className="font-bold text-red-700">email end with @lamunpunit.com only!!!</p>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">Signed in as {session.user?.email}</div>
        <button
          onClick={() => signOut()}
          className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 cursor-pointer"
        >
          Sign out
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border rounded"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50 cursor-pointer"
          >
            {isFetching ? "Fetching..." : "Fetch Data"}
          </button>
        </div>
      </div>

      {isError && (
        <div className="text-red-600 text-sm">{(error as Error)?.message || "Failed to load"}</div>
      )}

      {isSuccess && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 rounded">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2 border-b">Issue Key</th>
                  <th className="text-left p-2 border-b">Task</th>
                  <th className="text-left p-2 border-b">From - To</th>
                  <th className="text-left p-2 border-b">Total Time</th>
                </tr>
              </thead>
              <tbody>
                {(data?.worklogs || []).map((row, idx) => (
                  <tr key={idx} className="even:bg-gray-50">
                    <td className="p-2 border-b font-mono text-sm"><a href={`${process.env.NEXT_PUBLIC_JIRA_DOMAIN}/browse/${row.issueKey}`} className="text-blue-700 underline" target="_blank" rel="noopener noreferrer">{row.issueKey}</a></td>
                    <td className="p-2 border-b text-sm">{row.summary || "-"}</td>
                    <td className="p-2 border-b text-sm">{formatTimeRange({ startISO: row.startedISO, endISO: row.endedISO })}</td>
                    <td className="p-2 border-b">{formatSecondsToHms(row.timeSpentSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-sm text-gray-700">
            รวมเวลา: <span className="font-medium">{totalHms}</span>
          </div>

          <hr className="my-6 border-t" />

          <div className="flex flex-col gap-3">
            <div className="text-base font-semibold">คำนวณเวลา Worklog</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-700">เริ่ม</label>
                <input
                  type="datetime-local"
                  value={startText}
                  onChange={(e) => setStartText(e.target.value)}
                  className="px-3 py-2 border rounded"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-700">จบ</label>
                <input
                  type="datetime-local"
                  value={endText}
                  onChange={(e) => setEndText(e.target.value)}
                  className="px-3 py-2 border rounded"
                />
              </div>
            </div>
            <div className="text-sm text-gray-700">
              ผลลัพธ์: <span className="font-medium">{calcResult}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


