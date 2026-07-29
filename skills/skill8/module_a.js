/**
 * Skill 8: Module A — Directory Templates
 *
 * Provides directory submission templates for 28 business directories.
 * Functions:
 *   - listTemplates(): Return all templates with metadata
 *   - getTemplate(name): Get specific template by name (fuzzy match)
 *   - generateSubmission(templateName, businessData): Generate filled submission
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ══════════════════════════════════════════════════════════════
// Template Management
// ══════════════════════════════════════════════════════════════

const TEMPLATES_DIR = path.join(__dirname, 'templates');

/**
 * Load all templates from disk
 * @returns {Object[]} Array of template objects
 */
function loadAllTemplates() {
  const templates = [];
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
      const template = JSON.parse(content);
      templates.push(template);
    } catch (err) {
      console.error(`Error loading template ${file}:`, err.message);
    }
  }

  return templates;
}

/**
 * List all available templates
 * @returns {Object} Object with summary and all templates
 */
function listTemplates() {
  const templates = loadAllTemplates();

  const categoryCounts = {
    general: 0,
    tech: 0,
    saas: 0,
    marketplace: 0,
    social: 0
  };

  templates.forEach(t => {
    if (categoryCounts.hasOwnProperty(t.category)) {
      categoryCounts[t.category]++;
    }
  });

  return {
    total: templates.length,
    byCategoryCount: categoryCounts,
    categories: ['general', 'tech', 'saas', 'marketplace', 'social'],
    templates: templates
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({
        name: t.name,
        category: t.category,
        requiredFields: t.required_fields.length,
        optionalFields: t.optional_fields.length,
        submissionUrl: t.submission_url,
        approvalTime: t.approval_time,
        cost: t.cost
      }))
  };
}

/**
 * Get a template by name with fuzzy matching
 * @param {string} templateName - Directory name or partial name
 * @returns {Object|null} Template object or null if not found
 */
function getTemplate(templateName) {
  const templates = loadAllTemplates();

  if (!templateName) return null;

  const queryLower = templateName.toLowerCase().trim();

  // Exact match
  let match = templates.find(t => t.name.toLowerCase() === queryLower);
  if (match) return match;

  // Case-insensitive match
  match = templates.find(t => t.name.toLowerCase().includes(queryLower));
  if (match) return match;

  // Fuzzy match: check if query is contained in name
  match = templates.find(t => {
    const nameParts = t.name.toLowerCase().split(/[\s-]/);
    return nameParts.some(part => part.includes(queryLower));
  });

  return match || null;
}

/**
 * Generate a filled submission form for a template
 * @param {string} templateName - Template name
 * @param {Object} businessData - Business information to fill
 *   Properties: name, description, website, email, phone, category, etc.
 * @returns {Object} Filled submission with instructions
 */
