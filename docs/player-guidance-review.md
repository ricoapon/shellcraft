# Player guidance review

The terminal remains the entry point. Missions teach the mechanics; there is no
separate tutorial, onboarding overlay, or additional application UI. This review
covers the source and expected player route through all fifteen assignments.

## Always available support

- A one-time welcome explains the goal, mission rewards, free execution, local
  saves, and the commands for getting started. Existing profiles receive a
  returning-player version without being told to restart the campaign. Clearing
  the terminal keeps it clear after reload.
- `mission` identifies the current objective or names the next assignment.
  `mission briefing` explains whether an answer is required; `mission hint`
  remains free and optional.
- `guide` lists named topics, including `guide start` and `guide stuck`. Numeric
  section selection still works. Troubleshooting covers navigation, remote
  writes, unavailable commands, observations, simulation time, and recovery.
- Completion names the next assignment and an eligible, affordable upgrade.
  A new upgrade explains its entry point and relevant guide topic.
- Live playback reports completion, failure, and disabled controllers in the
  terminal. Notices are saved in the transcript without reporting every tick.
  A partially typed command is restored after a notice.

## Mission route and likely sticking points

| Assignment             | Likely sticking point                                                    | Guidance available                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Deployment note     | Not knowing how to navigate, read evidence, or submit it                 | Welcome, briefing with `ls`/`cat`/submission syntax, optional index-file hint                                                               |
| 02 Search the archive  | Not knowing how to buy scripting or find starter code                    | First reward names the purchase; purchase points to `help run`; briefing names editable search script                                       |
| 03 Nested archive      | Stopping at the first match; not knowing how to reuse scripts            | Briefing explains active-record check; optional recursive-library hint; `guide commands`                                                    |
| 04 Active credentials  | Treating every matching credential as valid                              | Briefing stresses timestamps and revocation; optional hint names evidence files                                                             |
| 05 Connected machines  | Searching only the entry machine or losing home tools                    | Briefing introduces `neighbors`, `ssh`, and `exit`; guide explains home editing while remote                                                |
| 06 Network discovery   | Cycles, undiscovered handles, or scripts moving the terminal             | Briefing names network purchase and starter crawler; API topic explains handles; optional hint reinforces session behavior                  |
| 07 Traffic collector   | Trying to submit an answer; disconnecting useful traffic                 | Start explains automatic completion; briefing states what must remain online; screens topic explains collected observations                 |
| 08 Network isolation   | Expecting a plan preview or not knowing how to undo a cut                | Briefing describes current-connectivity checks and restoring links; optional hint gives a cut plan                                          |
| 09 Service repair      | Editing a home file instead of remote config; breaking JSON quoting      | Briefing explains remote `write`; detailed help and troubleshooting explain full replacement and quoting; optional hint covers dependencies |
| 10 Conflicting records | Sorting timestamp strings or accepting revoked events                    | Briefing requires normalized times and revocation filtering; optional hint explains offsets; API topic supports gathering records           |
| 11 Thermal balancing   | Expecting transfers to arrive immediately; time staying paused           | Start explains time controls; simulation topic covers tick order; troubleshooting explains in-flight work and editor pauses                 |
| 12 Moving process      | Guessing without finding sightings; traps never executing                | Briefing names sightings log and exact simulation command; free hint explains the movement rule; live completion/failure notice             |
| 13 Coordinated update  | Stepping between individual queued commits                               | Briefing says queue all three before advancing; optional hint supplies command order; live outcome notice                                   |
| 14 Priority surge      | Missing arrivals or urgent deadlines                                     | Briefing and scheduling topic describe scheduled events, priorities, and job observations; reset preserves tools for iteration              |
| 15 Cooling failure     | Controller stopping silently or repeatedly retrying without measurements | Controller error notices explain reloading fixed code; briefing names cooling and action history; final completion explains replay          |

## Verification and playtest focus

TypeScript and formatting checks are recorded in `implementation.md`. Regression
tests were added for welcome persistence, next-step selection, guide links,
action completion, and live simulation notices. The current suite and production
build still need a run where subprocess permissions allow it; no permission was
requested while the user was away.

The embedded-browser checks are narrower than a fresh end-to-end playthrough.
They use a separate localhost origin so the user's existing save is preserved.
The source review covers all fifteen missions, but puzzle difficulty and whether
the hints arrive at the right time still need the user's fresh playtest.

For that playtest, check whether the welcome gives enough direction without
opening a guide, the first reward makes the scripting purchase obvious, and
mission starts make it clear when to submit an answer or advance time. Later,
check remote repair writes, discovering observations for screens, and recovering
from a failed simulation without feeling that tools were lost.
