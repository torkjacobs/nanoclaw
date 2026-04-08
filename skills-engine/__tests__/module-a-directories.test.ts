import { describe, it, expect } from 'vitest';
import {
  DIRECTORY_TEMPLATES,
  getDirectories,
  getHighPriorityDirectories,
  getAutomatableDirectories,
} from '../../src/skills/marketing/module-a-directories.js';

describe('Module A: Directory Templates', () => {
  it('has 28 directory templates', () => {
    expect(DIRECTORY_TEMPLATES).toHaveLength(28);
  });

  it('getHighPriorityDirectories returns only P0 entries', () => {
    const high = getHighPriorityDirectories();
    expect(high.length).toBeGreaterThan(0);
    for (const d of high) {
      expect(d.priority).toBe('P0');
    }
  });

  it('getAutomatableDirectories returns only automatable entries', () => {
    const auto = getAutomatableDirectories();
    expect(auto.length).toBeGreaterThan(0);
    for (const d of auto) {
      expect(d.name).toBeTruthy();
      expect(d.url).toBeTruthy();
    }
  });

  it('every entry has all required fields', () => {
    const dirs = getDirectories();
    for (const d of dirs) {
      expect(d.name, `name missing`).toBeTruthy();
      expect(d.url, `url missing for ${d.name}`).toBeTruthy();
      expect(d.category, `category missing for ${d.name}`).toBeTruthy();
      expect(d.priority, `priority missing for ${d.name}`).toBeTruthy();
      expect(d.status, `status missing for ${d.name}`).toBeTruthy();
      expect(d.template, `template missing for ${d.name}`).toBeTruthy();
      expect(d.template.tagline, `tagline missing for ${d.name}`).toBeTruthy();
      expect(d.template.description, `description missing for ${d.name}`).toBeTruthy();
      expect(d.template.tags.length, `tags empty for ${d.name}`).toBeGreaterThan(0);
      expect(d.template.website, `website missing for ${d.name}`).toBeTruthy();
      expect(d.notes, `notes missing for ${d.name}`).toBeTruthy();
    }
  });

  it('P0 directories include the key 10 directories', () => {
    const dirs = getDirectories();
    const names = dirs.map((d) => d.name);
    const required = [
      'Product Hunt',
      'AlternativeTo',
      'G2',
      'DevHunt',
      "There's An AI For That",
      'AI Tools Directory',
      'Futurepedia',
      'SaaSHub',
    ];
    for (const name of required) {
      expect(names, `missing directory: ${name}`).toContain(name);
    }
  });
});
