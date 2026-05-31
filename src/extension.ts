import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('language-boilerplate-injector.injectBoilerplate', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('Open a file before injecting boilerplate.');
			return;
		}

		const document = editor.document;
		const classification = await classifyDocument(document);
		const languageId = document.languageId.toLowerCase();
		const boilerplate = getBoilerplateTemplate(classification, languageId);
		const currentText = document.getText();

		if (currentText.trim().length === 0) {
			await editor.edit((editBuilder) => {
				editBuilder.replace(
					new vscode.Range(document.positionAt(0), document.positionAt(currentText.length)),
					boilerplate,
				);
			});

			vscode.window.showInformationMessage(`Inserted ${classification.label} boilerplate.`);
			return;
		}

		const choices: Array<{ label: string; value: 'replace' | 'insert-top' }> = [
			{ label: 'Replace the entire file', value: 'replace' },
			{ label: 'Insert at the top of the file', value: 'insert-top' },
		];

		const choice = await vscode.window.showQuickPick(choices, {
			placeHolder: `Detected ${classification.label}. Choose how to inject the boilerplate.`,
		});

		if (!choice) {
			return;
		}

		await editor.edit((editBuilder) => {
			if (choice.value === 'replace') {
				editBuilder.replace(
					new vscode.Range(document.positionAt(0), document.positionAt(currentText.length)),
					boilerplate,
				);
				return;
			}

			editBuilder.insert(new vscode.Position(0, 0), `${boilerplate}\n\n`);
		});

		vscode.window.showInformationMessage(`Inserted ${classification.label} boilerplate.`);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}

type BoilerplateCategory = 'competitive programming' | 'web development' | 'sql queries' | 'react' | 'node.js';

type Classification = {
	category: BoilerplateCategory;
	label: string;
};

type WorkspaceDependencyHints = {
	hasReact: boolean;
	hasNodeBackend: boolean;
};

async function classifyDocument(document: vscode.TextDocument): Promise<Classification> {
	const text = document.getText();
	const languageId = document.languageId.toLowerCase();
	const workspaceDependencyHints = await getWorkspaceDependencyHints();

	if (isSqlDocument(languageId, document.uri.fsPath, text)) {
		return { category: 'sql queries', label: 'SQL queries' };
	}

	if (isReactDocument(languageId, document.uri.fsPath, text, workspaceDependencyHints)) {
		return { category: 'react', label: 'React' };
	}

	if (isWebDocument(languageId, document.uri.fsPath, text)) {
		return { category: 'web development', label: 'web development' };
	}

	if (isNodeDocument(languageId, document.uri.fsPath, text, workspaceDependencyHints)) {
		return { category: 'node.js', label: 'Node.js' };
	}

	return { category: 'competitive programming', label: 'competitive programming' };
}

function isSqlDocument(languageId: string, filePath: string, text: string): boolean {
	if (['sql', 'postgres', 'plsql', 'mysql', 'sqlite'].includes(languageId)) {
		return true;
	}

	if (filePath.toLowerCase().endsWith('.sql')) {
		return true;
	}

	return /\b(select|insert|update|delete|create|alter|with)\b/i.test(text);
}

function isReactDocument(languageId: string, filePath: string, text: string, dependencyHints: WorkspaceDependencyHints): boolean {
	if (['jsx', 'tsx', 'javascriptreact', 'typescriptreact'].includes(languageId)) {
		return true;
	}

	if (dependencyHints.hasReact) {
		return /\b(useState|useEffect|useMemo|createRoot|ReactDOM)\b/i.test(text) || /<\s*[A-Z][A-Za-z0-9]*\b/.test(text);
	}

	return /\b(useState|useEffect|useMemo|ReactDOM)\b/i.test(text) || /<\s*[A-Z][A-Za-z0-9]*\b/.test(text) || /\.(jsx|tsx)$/i.test(filePath);
}

