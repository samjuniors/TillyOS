import { FunctionDeclaration, Type } from '@google/genai';
import { BaseSkill, SkillExecutionContext, SkillExecutionResult } from './base_skill.ts';

/**
 * Prebuilt Plugin 3: Google Workspace Skill (`google_workspace`)
 * Connects via Google Workspace OAuth (Firebase Auth signInWithPopup) rather than raw API keys:
 * - Google Calendar (`list_calendar_events`, `create_calendar_event`)
 * - Gmail (`list_recent_emails`, `send_email`)
 * - Google Tasks (`list_tasks`, `create_task`)
 * - Google Drive (`search_drive_files`)
 *
 * Strictly enforces user confirmation before any mutating Workspace action (creating events/tasks or sending email).
 */
export class GoogleWorkspaceSkill extends BaseSkill {
  readonly name = 'google_workspace';
  readonly oauthProvider = 'google_workspace' as const;

  readonly description =
    'Manages your Google Calendar events, Gmail inbox/emails, Google Tasks to-do list, and Google Drive files via Google account OAuth sign-in.';

  readonly decision_criteria =
    'User asks about their calendar, schedule, meetings, appointments, emails, Gmail inbox, tasks, to-dos, reminders in Google Tasks, or files in Google Drive.';

  readonly filler_phrase = 'Checking your Google Workspace account right now...';

