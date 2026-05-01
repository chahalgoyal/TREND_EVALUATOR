# Social Trend Intelligence - Useful API Commands

This file contains copy-pasteable PowerShell commands to manually trigger actions in the system. Make sure your server is running (`npm run dev`) before executing these.

All commands below include your configured Admin API Key (`x-api-key`).

### 1. Manually Trigger Instagram Scraper
Force the scraper to immediately fetch the latest posts from Instagram, bypassing the 15-minute scheduler.
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/v1/scraper/run" -Headers @{"x-api-key"="sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b"; "Content-Type"="application/json"} -Body '{"platform":"instagram","targetType":"feed"}'
```

### 2. Manually Trigger LinkedIn Scraper
Force the scraper to immediately fetch the latest posts from LinkedIn, bypassing the 30-minute scheduler.
```powershell
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/v1/scraper/run" -Headers @{"x-api-key"="sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b"; "Content-Type"="application/json"} -Body '{"platform":"linkedin","targetType":"feed"}'
```

### 3. Check Scraper Audit Logs
View a history of all scraping jobs, including any errors or failures.
```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:3000/api/v1/scraper/jobs" -Headers @{"x-api-key"="sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b"}
```

### 4. Check System Health
Quickly verify that the Database, Redis Queues, and Browser Pool are all connected and healthy.
```powershell
Invoke-RestMethod -Method GET -Uri "http://localhost:3000/api/v1/health" -Headers @{"x-api-key"="sti_adm_9e2f4a7b1c8d3e6f2a5b9c4d7e1f3a6b"}
```
