// Import all schema files to register routes with OpenAPI registry
// This file must be imported before generating the OpenAPI document

import './routes/health.schema.js';
import './routes/authSession.schema.js';
import './routes/me.schema.js';
import './routes/organisations.schema.js';
import './routes/accounts.schema.js';
import './routes/profile.schema.js';
import './routes/adminObjects.schema.js';
import './routes/adminFields.schema.js';
import './routes/adminRelationships.schema.js';
import './routes/adminPipelines.schema.js';
import './routes/adminUsers.schema.js';
import './routes/records.schema.js';
import './routes/remaining.schema.js';

// Export the registry and document generator for use in the app
export { registry, generateOpenAPIDocument } from './lib/openapi.js';
