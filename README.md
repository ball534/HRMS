# InsideHR

**The whole employee lifecycle, in one Next.js app.**

Hiring, onboarding, leave, part-time timesheets, payroll, expenses, documents, performance
reviews, bonus cycles, work-pass compliance, auto-generated employment letters, and a
three-language onboarding course — for a retail group operating across Singapore and
Malaysia.

A **monolith by design**: no microservices, no message queue, no separate API server. Every
system reads and writes one Postgres database through one Prisma client, which makes the
connections between them easy to follow — and easy to break if you do not know where to look.
That is what the handover doc is for.

### The systems

|                  |                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **People**       | Employee records, org chart, career journey timeline, onboarding                                                                                       |
| **Leave**        | Entitlement engine with pro-rating, lazy balance creation, carry-forward expiry, blackout windows, SG/MY public holidays, team calendar and Who is Out |
| **Time & pay**   | Part-time timesheet with an approval state machine, month-end payroll computation                                                                      |
| **Documents**    | Two-step upload, mass push to filtered employee groups, role-scoped visibility                                                                         |
| **Letters**      | Employment and confirmation letters generated as PDFs from templates, with a signing state machine                                                     |
| **Performance**  | Configurable review cycles, scoped review assignment, submit / acknowledge / reopen lifecycle                                                          |
| **Rewards**      | Bonus cycles with cascading state                                                                                                                      |
| **Compliance**   | Work-pass expiry tracking, statutory fields, append-only audit log                                                                                     |
| **Learning Hub** | A trilingual onboarding course with progress tracking                                                                                                  |

### Architecture in four lines

- **One auth boundary.** Every read and write goes through the DAL — authorization lives there and nowhere else, so there is exactly one place to check when you ask "can this user see this?"
- **Server actions over API routes.** The browser calls typed server actions; `src/proxy.ts` gates every page request before React renders.
- **31 Prisma models, 22 action modules.** The `User` record is the hub almost everything hangs off.
- **Everything auditable.** State transitions write to an append-only audit log.

### Documentation

`README.md` is a full developer handover — it traces every feature through the codebase by
real file path and function name, maps which systems trigger which, walks through three
end-to-end scenarios (new hire day 0 to month 3, probation to confirmation, month-end
payroll), and lists the traps that will bite you.