  readonly tool_declarations: FunctionDeclaration[] = [
    {
      name: 'list_calendar_events',
      description: 'List upcoming events from the user Google Calendar.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          maxResults: { type: Type.NUMBER, description: 'Max events to fetch (default 5).' },
        },
      },
    },
    {
      name: 'create_calendar_event',
      description: 'Create a new Google Calendar event (requires user confirmation before saving).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Title of the event.' },
          startTime: { type: Type.STRING, description: 'ISO start datetime or natural time.' },
        },
        required: ['summary'],
      },
    },
    {
      name: 'list_recent_emails',
      description: 'Read recent subjects/senders from Gmail.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Optional Gmail search query.' },
        },
      },
    },
    {
      name: 'send_email',
      description: 'Send an email via Gmail (requires user confirmation before sending).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          to: { type: Type.STRING, description: 'Recipient email address.' },
          subject: { type: Type.STRING, description: 'Email subject line.' },
          body: { type: Type.STRING, description: 'Email body text.' },
        },
        required: ['to', 'subject', 'body'],
      },
    },
    {
      name: 'list_tasks',
      description: 'Fetch active to-do items from Google Tasks.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
    {
      name: 'create_task',
      description: 'Add a new item to Google Tasks (requires user confirmation).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Task title.' },
        },
        required: ['title'],
      },
    },
    {
      name: 'search_drive_files',
      description: 'Search files stored in Google Drive.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Filename or keyword to search for.' },
        },
        required: ['query'],
      },
    },
  ];

  private resolveTool(toolName: string, input: string): string {
    const known = [
      'list_calendar_events',
      'create_calendar_event',
      'list_recent_emails',
      'send_email',
      'list_tasks',
      'create_task',
      'search_drive_files',
    ];
    if (known.includes(toolName)) return toolName;

    const lower = input.toLowerCase();
    if (/\b(send|email|mail)\b/.test(lower) && /\b(send|write|compose)\b/.test(lower)) {
      return 'send_email';
    }
    if (/\b(email|gmail|inbox|messages?)\b/.test(lower)) {
      return 'list_recent_emails';
    }
    if (/\b(create|add|schedule|book)\b/.test(lower) && /\b(calendar|meeting|event|appointment)\b/.test(lower)) {
      return 'create_calendar_event';
    }
    if (/\b(calendar|schedule|meeting|events?|agenda)\b/.test(lower)) {
      return 'list_calendar_events';
    }
    if (/\b(add|create)\b/.test(lower) && /\b(task|todo|to-do)\b/.test(lower)) {
      return 'create_task';
    }
    if (/\b(tasks?|to-?do)\b/.test(lower)) {
      return 'list_tasks';
    }
    if (/\b(drive|docs?|file|document|spreadsheet|sheet)\b/.test(lower)) {
      return 'search_drive_files';
    }
    return 'list_calendar_events';
  }

  async execute(
    toolName: string,
    args: Record<string, any>,
    context?: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const resolvedTool = this.resolveTool(toolName, context?.userInput || '');
    const token = context?.workspaceAccessToken;

    if (!token) {
      return {
        skillName: this.name,
        toolName: resolvedTool,
        args: args || {},
        success: false,
        voiceSummary:
          'To access your Google Calendar, Gmail, Tasks, or Drive, please click Sign in with Google in the Agent Skills panel so I have permission.',
        requiresAuth: {
          provider: 'google_workspace',
          reason: 'Google Workspace OAuth sign-in required.',
        },
        executionTimeMs: Date.now() - startTime,
        mode: 'oauth_api',
      };
    }

    const mutatingTools = new Set(['create_calendar_event', 'send_email', 'create_task']);
    if (mutatingTools.has(resolvedTool) && !context?.confirmedAction) {
      const actionTitle =
        resolvedTool === 'send_email'
          ? `Send Gmail to ${args?.to || 'recipient'}?`
          : resolvedTool === 'create_calendar_event'
          ? `Create Google Calendar event "${args?.summary || 'New Event'}"?`
          : `Add task "${args?.title || 'New Task'}" to Google Tasks?`;

      return {
        skillName: this.name,
        toolName: resolvedTool,
        args: args || {},
        success: true,
        voiceSummary: `Before I make changes to your Google Workspace account, please confirm: ${actionTitle}`,
        requiresConfirmation: {
          actionId: `ws-confirm-${Date.now()}`,
          provider: 'google_workspace',
          title: actionTitle,
          description: `Details: ${JSON.stringify(args || {})}`,
          toolName: resolvedTool,
          args: args || {},
        },
        executionTimeMs: Date.now() - startTime,
        mode: 'oauth_api',
      };
    }

    try {
      if (resolvedTool === 'list_calendar_events') {
        const timeMin = new Date().toISOString();
        const maxResults = Number(args?.maxResults || 5);
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
            timeMin
          )}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data: any = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `Calendar API ${res.status}`);
        const items = (data.items || []).map((ev: any) => ({
          id: ev.id,
          summary: ev.summary || '(Untitled event)',
          start: ev.start?.dateTime || ev.start?.date || '',
        }));
        const summaryText =
          items.length === 0
            ? 'Your Google Calendar looks completely free coming up!'
            : `You have ${items.length} upcoming calendar events. Next is ${items[0].summary}.`;
        return {
          skillName: this.name,
          toolName: resolvedTool,
          args: { maxResults },
          success: true,
          voiceSummary: summaryText,
          data: { events: items },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }

      if (resolvedTool === 'create_calendar_event') {
        const startIso = args?.startTime && !isNaN(Date.parse(args.startTime))
          ? new Date(args.startTime).toISOString()
          : new Date(Date.now() + 3600_000).toISOString();
        const endIso = new Date(Date.parse(startIso) + 3600_000).toISOString();
        const summary = String(args?.summary || 'Voice Assistant Meeting');
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary,
              start: { dateTime: startIso },
              end: { dateTime: endIso },
            }),
          }
        );
        const data: any = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `Calendar create failed ${res.status}`);
        return {
          skillName: this.name,
          toolName: resolvedTool,
          args: { summary, startTime: startIso },
          success: true,
          voiceSummary: `Done! I've added "${summary}" to your Google Calendar.`,
          data: { id: data.id, htmlLink: data.htmlLink, summary },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }

      if (resolvedTool === 'list_recent_emails') {
        const q = args?.query ? `&q=${encodeURIComponent(args.query)}` : '';
        const listRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=4${q}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const listData: any = await listRes.json();
        if (!listRes.ok) throw new Error(listData?.error?.message || `Gmail API ${listRes.status}`);
        const msgIds: string[] = (listData.messages || []).map((m: any) => m.id);
        const emails: Array<{ id: string; subject: string; from: string }> = [];
        for (const id of msgIds.slice(0, 3)) {
          const mRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (mRes.ok) {
            const mData: any = await mRes.json();
            const headers = mData.payload?.headers || [];
            const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No subject)';
            const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown sender';
            emails.push({ id, subject, from });
          }
        }
        const summaryText =
          emails.length === 0
            ? 'No recent matching emails found in your Gmail.'
            : `Your latest email is "${emails[0].subject}" from ${emails[0].from}.`;
        return {
          skillName: this.name,
          toolName: resolvedTool,
          args: args || {},
          success: true,
          voiceSummary: summaryText,
          data: { emails },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }

      if (resolvedTool === 'send_email') {
        const to = String(args?.to || '');
        const subject = String(args?.subject || 'Note from Sofia');
        const body = String(args?.body || '');
        const rawEmail = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', body].join('\r\n');
        const encoded = Buffer.from(rawEmail).toString('base64url');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `Gmail send ${res.status}`);
        return {
          skillName: this.name,
          toolName: resolvedTool,
          args: { to, subject },
          success: true,
          voiceSummary: `Email sent to ${to} with subject "${subject}".`,
          data: { id: data.id },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }

      if (resolvedTool === 'list_tasks') {
        const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@me/tasks?maxResults=6', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `Tasks API ${res.status}`);
        const tasks = (data.items || []).map((t: any) => ({
          id: t.id,
          title: t.title,
          status: t.status,
        }));
        const summaryText =
          tasks.length === 0
            ? 'Your Google Tasks list is clear right now!'
            : `You have ${tasks.length} tasks. First on your list is "${tasks[0].title}".`;
        return {
          skillName: this.name,
          toolName: resolvedTool,
          args: {},
          success: true,
          voiceSummary: summaryText,
          data: { tasks },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }

      if (resolvedTool === 'create_task') {
        const title = String(args?.title || 'Follow-up task');
        const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@me/tasks', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title }),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || `Tasks create ${res.status}`);
        return {
          skillName: this.name,
          toolName: resolvedTool,
          args: { title },
          success: true,
          voiceSummary: `Added "${title}" to your Google Tasks list.`,
          data: { id: data.id, title: data.title },
          executionTimeMs: Date.now() - startTime,
          mode: 'oauth_api',
        };
      }

      // search_drive_files
      const query = String(args?.query || '').trim();
      const qParam = query ? `q=${encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}' and trashed=false`)}&` : '';
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?${qParam}pageSize=5&fields=files(id,name,mimeType,webViewLink)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data: any = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Drive API ${res.status}`);
      const files = data.files || [];
      return {
        skillName: this.name,
        toolName: resolvedTool,
        args: { query },
        success: true,
        voiceSummary:
          files.length === 0
            ? `I couldn't find any Google Drive files matching ${query}.`
            : `I found ${files.length} files in your Drive. Top match is ${files[0].name}.`,
        data: { files },
        executionTimeMs: Date.now() - startTime,
        mode: 'oauth_api',
      };
    } catch (err: any) {
      return {
        skillName: this.name,
        toolName: resolvedTool,
        args: args || {},
        success: false,
        voiceSummary: `Google Workspace returned an error: ${err?.message || 'Permission or token expired. Please reconnect Google Sign-in.'}`,
        data: { error: err?.message },
        executionTimeMs: Date.now() - startTime,
        mode: 'oauth_api',
      };
    }
  }
}

export default new GoogleWorkspaceSkill();
