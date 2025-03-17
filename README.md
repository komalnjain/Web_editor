# Web PDF Editor

A web-based PDF editor that allows users to upload PDFs, edit their content using a rich text editor, and export the modified documents back to PDF format while preserving the original formatting.

## Features

- Upload and parse PDFs into an editable format
- Rich text editing with TinyMCE editor
- Multi-page PDF support with page navigation
- OCR (Optical Character Recognition) for extracting text from images in PDFs
- Export edited content back to PDF
- Preserves layout, fonts, and styles

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/komalnjain/Web_editor.git
cd Web_editor
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your TinyMCE API key:
```
TINYMCE_API_KEY=your_tinymce_api_key
```

## Development

To run the application in development mode:

```bash
npm start
```

This will:
1. Clean up any processes running on ports 3000 and 3003
2. Start the backend server (on port 3000)
3. Start the frontend development server (on port 8080)
4. Open the application in your default browser

- Backend API will be available at: http://localhost:3000
- Frontend application will be available at: http://localhost:8080

## Building for Production

To create a production build:

```bash
npm run build
```

This will create optimized builds for both the frontend and backend in the `dist` directory.

## Project Structure

```
web-editor/
├── dist/                  # Production build output
├── public/                # Static assets
├── src/
│   ├── client/            # Frontend React application
│   │   ├── components/    # React components
│   │   ├── styles/        # CSS styles
│   │   └── index.tsx      # Entry point
│   ├── server/            # Backend Express server
│   │   └── index.ts       # Server entry point
│   ├── types/             # TypeScript type definitions
│   └── uploads/           # Temporary upload directory
├── temp/                  # Temporary files directory
├── .env                   # Environment variables
├── package.json           # Project dependencies
├── tsconfig.json          # TypeScript configuration
└── webpack.config.cjs     # Webpack configuration
```

## Usage

1. Open the application in your web browser
2. Click the "Choose File" button to upload a PDF
3. Edit the content using the rich text editor
4. Navigate between pages using the "Previous Page" and "Next Page" buttons
5. Use the OCR feature to extract text from images in the PDF
6. Click "Export PDF" to download the modified document

## Technologies Used

- **Frontend**:
  - React
  - TypeScript
  - TinyMCE (rich text editor)
  - pdf.js (PDF rendering)
  - Tesseract.js (OCR)

- **Backend**:
  - Express.js
  - pdf-lib (PDF manipulation)
  - pdf.js-extract (PDF text extraction)
  - html-pdf-node (HTML to PDF conversion)
  - Multer (file uploads)

## Optimization Notes

- Temporary files in `temp/` and `uploads/` directories are automatically cleaned up
- The application uses server-side OCR for better performance with large PDFs
- API keys are stored in environment variables for security

## License

ISC 