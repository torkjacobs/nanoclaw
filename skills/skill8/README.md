# Skill 8: Marketing Engine — Module A: Directory Templates

## Overview

Module A provides structured templates for submitting products and services to 28 business directories. Each template includes required and optional fields, character limits, submission URLs, approval times, and cost information.

## Directory Templates (28 Total)

### Categories

- **General** (6): Google Business, Yelp, Bing Places, Apple Maps, Foursquare, TripAdvisor
- **Tech** (4): GitHub, npm Registry, PyPI, Docker Hub
- **SaaS** (8): Clutch, G2, Capterra, Trustpilot, Glassdoor, Indeed, AngelList, Crunchbase
- **Marketplace** (8): Product Hunt, AWS Marketplace, Salesforce AppExchange, HubSpot App Marketplace, Zapier App Directory, Make.com App Directory, Shopify App Store, Atlassian Marketplace
- **Social** (2): LinkedIn Company, Facebook Business

## API

### `listTemplates()`

Returns all templates with summary metadata.

```javascript
import { listTemplates } from './module_a.js';

const result = listTemplates();
// {
//   total: 28,
//   byCategoryCount: { general: 6, tech: 4, saas: 8, marketplace: 8, social: 2 },
//   templates: [ { name, category, requiredFields, optionalFields, ... } ]
// }
```

### `getTemplate(name)`

Get a specific template by name with fuzzy matching support.

```javascript
import { getTemplate } from './module_a.js';

const template = getTemplate('Product Hunt');
// { name, category, required_fields, optional_fields, char_limits, submission_url, approval_time, cost }
```

Fuzzy matching examples:
- `getTemplate('hunt')` → Product Hunt
- `getTemplate('aws')` → AWS Marketplace
- `getTemplate('g2')` → G2

### `generateSubmission(templateName, businessData)`

Generate a filled submission form for a template.

```javascript
import { generateSubmission } from './module_a.js';

const submission = generateSubmission('G2', {
  name: 'Tork Network',
  description: 'AI governance platform',
  website: 'https://tork.network',
  email: 'hello@tork.network',
  category: 'AI Governance'
});

// Returns:
// {
//   success: true,
//   template: 'G2',
//   category: 'saas',
//   submissionUrl: 'https://www.g2.com/products/new',
//   approvalTime: '3-5 days',
//   cost: 'free',
//   completeness: {
//     requiredFields: 6,
//     providedRequired: 4,
//     missingFields: ['Company', 'Pricing Model']
//   },
//   filledSubmission: { /* filled form data */ },
//   instructions: [ /* step-by-step submission guide */ ]
// }
```

**Business Data Fields Supported:**

- `name` - maps to: Business Name, Company Name, Product Name, App Name, etc.
- `description` - maps to: Description, Business Description, Company Description, etc.
- `website` - maps to: Website, Website URL, URL
- `email` - maps to: Email
- `phone` - maps to: Phone, Phone Number
- `category` - maps to: Category, Industry, Business Type
- `address` - maps to: Address, Headquarters
- `hours` - maps to: Business Hours, Hours
- `tagline` - maps to: Tagline
- `pricing` - maps to: Pricing, Pricing Model, Price Range
- `features` - maps to: Features, Feature List, Services

## Template Structure

Each template JSON file contains:

```json
{
  "name": "Directory Name",
  "category": "general|tech|saas|marketplace|social",
  "required_fields": ["Field1", "Field2", ...],
  "optional_fields": ["Field1", "Field2", ...],
  "char_limits": {
    "Field1": 255,
    "Field2": 1000
  },
  "submission_url": "https://...",
  "approval_time": "1-3 days",
  "cost": "free|$X/mo|varies"
}
```

## CLI Usage

```bash
# List all templates
node module_a.js list

# Get specific template
node module_a.js get "Product Hunt"
node module_a.js get "g2"

# Generate submission
node module_a.js generate "Yelp"
```

## Integration with Skill 8

This module is used by the Marketing Engine (Skill 8) to:

- Show available directories: `@tork directories`
- Get pre-filled copy for submission: `@tork submit [name]`
- Track submission status: `@tork submit done [name]`

Future modules (B, C, D, etc.) will build on Module A to provide content generation, approval queues, and auto-publishing capabilities.
