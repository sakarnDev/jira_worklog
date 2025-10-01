import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import axios from "axios";

type JiraWorklog = {
  issueKey: string;
  timeSpentSeconds: number;
  comment: string | null;
  startedMs: number;
  endedMs: number;
};

type JiraApiWorklog = {
  timeSpentSeconds?: number;
  comment?: string | null;
  started?: string;
  author?: {
    accountId?: string;
  };
};

function formatJiraBaseUrl(): string {
  const domain = process.env.JIRA_DOMAIN;
  if (!domain) throw new Error("JIRA_DOMAIN is not set");
  const normalized = domain.startsWith("https://") ? domain : `https://${domain}`;
  return normalized.replace(/\/$/, "");
}

function getAuthHeader(): string {
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error("JIRA_USER_EMAIL or JIRA_API_TOKEN is not set");
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function startOfTodayISO(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yyyy = start.getFullYear();
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  const dd = String(start.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateOnlyISO(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDayBounds(dateStr?: string): { startISO: string; endISO: string; startMs: number; endMs: number } {
  const base = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  return {
    startISO: dateOnlyISO(start),
    endISO: dateOnlyISO(end),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

async function resolveAccountIdByEmail(baseUrl: string, authHeader: string, email: string): Promise<string | null> {
  // Jira Cloud user search by query (may require proper permissions)
  type User = { accountId: string; emailAddress?: string };
  const url = `${baseUrl}/rest/api/3/user/search`;
  const { data } = await axios.get<User[]>(url, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    params: { query: email, maxResults: 2 },
  });
  const match = (data || []).find(() => true);
  return match?.accountId ?? null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const baseUrl = formatJiraBaseUrl();
    const authHeader = getAuthHeader();

    const emailParam = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
    const dateParam = req.nextUrl.searchParams.get("date")?.trim();
    const { startISO, endISO, startMs, endMs } = getDayBounds(dateParam || startOfTodayISO());

    // Resolve accountId if a specific email is requested; else use currentUser in JQL
    const accountId = emailParam ? await resolveAccountIdByEmail(baseUrl, authHeader, emailParam) : null;
    const authorClause = accountId ? `worklogAuthor in (${accountId})` : `worklogAuthor = currentUser()`;
    const jql = `${authorClause} AND worklogDate >= ${startISO} AND worklogDate < ${endISO}`;
    const searchUrl = `${baseUrl}/rest/api/3/search/jql`;

    // Fetch issues via new JQL search endpoint with pagination
    type JqlSearchResponse = { issues: Array<{ key: string; fields?: { summary?: string } }>; nextPageToken?: string };
    const issueKeys: string[] = [];
    const issueSummaries = new Map<string, string | null>();
    let nextPageToken: string | undefined = undefined;
    do {
      const body: { jql: string; maxResults: number; nextPageToken?: string; fields?: string[] } = {
        jql,
        maxResults: 100,
        // Request summary so we can show task name
        fields: ["summary"],
        ...(nextPageToken ? { nextPageToken } : {}),
      };
      const { data } = await axios.post<JqlSearchResponse>(
        searchUrl,
        body,
        {
          headers: {
            Authorization: authHeader,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      for (const issue of data.issues || []) {
        if (issue?.key) {
          issueKeys.push(issue.key);
          const summary = issue.fields?.summary ?? null;
          issueSummaries.set(issue.key, summary);
        }
      }
      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    // For accuracy, call issue worklogs API per issue to get logs in selected day
    const results: JiraWorklog[] = [];
    for (const issueKey of issueKeys) {
      const worklogUrl = `${baseUrl}/rest/api/3/issue/${issueKey}/worklog`;
      const wlResp = await axios.get<{ worklogs?: JiraApiWorklog[] }>(worklogUrl, {
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
        params: {
          startedAfter: startMs,
          startedBefore: endMs,
        },
      });

      const worklogs = wlResp.data.worklogs || [];
      const filter_worklogs = worklogs.filter((wl: JiraApiWorklog) => {
        // When accountId is known (email filter), ensure author matches; otherwise rely on JQL constraint
        return accountId ? wl.author?.accountId === accountId : true;
      })
      for (const wl of filter_worklogs) {
        const timeSpentSeconds = wl.timeSpentSeconds ?? 0;
        const comment = typeof wl.comment === "string" ? wl.comment : null;
        const started = wl.started ? new Date(wl.started) : null;

        // Only include logs by current user
        // Jira Cloud: we can't get current accountId directly via session; rely on JQL filter and secondary check by email if present
        const withinDay = (() => {
          if (!started) return false;
          const ms = started.getTime();
          return ms >= startMs && ms < endMs;
        })();

        if (withinDay) {
          results.push({
            issueKey,
            timeSpentSeconds,
            comment,
            startedMs: started!.getTime(),
            endedMs: (started!.getTime()) + timeSpentSeconds * 1000,
          });
        }
      }
    }

    // Build per-worklog entries
    const worklogs = results.map((r) => ({
      issueKey: r.issueKey,
      summary: issueSummaries.get(r.issueKey) ?? null,
      timeSpentSeconds: r.timeSpentSeconds,
      startedISO: new Date(r.startedMs).toISOString(),
      endedISO: new Date(r.endedMs).toISOString(),
      comment: r.comment,
    })).sort((a, b) => new Date(a.startedISO).getTime() - new Date(b.startedISO).getTime());
    const totalSeconds = worklogs.reduce((s, i) => s + (i.timeSpentSeconds || 0), 0);

    return NextResponse.json({
      summary: { userEmail: emailParam || session.user.email?.toLowerCase() || null, date: startISO, totalSeconds },
      worklogs,
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 500;
      const message = error.response?.data ?? error.message;
      return NextResponse.json({ error: message }, { status });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


