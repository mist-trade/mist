# Tasks: Integrate deployed NapCat-AstrBot with mist-skills

## 1. Decide deployment topology

- [ ] 1.1 Confirm whether Mist backend runs in Docker or on the host machine.
- [ ] 1.2 If Mist runs in Docker, place AstrBot and Mist on the same Docker
      network.
- [ ] 1.3 If Mist runs on the host, configure AstrBot to reach the host through
      `host.docker.internal` or Docker `extra_hosts`.
- [ ] 1.4 Set `MIST_API_BASE_URL` inside the AstrBot container.

## 2. Load mist-skills in AstrBot

- [ ] 2.1 Mount or register `/Users/moyui/sean/mist/mist-skills` as an AstrBot
      Skill source.
- [ ] 2.2 Ensure the AstrBot runtime has the Python dependencies needed by the
      scripts, especially `requests`.
- [ ] 2.3 Confirm AstrBot discovers `chan-theory`, `technical-indicators`, and
      `data-query`.

## 3. Stabilize the Skill API contract

- [ ] 3.1 Decide where to normalize friendly periods such as `daily` and `5min`.
- [ ] 3.2 Make the chosen layer accept the Skill period values.
- [ ] 3.3 Verify `mist-skills` still parses Mist errors through `statusCode`.
- [ ] 3.4 Confirm `GET /security/v1/all` resolves before `GET /security/v1/:code`.
- [ ] 3.5 Confirm all Skill scripts send parameters compatible with the backend
      DTOs.

## 4. Run container-local smoke tests

- [ ] 4.1 From inside AstrBot, call Mist health check: `GET /app/hello`.
- [ ] 4.2 From inside AstrBot, run the data discovery script.
- [ ] 4.3 Run one daily K-line query script.
- [ ] 4.4 Run one indicator script, preferably MACD.
- [ ] 4.5 Run one Chan Theory analysis script.
- [ ] 4.6 Record the exact commands and expected outputs in an operator runbook.

## 5. Shape the first bot experience

- [ ] 5.1 Define the first supported user intents.
- [ ] 5.2 Add examples to the relevant Skill instructions.
- [ ] 5.3 Decide default period, default source, and default date range.
- [ ] 5.4 Add guardrails for unsupported securities, empty data, and overly broad
      requests.

## 6. Defer proactive alerts to a later change

- [ ] 6.1 Decide whether alert messages should be sent through AstrBot or direct
      NapCat HTTP APIs.
- [ ] 6.2 Define recipient policy for groups and private chats.
- [ ] 6.3 Define alert event schema from Mist.
- [ ] 6.4 Add scheduler or signal producer only after query-style bot usage is
      working.
