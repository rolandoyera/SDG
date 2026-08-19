# Tasks Feature — Agent Notes

> Global dev rules live in the repo root [AGENTS.md](../../../../../../../AGENTS.md). This file
> only captures Tasks-specific context that isn't obvious from the code.

## Maintain this file

**Whenever you change Tasks code (this folder, the `// --- TASKS ---` section of
`src/lib/db.ts`, `src/server/task-actions.ts`, or the `match /tasks/` block in
`firestore.rules`), update this file in the same change.** A stale AGENTS.md is worse than
none — treat updating it as part of "done," not optional.

## What this feature is

A shared task list for the studio. One route, a client component:
[page.tsx](./page.tsx) — a three-column layout of views nav, task list, and detail panel.

The Calendar feature is **deliberately parked** until this ships. Task due dates are the
content a calendar would render, which is why Tasks was built first.

## Visibility is the thing to understand first

`Task.participantIds` = creator + task assignees + subtask assignees. It is the **read gate**
in `firestore.rules`, not just a filter:

- Members see a task only if they're in `participantIds`.
- Admins and SuperAdmins read the whole org — that's what makes the **All Tasks** view
  meaningful, and it's the only way to find a task whose assignees have all left. All Tasks is
  hidden from members, because for them it would render exactly the same list as My Tasks.
- Anyone who can see a task can **edit and delete** it. No creator-only carve-out.
- **Deletes are permanent.** Unlike notes, tasks are not soft-deleted. The page guards with an
  AlertDialog because there is no recovery.

Two consequences that bite if you forget them:

1. **A member's list query MUST constrain on `participantIds` (`array-contains`)** or Firestore
   rejects the whole query — not just the out-of-scope rows. See `use-tasks.ts`.
2. **Assigning someone is a permission grant.** Adding them to a subtask gives them the whole
   task, notes included; unassigning revokes it and the task vanishes from their list.

## Where writes go

| Write                          | Path                                              | Why                                                                               |
| ------------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Create                         | `createTask` (server action)                      | `participantIds` must be derived, not trusted; rules deny client creates outright |
| Edit panel save                | `updateTask` (server action)                      | Assignee changes rewrite the read gate and fire notifications (admin SDK)         |
| Tick a checkbox, mark complete | `setTaskSubtasks` / `setTaskCompleted` in `db.ts` | Hot path rules already permit; keeps the UI optimistic                            |
| Delete                         | `deleteTask` in `db.ts`                           | Permitted for participants by rules                                               |

`updateTask` re-checks permission in code rather than leaning on the rules, because the admin
SDK bypasses them.

## Design decisions that look like bugs but aren't

- **No Completed section.** Completing a task removes it from every view; the toast's Undo is
  the only way back. `completedAt`/`completedBy` are still written so a Completed view can be
  added later without a backfill.
- **Two date groups only** — Past due, then Upcoming sorted by date with undated tasks last.
  No Today/This week split, no My Day view.
- **Past due means due _before today_**, not overdue by clock time, so a task due at 2:00pm
  doesn't jump groups at 2:01 while you're working on it. See `isPastDue`.
- **Completing every subtask does NOT complete the task.** Only the checkbox sets `completed`.
- **The detail panel edits in place; there is no edit modal.** The modal is create-only. A
  read-only panel would mean the same task lives in three places with two of them to sync.
  Chips commit on change, title and notes commit on blur.
- **The avatar cluster is assignees, not participants** — task assignees ∪ subtask assignees.
  The creator isn't shown unless they're actually on something. Since new subtasks default to
  the creator, usually they are.
- **Project chip dots are a single flat color.** `Project` has no color field and adding one
  was declined.

## Files in this folder

- `_components/task-constants.ts` — `taskSchema` (Zod), `TaskFormData`, `emptyTaskForm`,
  `taskToForm`, and `formToTaskInput` (form → server action payload, including the
  `project:<id>` / `client:<id>` / `none` attachment encoding). The `Task` Firestore type lives
  in `@/lib/types`.
- `_components/task-utils.ts` — view filtering, the two-group split, due formatting, avatar
  helpers. Pure functions, no React.
- `_components/use-tasks.ts` — the realtime subscription. **One listener serves all three
  views**: admins subscribe org-wide, members participant-scoped, and per-view narrowing then
  happens in memory so switching views costs nothing.
- `_components/task-pickers.tsx` — `AssigneePicker` and `DuePicker`, shared by the create
  dialog and the detail panel (both accept a `trigger` override).
- `_components/task-card.tsx` — the list row. Subtasks expand only on the selected card.
- `_components/task-detail-panel.tsx` — read + edit surface.
- `_components/task-form-dialog.tsx` — create only (RHF + Zod, `useFieldArray` for subtasks).
- `_components/task-views-nav.tsx` — views and per-project counts, both computed from tasks
  already in memory, so the sidebar costs zero reads.

## Tests you must keep passing

- `page.test.tsx` — the effect-churn guardrail. Asserts a new-but-equal `profile` neither
  refetches the reference lists nor rebuilds the onSnapshot listener, and that All Tasks is
  hidden from members.
- `src/lib/db.query-shape.test.ts` — `getTasks` has a row in the table; it must stay one
  `getDocs` and zero `getDoc`s.
- `firestore/rules.test.ts` — three task tests covering participant/admin/outsider reads, the
  query-constraint requirement, and participant edit/delete plus server-only create. Rules
  changes must pass `npm run test:rules:emulator`.

## Composite indexes

Not in the repo (there is no `firestore.indexes.json`; indexes are console-managed). `tasks`
needs `organizationId` + `completed` + `participantIds` (array), and the admin path drops the
array clause. Firestore prints a click-to-create link the first time each query runs.

## Not built yet

- **Day-of due notifications.** `task_due_today` exists in `NotificationType` but nothing
  writes it. It wants a fourth Vercel cron alongside the three in `vercel.json`.
- **Day-of email.** `src/server/brevo.ts` only exposes `sendContractEmail`, which is
  contract-shaped; a generic sender has to be extracted first.
- **Recurring tasks.** Deliberately out of scope.
- **The Home page tasks panel.** Left alone on purpose until this feature settles.
