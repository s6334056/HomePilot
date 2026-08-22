import { FileSystemItem } from './types';

export interface MockFileSystemNode {
  item: FileSystemItem;
  children?: MockFileSystemNode[];
}

export const MOCK_FILE_SYSTEM_ROOT: MockFileSystemNode = {
  item: {
    id: 'root',
    name: 'home',
    type: 'directory',
    path: '/home',
    modifiedAt: '2026-08-21T10:00:00Z',
    childrenCount: 6
  },
  children: [
    {
      item: {
        id: 'dir-documents',
        name: 'documents',
        type: 'directory',
        path: '/home/documents',
        modifiedAt: '2026-08-20T15:30:00Z',
        childrenCount: 2
      },
      children: [
        {
          item: {
            id: 'file-readme-docs',
            name: 'README.md',
            type: 'file',
            path: '/home/documents/README.md',
            size: 420,
            mimeType: 'text/markdown',
            modifiedAt: '2026-08-20T15:20:00Z',
            content: `# Documents Folder

This folder contains documentation and notes for HomePilot.

## G2 Operations
- Scroll: Move item focus
- Tap: Open folder or file
- Double Tap: Go to parent folder
- Long Press: Launch Agent context`
          }
        },
        {
          item: {
            id: 'file-notes',
            name: 'notes.txt',
            type: 'file',
            path: '/home/documents/notes.txt',
            size: 280,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-19T18:45:00Z',
            content: `HomePilot Task List:
1. Verify Even Hub SDK bridge on G2
2. Test double-tap parent navigation
3. Check G2 scroll focus alignment
4. Connect Agent context service
5. Prepare Gateway API endpoints`
          }
        }
      ]
    },
    {
      item: {
        id: 'dir-projects',
        name: 'projects',
        type: 'directory',
        path: '/home/projects',
        modifiedAt: '2026-08-21T09:15:00Z',
        childrenCount: 1
      },
      children: [
        {
          item: {
            id: 'dir-sample-app',
            name: 'sample-app',
            type: 'directory',
            path: '/home/projects/sample-app',
            modifiedAt: '2026-08-21T09:10:00Z',
            childrenCount: 4
          },
          children: [
            {
              item: {
                id: 'dir-src',
                name: 'src',
                type: 'directory',
                path: '/home/projects/sample-app/src',
                modifiedAt: '2026-08-21T08:50:00Z',
                childrenCount: 2
              },
              children: [
                {
                  item: {
                    id: 'file-main-ts',
                    name: 'main.ts',
                    type: 'file',
                    path: '/home/projects/sample-app/src/main.ts',
                    size: 512,
                    mimeType: 'text/typescript',
                    modifiedAt: '2026-08-21T08:45:00Z',
                    content: `import { initApp } from './app';

console.log('Starting Sample App on HomePilot...');
initApp();`
                  }
                },
                {
                  item: {
                    id: 'file-app-ts',
                    name: 'app.ts',
                    type: 'file',
                    path: '/home/projects/sample-app/src/app.ts',
                    size: 780,
                    mimeType: 'text/typescript',
                    modifiedAt: '2026-08-21T08:48:00Z',
                    content: `export function initApp(): void {
  console.log('App initialized successfully.');
  document.body.innerHTML = '<h1>HomePilot Sample App</h1>';
}`
                  }
                }
              ]
            },
            {
              item: {
                id: 'dir-public',
                name: 'public',
                type: 'directory',
                path: '/home/projects/sample-app/public',
                modifiedAt: '2026-08-20T11:00:00Z',
                childrenCount: 1
              },
              children: [
                {
                  item: {
                    id: 'file-index-html',
                    name: 'index.html',
                    type: 'file',
                    path: '/home/projects/sample-app/public/index.html',
                    size: 320,
                    mimeType: 'text/html',
                    modifiedAt: '2026-08-20T11:00:00Z',
                    content: `<!DOCTYPE html>
<html>
  <head>
    <title>Sample App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`
                  }
                }
              ]
            },
            {
              item: {
                id: 'file-pkg-json',
                name: 'package.json',
                type: 'file',
                path: '/home/projects/sample-app/package.json',
                size: 290,
                mimeType: 'application/json',
                modifiedAt: '2026-08-21T07:30:00Z',
                content: `{
  "name": "sample-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  }
}`
              }
            },
            {
              item: {
                id: 'file-sample-readme',
                name: 'README.md',
                type: 'file',
                path: '/home/projects/sample-app/README.md',
                size: 380,
                mimeType: 'text/markdown',
                modifiedAt: '2026-08-21T07:35:00Z',
                content: `# Sample App

A lightweight application designed to test file system navigation and G2 display.

- Line 1: Quick start guide
- Line 2: Build scripts
- Line 3: Deployment instructions
- Line 4: Debug tips`
              }
            },
            {
              item: {
                id: 'file-sample-readme1',
                name: 'README1.md',
                type: 'file',
                path: '/home/projects/sample-app/README1.md',
                size: 380,
                mimeType: 'text/markdown',
                modifiedAt: '2026-08-21T07:35:00Z',
                content: `# Sample App

A lightweight application designed to test file system navigation and G2 display.

- Line 1: Quick start guide
- Line 2: Build scripts
- Line 3: Deployment instructions
- Line 4: Debug tips`
              }
            },
            {
              item: {
                id: 'file-sample-readme2',
                name: 'README2.md',
                type: 'file',
                path: '/home/projects/sample-app/README2.md',
                size: 380,
                mimeType: 'text/markdown',
                modifiedAt: '2026-08-21T07:35:00Z',
                content: `# Sample App

A lightweight application designed to test file system navigation and G2 display.

- Line 1: Quick start guide
- Line 2: Build scripts
- Line 3: Deployment instructions
- Line 4: Debug tips`
              }
            },
            {
              item: {
                id: 'file-sample-readme3',
                name: 'README3.md',
                type: 'file',
                path: '/home/projects/sample-app/README3.md',
                size: 380,
                mimeType: 'text/markdown',
                modifiedAt: '2026-08-21T07:35:00Z',
                content: `# Sample App

A lightweight application designed to test file system navigation and G2 display.

- Line 1: Quick start guide
- Line 2: Build scripts
- Line 3: Deployment instructions
- Line 4: Debug tips`
              }
            }
          ]
        }
      ]
    },
    {
      item: {
        id: 'dir-test-names',
        name: 'test-names',
        type: 'directory',
        path: '/home/test-names',
        modifiedAt: '2026-08-22T10:00:00Z',
        childrenCount: 8
      },
      children: [
        {
          item: {
            id: 'file-short',
            name: 'readme.md',
            type: 'file',
            path: '/home/test-names/readme.md',
            size: 120,
            mimeType: 'text/markdown',
            modifiedAt: '2026-08-22T09:00:00Z',
            content: '# Short file name test'
          }
        },
        {
          item: {
            id: 'file-medium',
            name: 'project-settings.json',
            type: 'file',
            path: '/home/test-names/project-settings.json',
            size: 340,
            mimeType: 'application/json',
            modifiedAt: '2026-08-22T09:01:00Z',
            content: '{"theme":"dark","lang":"en"}'
          }
        },
        {
          item: {
            id: 'file-long',
            name: 'very-long-project-configuration-file.json',
            type: 'file',
            path: '/home/test-names/very-long-project-configuration-file.json',
            size: 560,
            mimeType: 'application/json',
            modifiedAt: '2026-08-22T09:02:00Z',
            content: '{"config":"long-name-test"}'
          }
        },
        {
          item: {
            id: 'dir-medium-name',
            name: 'development-environment',
            type: 'directory',
            path: '/home/test-names/development-environment',
            modifiedAt: '2026-08-22T09:03:00Z',
            childrenCount: 0
          }
        },
        {
          item: {
            id: 'dir-long-name',
            name: 'very-long-development-project-directory1-very-long-development-project-directory2-very-long-development-project-directory3',
            type: 'directory',
            path: '/home/test-names/very-long-development-project-directory1-very-long-development-project-directory2-very-long-development-project-directory3',
            modifiedAt: '2026-08-22T09:04:00Z',
            childrenCount: 0
          }
        },
        {
          item: {
            id: 'file-jp-medium',
            name: '開発環境設定ファイルサンプル.json',
            type: 'file',
            path: '/home/test-names/開発環境設定ファイルサンプル.json',
            size: 400,
            mimeType: 'application/json',
            modifiedAt: '2026-08-22T09:05:00Z',
            content: '{"日本語テスト":"成功"}'
          }
        },
        {
          item: {
            id: 'file-jp-long',
            name: 'とても長いプロジェクトファイル名１とても長いプロジェクトファイル名２とても長いプロジェクトファイル名３.txt',
            type: 'file',
            path: '/home/test-names/とても長いプロジェクトファイル名１とても長いプロジェクトファイル名２とても長いプロジェクトファイル名３.txt',
            size: 200,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T09:06:00Z',
            content: 'Japanese long name test'
          }
        },
        {
          item: {
            id: 'file-short2',
            name: 'a.md',
            type: 'file',
            path: '/home/test-names/a.md',
            size: 50,
            mimeType: 'text/markdown',
            modifiedAt: '2026-08-22T09:07:00Z',
            content: 'Minimal name'
          }
        }
      ]
    },
    {
      item: {
        id: 'dir-test-viewer',
        name: 'test-viewer',
        type: 'directory',
        path: '/home/test-viewer',
        modifiedAt: '2026-08-22T11:00:00Z',
        childrenCount: 8
      },
      children: [
        {
          item: {
            id: 'file-v-short',
            name: 'short-lines.txt',
            type: 'file',
            path: '/home/test-viewer/short-lines.txt',
            size: 80,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T11:01:00Z',
            content: `hello world
foo bar
short line
another line
done`
          }
        },
        {
          item: {
            id: 'file-v-long',
            name: 'long-code-lines.js',
            type: 'file',
            path: '/home/test-viewer/long-code-lines.js',
            size: 620,
            mimeType: 'text/javascript',
            modifiedAt: '2026-08-22T11:02:00Z',
            content: `const veryVeryVeryVeryVeryVeryVeryLongFunctionName = require('some-very-long-module-name-that-goes-on');
function calculateTotalPriceWithDiscountAndTax(basePrice, discountRate, taxRate, shippingCost) { return basePrice * (1 - discountRate) * (1 + taxRate) + shippingCost; }
const result = calculateTotalPriceWithDiscountAndTax(100, 0.15, 0.08, 12.50);
console.log('Total:', result);`
          }
        },
        {
          item: {
            id: 'file-v-japanese',
            name: 'japanese-text.txt',
            type: 'file',
            path: '/home/test-viewer/japanese-text.txt',
            size: 400,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T11:03:00Z',
            content: `短い行
この文章は非常に長いため、G2のHUD上では複数の視覚行に折り返されることになります。折り返しの動作を確認するために作成したテストデータです。
次の行は短いです。
日本語とEnglishと12345の混在行。記号 !@#$% も含みます。
完了`
          }
        },
        {
          item: {
            id: 'file-v-empty',
            name: 'empty-and-blank.txt',
            type: 'file',
            path: '/home/test-viewer/empty-and-blank.txt',
            size: 120,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T11:04:00Z',
            content: `line before empty


line after two empties

final line`
          }
        },
        {
          item: {
            id: 'file-v-mixed',
            name: 'mixed-length-lines.md',
            type: 'file',
            path: '/home/test-viewer/mixed-length-lines.md',
            size: 580,
            mimeType: 'text/markdown',
            modifiedAt: '2026-08-22T11:05:00Z',
            content: `# Title
short
This is a medium length line that should fit on a single visual line without wrapping
x
This is another extremely long line that will definitely need to be wrapped across multiple visual lines because it exceeds the maximum display width of the G2 HUD viewer
y
done`
          }
        },
        {
          item: {
            id: 'file-v-verylong',
            name: 'single-extremely-long-line.txt',
            type: 'file',
            path: '/home/test-viewer/single-extremely-long-line.txt',
            size: 450,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T11:06:00Z',
            content: `This is a single extremely long line that has no line breaks at all and will need to be wrapped across many many visual lines to fit within the G2 HUD display width of approximately 56 character width units which should result in roughly 3 to 5 visual lines depending on the character widths of the specific characters used in this line of text`
          }
        },
        {
          item: {
            id: 'file-v-tabs',
            name: 'code-with-indentation.py',
            type: 'file',
            path: '/home/test-viewer/code-with-indentation.py',
            size: 340,
            mimeType: 'text/x-python',
            modifiedAt: '2026-08-22T11:07:00Z',
            content: `def greet(name):
    if name:
        print(f"Hello, {name}!")
    else:
        print("Hello, World!")

greet("HomePilot")
greet("")`
          }
        },
        {
          item: {
            id: 'file-v-crlf',
            name: 'trailing-newlines.txt',
            type: 'file',
            path: '/home/test-viewer/trailing-newlines.txt',
            size: 100,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T11:08:00Z',
            content: `line one
line two
line three
`
          }
        }
      ]
    },
    {
      item: {
        id: 'dir-photos',
        name: 'photos',
        type: 'directory',
        path: '/home/photos',
        modifiedAt: '2026-08-18T14:20:00Z',
        childrenCount: 1
      },
      children: [
        {
          item: {
            id: 'file-image-jpg',
            name: 'image.jpg',
            type: 'file',
            path: '/home/photos/image.jpg',
            size: 2048576,
            mimeType: 'image/jpeg',
            modifiedAt: '2026-08-18T14:15:00Z',
            content: '[Binary Image Data: image.jpg (2.0 MB)]'
          }
        }
      ]
    },
    {
      item: {
        id: 'dir-many-files',
        name: 'many-files',
        type: 'directory',
        path: '/home/many-files',
        modifiedAt: '2026-08-22T12:00:00Z',
        childrenCount: 12
      },
      children: [
        {
          item: {
            id: 'file-mf-01',
            name: 'alpha-config.json',
            type: 'file',
            path: '/home/many-files/alpha-config.json',
            size: 200,
            mimeType: 'application/json',
            modifiedAt: '2026-08-22T12:01:00Z',
            content: '{"key":"alpha"}'
          }
        },
        {
          item: {
            id: 'file-mf-02',
            name: 'beta-settings.json',
            type: 'file',
            path: '/home/many-files/beta-settings.json',
            size: 220,
            mimeType: 'application/json',
            modifiedAt: '2026-08-22T12:02:00Z',
            content: '{"key":"beta"}'
          }
        },
        {
          item: {
            id: 'file-mf-03',
            name: 'gamma-log.txt',
            type: 'file',
            path: '/home/many-files/gamma-log.txt',
            size: 340,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T12:03:00Z',
            content: 'gamma log entry'
          }
        },
        {
          item: {
            id: 'file-mf-04',
            name: 'delta-notes.md',
            type: 'file',
            path: '/home/many-files/delta-notes.md',
            size: 180,
            mimeType: 'text/markdown',
            modifiedAt: '2026-08-22T12:04:00Z',
            content: '# Delta Notes'
          }
        },
        {
          item: {
            id: 'file-mf-05',
            name: 'epsilon-data.csv',
            type: 'file',
            path: '/home/many-files/epsilon-data.csv',
            size: 560,
            mimeType: 'text/csv',
            modifiedAt: '2026-08-22T12:05:00Z',
            content: 'id,name,value\n1,alpha,100\n2,beta,200'
          }
        },
        {
          item: {
            id: 'file-mf-06',
            name: 'zeta-backup.zip',
            type: 'file',
            path: '/home/many-files/zeta-backup.zip',
            size: 4096,
            mimeType: 'application/zip',
            modifiedAt: '2026-08-22T12:06:00Z',
            content: '[Binary Data: zeta-backup.zip]'
          }
        },
        {
          item: {
            id: 'file-mf-07',
            name: 'eta-script.sh',
            type: 'file',
            path: '/home/many-files/eta-script.sh',
            size: 290,
            mimeType: 'application/x-sh',
            modifiedAt: '2026-08-22T12:07:00Z',
            content: '#!/bin/bash\necho "Hello from eta"'
          }
        },
        {
          item: {
            id: 'file-mf-08',
            name: 'theta-image.png',
            type: 'file',
            path: '/home/many-files/theta-image.png',
            size: 8192,
            mimeType: 'image/png',
            modifiedAt: '2026-08-22T12:08:00Z',
            content: '[Binary Data: theta-image.png]'
          }
        },
        {
          item: {
            id: 'file-mf-09',
            name: 'iota-readme.txt',
            type: 'file',
            path: '/home/many-files/iota-readme.txt',
            size: 150,
            mimeType: 'text/plain',
            modifiedAt: '2026-08-22T12:09:00Z',
            content: 'Iota project readme'
          }
        },
        {
          item: {
            id: 'file-mf-10',
            name: 'kappa-report.pdf',
            type: 'file',
            path: '/home/many-files/kappa-report.pdf',
            size: 16384,
            mimeType: 'application/pdf',
            modifiedAt: '2026-08-22T12:10:00Z',
            content: '[Binary Data: kappa-report.pdf]'
          }
        },
        {
          item: {
            id: 'file-mf-11',
            name: 'lambda-source.go',
            type: 'file',
            path: '/home/many-files/lambda-source.go',
            size: 440,
            mimeType: 'text/x-go',
            modifiedAt: '2026-08-22T12:11:00Z',
            content: 'package main\n\nfunc main() {\n\tfmt.Println("lambda")\n}'
          }
        },
        {
          item: {
            id: 'file-mf-12',
            name: 'mu-archive.tar.gz',
            type: 'file',
            path: '/home/many-files/mu-archive.tar.gz',
            size: 32768,
            mimeType: 'application/gzip',
            modifiedAt: '2026-08-22T12:12:00Z',
            content: '[Binary Data: mu-archive.tar.gz]'
          }
        }
      ]
    }
  ]
};
