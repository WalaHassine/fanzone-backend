#!/usr/bin/env node
/**
 * Generates docs/traceability-matrix.md from the Jest results.
 *
 * Requirement IDs are read straight out of the test names: any describe/it title
 * containing "EF-01" or "ENF-03" links that test to that requirement. Nothing is
 * maintained by hand, so the matrix cannot drift from the suite — a requirement
 * with no tests shows up as a gap automatically.
 *
 * Usage: npm run test:trace
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const REQUIREMENTS = require('./requirements.json');
const OUTPUT = path.join(ROOT, 'docs', 'traceability-matrix.md');
const ID_PATTERN = /\b(?:EF|ENF)-\d{2}\b/g;

/** Runs the suite and returns Jest's JSON report. */
function runJest() {
  const reportPath = path.join(os.tmpdir(), `jest-trace-${process.pid}.json`);

  try {
    execFileSync(
      'npx',
      ['jest', '--json', `--outputFile=${reportPath}`, '--silent'],
      { cwd: ROOT, stdio: 'inherit' },
    );
  } catch {
    // Jest exits non-zero when tests fail. We still want the matrix — a failing
    // requirement is exactly what it should surface.
  }

  if (!fs.existsSync(reportPath)) {
    throw new Error('Jest produced no JSON report; cannot build the matrix.');
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  fs.unlinkSync(reportPath);
  return report;
}

/** Maps requirement ID -> { passed, failed, files } gathered from test names. */
function indexByRequirement(report) {
  const index = new Map();

  for (const suite of report.testResults ?? []) {
    const file = path.relative(ROOT, suite.name);

    for (const test of suite.assertionResults ?? []) {
      const title = [...(test.ancestorTitles ?? []), test.title].join(' ');
      const ids = new Set(title.match(ID_PATTERN) ?? []);

      for (const id of ids) {
        if (!index.has(id)) {
          index.set(id, { passed: 0, failed: 0, files: new Set() });
        }
        const entry = index.get(id);
        entry.files.add(file);
        if (test.status === 'passed') entry.passed++;
        else if (test.status === 'failed') entry.failed++;
      }
    }
  }

  return index;
}

/**
 * Status for one requirement.
 * Out-of-scope items are reported as N/A so they don't read as coverage gaps.
 */
function statusFor(requirement, entry) {
  if (!entry) {
    return requirement.scope === 'backend'
      ? { badge: '⬜', label: 'Not covered' }
      : { badge: '—', label: `N/A (${requirement.scope})` };
  }
  if (entry.failed > 0) {
    return { badge: '❌', label: `${entry.failed} failing` };
  }
  return { badge: '✅', label: `${entry.passed} passing` };
}

function renderTable(requirements, index, extraColumn) {
  const header = `| ID | Requirement | ${extraColumn.title} | Tests | Status |`;
  const divider = '|---|---|---|---|---|';

  const rows = requirements.map((req) => {
    const entry = index.get(req.id);
    const { badge, label } = statusFor(req, entry);
    const files = entry ? [...entry.files].map((f) => `\`${f}\``).join('<br>') : '—';
    return `| **${req.id}** | ${req.requirement} | ${extraColumn.value(req)} | ${files} | ${badge} ${label} |`;
  });

  return [header, divider, ...rows].join('\n');
}

function main() {
  const report = runJest();
  const index = indexByRequirement(report);

  const backendFunctional = REQUIREMENTS.functional.filter((r) => r.scope === 'backend');
  const covered = backendFunctional.filter((r) => index.has(r.id)).length;

  const content = `# Requirements Traceability Matrix

> **Generated file — do not edit by hand.** Run \`npm run test:trace\` to refresh.
> Requirement IDs are extracted from test names, so this matrix reflects the suite
> exactly as it stands.

Source of requirements: [design-document.md](design-document.md) §7.
Testing approach: [test-strategy.md](test-strategy.md).

## Summary

| | |
|---|---|
| Backend functional requirements | ${backendFunctional.length} |
| Covered by tests | ${covered} |
| Not yet covered | ${backendFunctional.length - covered} |
| Total tests in suite | ${report.numTotalTests} (${report.numPassedTests} passing, ${report.numFailedTests} failing) |

## Functional requirements (EF)

${renderTable(REQUIREMENTS.functional, index, { title: 'Priority', value: (r) => r.priority })}

## Non-functional requirements (ENF)

${renderTable(REQUIREMENTS.nonFunctional, index, { title: 'Category', value: (r) => r.category })}

## Legend

| Badge | Meaning |
|---|---|
| ✅ | Covered, all linked tests passing |
| ❌ | Covered, but at least one linked test failing |
| ⬜ | In scope for this repo, no tests yet |
| — | Out of backend scope (frontend, infra, or verified by code review) |
`;

  fs.writeFileSync(OUTPUT, content);
  console.log(`\nWrote ${path.relative(ROOT, OUTPUT)}`);
  console.log(`Backend functional coverage: ${covered}/${backendFunctional.length}`);
}

main();
