// ioBroker ESLint configuration (nach der Vorlage von ioBroker.example, JavaScript)
import config from '@iobroker/eslint-config';

export default [
    ...config,
    {
        // Dateien, die nicht geprüft werden:
        // - www, widgets, admin/tools und examples laufen im Browser, nicht in Node.js
        ignores: [
            'node_modules/**',
            '.dev-server/**',
            '.vscode/**',
            'eslint.config.mjs',
            'prettier.config.mjs',
            '**/*.config.mjs',
            'test/**',
            'www/**',
            'widgets/**',
            'admin/tools/**',
            'admin/words.js',
            'examples/**',
        ],
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Auf Windows legt Git die Dateien lokal mit CRLF an, im Repository liegen sie mit LF.
            // "auto" nimmt die Zeilenenden, wie sie sind, damit Lint auf beiden Systemen gleich arbeitet.
            'prettier/prettier': ['error', { endOfLine: 'auto' }],
        },
    },
];
