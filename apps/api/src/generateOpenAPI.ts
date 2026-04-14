#!/usr/bin/env node

/**
 * Generate OpenAPI spec from Zod schemas
 * This script imports all route schemas and generates openapi.json
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateSpec() {
  try {
    // Import the schemas module which registers all routes
    const { generateOpenAPIDocument } = await import('./schemas.js');

    // Generate the OpenAPI document
    const spec = generateOpenAPIDocument();

    // Write to file
    const outputPath = join(__dirname, '../openapi.json');
    writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');

    console.log('✓ OpenAPI spec generated at:', outputPath);

    // Count routes by method
    const paths = spec.paths || {};
    const routeCount = Object.keys(paths).reduce((count, path) => {
      return count + Object.keys(paths[path]).length;
    }, 0);

    console.log(`✓ Documented ${routeCount} route(s)`);
  } catch (error) {
    console.error('Failed to generate OpenAPI spec:', error);
    process.exit(1);
  }
}

generateSpec();
