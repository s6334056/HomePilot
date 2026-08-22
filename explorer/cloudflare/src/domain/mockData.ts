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
    childrenCount: 3
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
                id: 'file-sample-readme',
                name: 'README1.md',
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
                id: 'file-sample-readme',
                name: 'README2.md',
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
                id: 'file-sample-readme',
                name: 'README3.md',
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
            }
          ]
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
    }
  ]
};
