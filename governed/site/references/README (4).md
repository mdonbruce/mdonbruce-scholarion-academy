# Scholaris AI Academy Website

Static, responsive website prototype for Scholaris AI Academy.

## Included
- Scholaris AI Academy SVG logo
- Responsive homepage
- 11 program catalog cards loaded from JSON
- Track filters
- Program detail modal
- Learning experience, stackability, credential, responsible-AI, career-support, FAQ, and application sections
- Credential-integrity language that avoids accreditation/degree claims
- WCAG-minded structure and keyboard-accessible modal/menu basics

## Run locally
From this folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Production notes
- Replace `admissions@scholaris.example` with a real admissions email or form endpoint.
- Wire Apply buttons to Scholaris authentication/admissions.
- Replace demo/fallback visual treatment with approved brand photography if desired.
- Add CMS or Scholaris API integration for dynamic catalog, applications, and learner portal.


## October 2026 update
- Program #1 upgraded to the detailed 18-week Agentic AI Systems specification.
- Program #12 added: Certificate in Designing & Building AI Products and Services.
- Dedicated public pages added for Programs #1 and #12.
- Programs #13 and #14 are not published because their specifications were not present in the supplied prompt.
