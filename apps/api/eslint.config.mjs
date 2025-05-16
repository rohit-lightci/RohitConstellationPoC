import { fileURLToPath } from 'url';
import { dirname } from 'path';
import rootConfig from '../../eslint.config.mjs';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Export a modified version of the root config with potentially customized settings for the API
export default [
  ...rootConfig,
  {
    // Any API-specific overrides can go here
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      }
    }
  }
];
