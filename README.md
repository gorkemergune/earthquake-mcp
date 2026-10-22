# AFAD Earthquake MCP

Explore live earthquake data from AFAD using natural language in Claude Desktop.

List earthquakes from the last 24 hours, search by province, and filter by magnitude. Event times are displayed in Türkiye time (UTC+3).

> “Show earthquakes with a magnitude of 3 or higher in İzmir over the last 24 hours.”

Data comes from [AFAD's official API](https://deprem.afad.gov.tr/event-service). The service provides only the latest 1,000 events; each response includes coverage details and any potential gaps.

## Getting started

With Node.js 24 installed:

```sh
npm ci
npm run build
```

Then follow the [Claude Desktop setup guide](docs/CLAUDE_SETUP.md) (in Turkish).

*Claude MCP Workshop · October 2026*
