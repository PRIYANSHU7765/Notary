import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// Set up PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const PdfViewer = ({ file, onLoadSuccess, containerHeight = "600px" }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);

  const handleLoadSuccess = ({ numPages: totalPages }) => {
    setNumPages(totalPages);
    if (onLoadSuccess) {
      onLoadSuccess(totalPages);
    }
  };

  const goToPreviousPage = () => {
    if (pageNumber > 1) setPageNumber(pageNumber - 1);
  };

  const goToNextPage = () => {
    if (numPages && pageNumber < numPages) setPageNumber(pageNumber + 1);
  };

  return (
    <div className="pdf-viewer" style={{ height: containerHeight, display: "flex", flexDirection: "column" }}>
      <div className="pdf-controls" style={{ padding: "10px", backgroundColor: "#f0f0f0", borderBottom: "1px solid #ccc" }}>
        <button onClick={goToPreviousPage} disabled={pageNumber <= 1}>
          ← Previous
        </button>
        <span style={{ margin: "0 10px" }}>
          Page {pageNumber} of {numPages || "loading..."}
        </span>
        <button onClick={goToNextPage} disabled={!numPages || pageNumber >= numPages}>
          Next →
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "10px" }}>
        {file ? (
          <Document file={file} onLoadSuccess={handleLoadSuccess} loading={<p>Loading PDF...</p>}>
            <Page pageNumber={pageNumber} scale={1.2} />
          </Document>
        ) : (
          <p>No document loaded</p>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
