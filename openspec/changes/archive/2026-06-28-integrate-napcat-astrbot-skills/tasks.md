# Tasks: Integrate deployed NapCat-AstrBot with mist-skills

## 1. Decide deployment topology

- [x] 1.1 Confirm whether Mist backend runs in Docker or on the host machine.
      Mist backend is the Windows API appliance on the LAN.
- [x] 1.2 If Mist runs in Docker, place AstrBot and Mist on the same Docker
      network. Not applicable for the current Windows appliance topology.
- [x] 1.3 If Mist runs on the host, configure AstrBot to reach the host through
      `host.docker.internal` or Docker `extra_hosts`. Current runtime uses the
      LAN-reachable Windows backend URL.
- [x] 1.4 Set `MIST_API_BASE_URL` inside the AstrBot container.

## 2. Load mist-skills in AstrBot

- [x] 2.1 Mount or register `/Users/moyui/sean/mist/mist-skills` as an AstrBot
      Skill source. The deployed runtime uses copied Skill directories under
      `/AstrBot/data/skills`.
- [x] 2.2 Ensure the AstrBot runtime has the Python dependencies needed by the
      scripts, especially `requests`.
- [x] 2.3 Confirm AstrBot discovers `chan-theory`, `technical-indicators`, and
      `data-query`.

## 3. Stabilize the Skill API contract

- [x] 3.1 Decide where to normalize friendly periods such as `daily` and `5min`.
      `mist-skills` normalizes friendly periods before sending requests.
- [x] 3.2 Make the chosen layer accept the Skill period values.
- [x] 3.3 Verify `mist-skills` still parses Mist errors through `statusCode`.
- [x] 3.4 Confirm `GET /security/v1/all` resolves before `GET /security/v1/:code`.
- [x] 3.5 Confirm all Skill scripts send parameters compatible with the backend
      DTOs.

## 4. Run container-local smoke tests

- [x] 4.1 From inside AstrBot, call Mist health check: `GET /app/hello`.
- [x] 4.2 From inside AstrBot, run the data discovery script.
- [x] 4.3 Run one daily K-line query script.
- [x] 4.4 Run one indicator script, preferably MACD.
- [x] 4.5 Run one Chan Theory analysis script.
- [x] 4.6 Record the exact commands and expected outputs in an operator runbook.

## 5. Shape the first bot experience

- [x] 5.1 Define the first supported user intents.
- [x] 5.2 Add examples to the relevant Skill instructions.
- [x] 5.3 Decide default period, default source, and default date range.
- [x] 5.4 Add guardrails for unsupported securities, empty data, and overly broad
      requests.

## 6. Defer proactive alerts to a later change

- [x] 6.1 Decide whether alert messages should be sent through AstrBot or direct
      NapCat HTTP APIs. Deferred to a later alert-delivery change.
- [x] 6.2 Define recipient policy for groups and private chats. Deferred to a
      later alert-delivery change.
- [x] 6.3 Define alert event schema from Mist. Deferred to a later alert-delivery
      change.
- [x] 6.4 Add scheduler or signal producer only after query-style bot usage is
      working. Query-style usage now works; scheduler/alerts remain out of
      scope for this change.