function generateSubmission(templateName, businessData = {}) {
  const template = getTemplate(templateName);

  if (!template) {
    return {
      success: false,
      error: `Template "${templateName}" not found`,
      suggestions: listTemplates().templates.slice(0, 5).map(t => t.name)
    };
  }

  // Map common business data keys to submission field names
  const fieldMapping = {
    name: ['Business Name', 'Company Name', 'Product Name', 'App Name', 'Package Name', 'Repository Name'],
    description: ['Description', 'Business Description', 'Company Description', 'Product Description'],
    website: ['Website', 'Website URL', 'URL'],
    email: ['Email'],
    phone: ['Phone', 'Phone Number'],
    category: ['Category', 'Industry', 'Business Type'],
    address: ['Address', 'Headquarters'],
    hours: ['Business Hours', 'Hours'],
    tagline: ['Tagline'],
    pricing: ['Pricing', 'Pricing Model', 'Price Range'],
    features: ['Features', 'Feature List', 'Services'],
  };

  // Build filled submission
  const filledSubmission = {};
  const missingFields = [];

  for (const field of template.required_fields) {
    // Find matching business data
    let value = '';

    // Direct match
    if (businessData[field]) {
      value = businessData[field];
    } else {
      // Find by mapping
      for (const [dataKey, fieldNames] of Object.entries(fieldMapping)) {
        if (fieldNames.includes(field) && businessData[dataKey]) {
          value = businessData[dataKey];
          break;
        }
      }
    }

    // Check char limits
    if (value && template.char_limits && template.char_limits[field]) {
      const limit = template.char_limits[field];
      if (value.length > limit) {
        value = value.substring(0, limit) + '...';
      }
    }

    filledSubmission[field] = value || `[Required: ${field}]`;

    if (!value) {
      missingFields.push(field);
    }
  }

  // Add optional fields if data available
  for (const field of template.optional_fields) {
    let value = '';

    if (businessData[field]) {
      value = businessData[field];
    } else {
      for (const [dataKey, fieldNames] of Object.entries(fieldMapping)) {
        if (fieldNames.includes(field) && businessData[dataKey]) {
          value = businessData[dataKey];
          break;
        }
      }
    }

    if (value) {
      if (template.char_limits && template.char_limits[field]) {
        const limit = template.char_limits[field];
        if (value.length > limit) {
          value = value.substring(0, limit) + '...';
        }
      }
      filledSubmission[field] = value;
    }
  }

  return {
    success: true,
    template: template.name,
    category: template.category,
    submissionUrl: template.submission_url,
    approvalTime: template.approval_time,
    cost: template.cost,
    completeness: {
      requiredFields: template.required_fields.length,
      providedRequired: template.required_fields.length - missingFields.length,
      missingFields: missingFields
    },
    charLimits: template.char_limits || {},
    filledSubmission: filledSubmission,
    instructions: [
      `1. Visit: ${template.submission_url}`,
      `2. Fill in the form using the data above`,
      `3. Estimated approval time: ${template.approval_time}`,
      `4. Cost: ${template.cost}`,
      missingFields.length > 0 ? `5. ⚠️ Missing required fields: ${missingFields.join(', ')}` : null
    ].filter(Boolean)
  };
}

// ══════════════════════════════════════════════════════════════
// Exports
// ══════════════════════════════════════════════════════════════

export {
  listTemplates,
  getTemplate,
  generateSubmission,
  loadAllTemplates
};

// For CLI testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , command, ...args] = process.argv;

  if (command === 'list') {
    const result = listTemplates();
    console.log(`\n📋 Directory Templates Summary`);
    console.log(`Total: ${result.total} directories`);
    console.log(`By category:`, result.byCategoryCount);
    console.log(`\nTemplates:`);
    result.templates.forEach(t => {
      console.log(`  • ${t.name} (${t.category})`);
    });
  } else if (command === 'get') {
    const name = args.join(' ');
    const template = getTemplate(name);
    if (template) {
      console.log(`\n📄 Template: ${template.name}`);
      console.log(`Category: ${template.category}`);
      console.log(`Required fields:`, template.required_fields);
      console.log(`Optional fields:`, template.optional_fields);
      console.log(`Submission URL: ${template.submission_url}`);
      console.log(`Approval time: ${template.approval_time}`);
      console.log(`Cost: ${template.cost}`);
    } else {
      console.log(`❌ Template not found: ${name}`);
    }
  } else if (command === 'generate') {
    const templateName = args[0];
    const businessData = {
      name: 'Example Company',
      description: 'An innovative AI governance solution',
      website: 'https://example.com',
      email: 'hello@example.com',
      phone: '+1-555-0123',
      category: 'AI Security',
      tagline: 'Enterprise AI governance platform'
    };
    const result = generateSubmission(templateName, businessData);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`
Usage:
  node module_a.js list                          # List all templates
  node module_a.js get [template-name]           # Get specific template
  node module_a.js generate [template-name]      # Generate filled submission
    `);
  }
}