function isNodeDocument(languageId: string, filePath: string, text: string, dependencyHints: WorkspaceDependencyHints): boolean {
	if (!['javascript', 'typescript'].includes(languageId)) {
		return false;
	}

	if (dependencyHints.hasNodeBackend) {
		return true;
	}

	if (/\b(require\(|module\.exports|exports\.|process\.env|node:|http\.createServer|express\(|fastify\(|koa\()/i.test(text)) {
		return true;
	}

	return /\b(server|api|backend|node)\b/i.test(filePath);
}

function isWebDocument(languageId: string, filePath: string, text: string): boolean {
	if (['html', 'css', 'scss', 'sass', 'less'].includes(languageId)) {
		return true;
	}

	if (/\.(html|css|scss|sass|less)$/i.test(filePath)) {
		return true;
	}

	return /\b(document\.|window\.|addEventListener\(|querySelector\(|DOMContentLoaded|fetch\()\b/i.test(text);
}

async function getWorkspaceDependencyHints(): Promise<WorkspaceDependencyHints> {
	const packageJsonUris = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 20);
	for (const packageJsonUri of packageJsonUris) {
		try {
			const fileContents = await vscode.workspace.fs.readFile(packageJsonUri);
			const packageJson = JSON.parse(Buffer.from(fileContents).toString('utf8')) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			const dependencyNames = new Set([
				...Object.keys(packageJson.dependencies ?? {}),
				...Object.keys(packageJson.devDependencies ?? {}),
			]);

			return {
				hasReact: hasAnyDependency(dependencyNames, ['react', 'react-dom', 'next', 'vite', '@types/react']),
				hasNodeBackend: hasAnyDependency(dependencyNames, ['express', 'fastify', 'koa', 'hono', 'nest', 'nestjs']),
			};
		} catch {
			continue;
		}
	}

	return {
		hasReact: false,
		hasNodeBackend: false,
	};
}

function hasAnyDependency(dependencyNames: Set<string>, candidates: string[]): boolean {
	return candidates.some((dependencyName) => dependencyNames.has(dependencyName));
}

function getBoilerplateTemplate(classification: Classification, languageId: string): string {
	switch (classification.category) {
		case 'sql queries':
			return '-- Write your SQL query here\nSELECT *\nFROM table_name\nWHERE 1 = 1;\n';
		case 'react':
			return getReactTemplate(languageId);
		case 'node.js':
			return getNodeTemplate(languageId);
		case 'web development':
			return getWebTemplate(languageId);
		case 'competitive programming':
		default:
			return getCompetitiveProgrammingTemplate(languageId);
	}
}

function getCompetitiveProgrammingTemplate(languageId: string): string {
	if (languageId === 'python') {
		return 'import sys\n\n\ndef solve() -> None:\n    pass\n\n\ndef main() -> None:\n    input = sys.stdin.readline\n    test_cases = int(input())\n    for _ in range(test_cases):\n        solve()\n\n\nif __name__ == "__main__":\n    main()\n';
	}

	if (languageId === 'javascript') {
		return 'const fs = require(\'node:fs\');\n\nconst rawInput = fs.readFileSync(0, \'utf8\').trim();\nconst input = rawInput.length === 0 ? [] : rawInput.split(/\\s+/);\nlet index = 0;\n\nfunction solve() {\n  // implement solution here\n}\n\nfunction main() {\n  const testCases = Number(input[index++] ?? 0);\n  for (let testCase = 0; testCase < testCases; testCase += 1) {\n    solve();\n  }\n}\n\nmain();\n';
	}

	if (languageId === 'typescript') {
		return 'import fs from \'node:fs\';\n\nconst rawInput = fs.readFileSync(0, \'utf8\').trim();\nconst input = rawInput.length === 0 ? [] : rawInput.split(/\\s+/);\nlet index = 0;\n\nfunction solve(): void {\n  // implement solution here\n}\n\nfunction main(): void {\n  const testCases = Number(input[index++] ?? 0);\n  for (let testCase = 0; testCase < testCases; testCase += 1) {\n    solve();\n  }\n}\n\nmain();\n';
	}

	if (languageId === 'java') {
		return 'import java.io.BufferedReader;\nimport java.io.IOException;\nimport java.io.InputStreamReader;\n\npublic class Main {\n    static void solve() throws IOException {\n        // implement solution here\n    }\n\n    public static void main(String[] args) throws Exception {\n        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));\n        int testCases = Integer.parseInt(reader.readLine());\n        while (testCases-- > 0) {\n            solve();\n        }\n    }\n}\n';
	}

	return '#include <bits/stdc++.h>\nusing namespace std;\n\nusing ll = long long;\n\nvoid solve() {\n    // implement solution here\n}\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n\n    int testCases;\n    cin >> testCases;\n    while (testCases--) {\n        solve();\n    }\n\n    return 0;\n}\n';
}

function getReactTemplate(languageId: string): string {
	if (languageId === 'jsx' || languageId === 'javascriptreact') {
		return 'import { useEffect, useState } from \'react\';\n\nexport default function App() {\n  const [count, setCount] = useState(0);\n\n  useEffect(() => {\n    document.title = \'React App\';\n  }, []);\n\n  return (\n    <main className="app">\n      <h1>React App</h1>\n      <button type="button" onClick={() => setCount((current) => current + 1)}>\n        Count: {count}\n      </button>\n    </main>\n  );\n}\n';
	}

	return 'import { useEffect, useState } from \'react\';\n\nexport default function App(): JSX.Element {\n  const [count, setCount] = useState(0);\n\n  useEffect(() => {\n    document.title = \'React App\';\n  }, []);\n\n  return (\n    <main className="app">\n      <h1>React App</h1>\n      <button type="button" onClick={() => setCount((current) => current + 1)}>\n        Count: {count}\n      </button>\n    </main>\n  );\n}\n';
}

function getNodeTemplate(languageId: string): string {
	if (languageId === 'javascript' || languageId === 'javascriptreact') {
		return 'const http = require(\'node:http\');\n\nconst hostname = \'127.0.0.1\';\nconst port = Number(process.env.PORT ?? 3000);\n\nconst server = http.createServer((request, response) => {\n  response.writeHead(200, { \'Content-Type\': \'text/plain\' });\n  response.end(\'Node.js server is running\\n\');\n});\n\nserver.listen(port, hostname, () => {\n  console.log(`Server running at http://${hostname}:${port}/`);\n});\n';
	}

	return 'import http from \'node:http\';\n\nconst hostname = \'127.0.0.1\';\nconst port = Number(process.env.PORT ?? 3000);\n\nconst server = http.createServer((request, response) => {\n  response.writeHead(200, { \'Content-Type\': \'text/plain\' });\n  response.end(\'Node.js server is running\\n\');\n});\n\nserver.listen(port, hostname, () => {\n  console.log(`Server running at http://${hostname}:${port}/`);\n});\n';
}

function getWebTemplate(languageId: string): string {
	if (languageId === 'html') {
		return '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Document</title>\n  <style>\n    :root {\n      color-scheme: light dark;\n    }\n\n    body {\n      margin: 0;\n      font-family: system-ui, sans-serif;\n    }\n  </style>\n</head>\n<body>\n  <main>\n    <h1>Hello, web</h1>\n  </main>\n\n  <script>\n    document.addEventListener(\'DOMContentLoaded\', () => {\n      console.log(\'Ready\');\n    });\n  </script>\n</body>\n</html>\n';
	}

	if (languageId === 'css') {
		return ':root {\n  color-scheme: light dark;\n  font-family: system-ui, sans-serif;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  margin: 0;\n  min-height: 100vh;\n}\n';
	}

	return 'document.addEventListener(\'DOMContentLoaded\', () => {\n  const app = document.querySelector(\'#app\');\n\n  if (!app) {\n    return;\n  }\n\n  app.textContent = \'Ready\';\n});\n';
}
