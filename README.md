## Jira Worklog Dashboard

Full-stack app to display your personal Jira worklogs for today. Built with Next.js App Router, TypeScript, Tailwind CSS, NextAuth (Google), and @tanstack/react-query.

### Prerequisites
- Bun installed (`https://bun.sh`)
- Google Cloud project with OAuth 2.0 credentials
- Jira Cloud account and API token

### 1) Create Google OAuth credentials
1. Go to Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID.
2. Application type: Web application.
3. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
4. Save the `Client ID` and `Client Secret`.

### 2) Create Jira API token
1. Visit `https://id.atlassian.com/manage/api-tokens`
2. Create token and copy it.

### 3) Environment variables
Create `.env.local` at the project root with:

```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
AUTH_SECRET=your_random_secret

# Jira
JIRA_DOMAIN=your-domain.atlassian.net
JIRA_USER_EMAIL=your_email@lamunpunit.com
JIRA_API_TOKEN=your_jira_api_token
```

Notes:
- Only `@lamunpunit.com` emails may sign in (enforced in NextAuth `signIn` callback).
- `AUTH_SECRET` can be generated with `openssl rand -base64 32`.

### 4) Install and run

```bash
bun install
bun dev
```

Open `http://localhost:3000`.

### 5) Project structure
- `src/lib/auth.ts`: NextAuth configuration with Google provider and domain check
- `src/app/api/auth/[...nextauth]/route.ts`: Auth routes
- `src/app/api/jira-logs/route.ts`: Protected backend route calling Jira
- `src/app/providers.tsx`: Session + React Query providers
- `src/components/WorklogDashboard.tsx`: Client UI using react-query
- `src/app/page.tsx`: Renders the dashboard

### 6) Usage
- If not logged in: shows "Sign in with Google"
- If logged in: shows "Fetch Data" to retrieve today's worklogs
- Displays Issue Key, Time Spent, Comment, and total time today

