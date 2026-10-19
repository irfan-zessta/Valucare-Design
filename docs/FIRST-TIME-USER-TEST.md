# First-time user test - materials (unmoderated)

Materials for an **unmoderated** first-time usability study of the Corporate New Business application.
The goal is to compare two conditions:

- **Condition A - Contextual guidance only.** The app's on-screen guidance is present (every screen
  answers *Where am I / What now / Why / What next*), but the **"Guide me"** walkthrough is **off**.
- **Condition B - Contextual guidance + Guide me.** Same app, with the optional **"Guide me"**
  walkthrough **on**.

These are materials only. **No test has been run and no participant data has been collected.** There is
**no hidden session recording and no telemetry** - nothing about the participant is captured or
transmitted by the app. Any notes are taken by the facilitator or typed by the participant into the
forms below, and stay with whoever runs the study.

---

## 0. How to run it

- **Design:** between-subjects is cleanest (each participant sees only A **or** B, so B can't "teach"
  A). If you have few participants, a within-subjects design works but use a **different company name**
  for the second run so nothing is pre-learned, and counterbalance the order.
- **Participants:** 5-8 per condition is enough to surface the big first-time problems. Recruit people
  who have **not** used HMS3 New Business before (the "first-time" requirement). Do **not** claim
  first-time results until real first-time participants have actually completed the tasks.
- **Each participant needs:** the running app, this task sheet, and the feedback form (§4). For
  Condition B, point them at the **"Guide me"** button once; don't coach beyond that.
- **Setup per participant:** start from the New Business list signed in as the demo System Admin. Each
  participant should work on their **own** case so runs don't collide - in Condition B the walkthrough
  creates its own isolated demo case automatically; in Condition A, ask them to start a new company with
  a name that includes their initials.
- **Time:** expect 20-35 minutes. There is no pass/fail for the participant - we are testing the
  product, not them.

---

## 1. Welcome (read or show to the participant)

> Thank you for helping us test a tool for setting up a new corporate client.
>
> You'll play the role of someone at the insurer preparing a brand-new company so its health plan can go
> live. You don't need any prior knowledge of the system or of insurance - just do what seems
> reasonable, and use whatever help the screen gives you.
>
> There are no right or wrong actions and nothing you can break - this is a safe demo with made-up data.
> If you get stuck, that's useful information for us: say (or type) what you expected to happen and move
> on. Please think aloud where you can - tell us what you're looking for and why.
>
> We are testing the software, not you. You can stop at any time.

**For Condition B only, add:**

> Near the top of the page there is a **"Guide me"** button. You may use it to get step-by-step help, or
> ignore it - it's up to you.

---

## 2. Scenario

> A new corporate client, **Northwind Pacific Logistics**, wants to sign up for coverage. They're a
> direct client (no broker), about 180 employees. Your job is to take them from a fresh prospect all the
> way to an **activated account that's been handed over** to the servicing team - getting the right
> internal approvals along the way.
>
> Other departments (underwriting/actuarial, account management, etc.) are **simulated** in this demo:
> where the real process would wait on another team, you can record their response yourself and carry on.

---

## 3. Tasks (outcome-based - no click-by-click steps)

Do these in order. For each, we care whether you can tell **what to do next and why**, and whether you
know when it's done. If you can't complete one, note where you got stuck and move to the next.

1. **Get the client into the system.** Start the new corporate client so there's a case to work on.
2. **Register the franchise and get it approved.** Complete the franchise details, send them for review,
   and get them approved so the client is officially on-boarded.
3. **Prepare the quotation.** Request rates from actuarial and get a rate sheet back so the numbers
   exist to build an offer.
4. **Finalise the offer.** Turn the approved rates into an offer / schedule of benefits, get it the
   approvals it needs, and get it accepted by the client.
5. **Set up the account.** Create the account, handle the contract / KYC steps, and generate the plan
   codes. Try customising a plan code (e.g. change a detail) and see that it saves.
6. **Activate and hand over.** Bring the account live and complete the handover to the servicing team.

**After each task, before moving on, jot one line:** *Did you know what to do next? Yes / No / Unsure -
and what told you (or what you looked for and couldn't find)?*

---

## 4. Feedback form (participant fills in)

Rate 1 (strongly disagree) - 5 (strongly agree):

| Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| I usually knew **where I was** in the overall process | | | | | |
| I usually knew **what to do next** | | | | | |
| I understood **why** each step was needed | | | | | |
| I could tell when a step had **actually succeeded** | | | | | |
| When something waited on another team, I understood what was happening | | | | | |
| I felt confident, not lost | | | | | |

**Condition B only:**

| Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| The **"Guide me"** walkthrough helped me | | | | | |
| The walkthrough pointed me at the right control at the right time | | | | | |
| The walkthrough stayed out of my way when I didn't need it | | | | | |
| I could turn it off / go back to exploring freely when I wanted | | | | | |

Open questions:

1. Where did you get stuck, confused, or surprised?
2. Was there a moment you weren't sure whether something had worked? Where?
3. What single change would have helped you most?
4. **(Condition B)** Did the walkthrough ever tell you something that didn't match what the screen was
   actually showing? If so, where?
5. Anything else?

---

## 5. Facilitator observation sheet (one per participant)

Condition: ___ A (guidance only) / ___ B (guidance + Guide me)   Participant #: ____   Date: ____

| Task | Completed? (Y / Partial / N) | Got stuck? Where | Used on-screen guidance? | (B) Used "Guide me"? | Notes / quotes |
|---|---|---|---|---|---|
| 1 Get client into system | | | | | |
| 2 Franchise approved | | | | | |
| 3 Quotation prepared | | | | | |
| 4 Offer finalised | | | | | |
| 5 Account set up + plan codes | | | | | |
| 6 Activated + handed over | | | | | |

Watch for and note:

- Moments of hesitation ("what do I do now?") and what resolved them.
- Any time the participant thought a step had succeeded when it hadn't (or vice-versa).
- Whether they understood that other departments are **simulated**.
- **(B)** Whether the walkthrough ever contradicted the live case, covered a field/button, or felt
  intrusive; whether they could exit/resume easily.
- Any console errors or broken states (facilitator only).

---

## 6. What to compare afterwards

- **Task completion rate** per task, A vs B.
- **Where people got stuck** - do the same steps trip up both groups, or does B clear specific ones?
- **"Knew what to do next"** and **"could tell it succeeded"** scores, A vs B.
- Whether B introduced any *new* confusion (e.g. the walkthrough disagreeing with the screen) - this is
  the key risk to watch, since the walkthrough is meant to derive from the same state as the app.

Report findings separating **what participants actually did** from **facilitator interpretation**, and
keep raw notes with the summary.
