// Permet aux tests node d'importer les fichiers .ts du projet tels quels : alias « @/ » et imports sans extension.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
