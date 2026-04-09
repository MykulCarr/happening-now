# Astronomy Events Data

This directory contains JSON data files for the AstroLab page.

## astronomy-events.json

This file contains upcoming astronomical events displayed on the AstroLab page, including eclipses, meteor showers, and planetary events.

### Structure

```json
{
  "events": [
    {
      "id": "unique-identifier",
      "title": "🌑 Event Name",
      "date": "YYYY-MM-DD",
      "dateDisplay": "Human-readable date range",
      "type": "eclipse|meteor|planet",
      "description": "Description of the event",
      "visibility": "Geographic visibility info",
      "peakTime": "Peak viewing time",
      "url": "Link to authoritative source"
    }
  ],
  "lastUpdated": "YYYY-MM-DD",
  "sources": [
    "List of data sources"
  ]
}
```

### Event Types

- **eclipse**: Solar or lunar eclipses (colored purple/blue gradient)
- **meteor**: Meteor showers (colored orange/red gradient)
- **planet**: Planetary events like conjunctions, elongations (colored green/blue gradient)

### Updating Events

1. Add new events to the `events` array
2. Use `date` in ISO format (YYYY-MM-DD) for sorting
3. Include descriptive emoji in the `title` (🌑 for eclipse, ☄️ for meteor, ♀♂ for planets)
4. Link to authoritative sources in `url` field
5. Update `lastUpdated` field when making changes

### Data Sources

Recommended sources for event data:
- **Eclipses**: https://eclipse.gsfc.nasa.gov/, https://www.timeanddate.com/eclipse/
- **Meteor Showers**: https://www.amsmeteors.org/, https://www.timeanddate.com/astronomy/meteor-shower/
- **Planetary Events**: https://in-the-sky.org/, https://theskylive.com/

### Maintenance

- Review and update quarterly
- Remove past events periodically
- Add events for the next 3-6 months
- Keep descriptions concise (max 200 characters)
- Verify visibility information for user's region
