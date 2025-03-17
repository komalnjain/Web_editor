# PDF Editor

A web-based PDF editor that allows users to upload PDFs, edit their content using a rich text editor, and export the modified documents back to PDF format while preserving the original formatting.

## Features

- Upload and parse PDFs into an editable format
- Rich text editing with TinyMCE editor
- Multi-page PDF support with page navigation
- Export edited content back to PDF
- Preserves layout, fonts, and styles

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pdf-editor
```

2. Install dependencies:
```bash
npm install
```

## Development

To run the application in development mode:

```bash
npm start
```

This will start both the backend server (on port 3000) and the frontend development server (on port 8080) concurrently.

- Backend API will be available at: http://localhost:3000
- Frontend application will be available at: http://localhost:8080

## Building for Production

To create a production build:

```bash
npm run build
```

This will create optimized builds for both the frontend and backend in the `dist` directory.

## Usage

1. Open the application in your web browser
2. Click the "Choose File" button to upload a PDF
3. Edit the content using the rich text editor
4. Navigate between pages using the "Previous Page" and "Next Page" buttons
5. Click "Export PDF" to download the modified document

## Technologies Used

- React
- TypeScript
- Express.js
- TinyMCE
- pdf-lib
- pdf.js-extract
- html-pdf-node
- Webpack

## License

ISC 