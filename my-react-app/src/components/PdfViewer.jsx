import React, { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { getMimeTypeFromDataUrl, isImageLike, isPdfLike } from "../utils/documentAsset";

// Use Vite-bundled worker to avoid CDN/network failures in local/dev environments.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const PdfViewer = ({
  file,
  fileName,
  onLoadSuccess,
  onViewerScroll,
  scrollContainerRef,
  containerHeight = "600px",
  showControls = true,
  pageWidth,
  noInternalScroll = false,
}) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loadError, setLoadError] = useState("");
  const resolvedMimeType = typeof file === "string" ? getMimeTypeFromDataUrl(file) : file?.type || "";
  const resolvedFileName = typeof file === "string" ? fileName || "" : file?.name || fileName || "";
  const isPdfFile = isPdfLike({ fileName: resolvedFileName, mimeType: resolvedMimeType, dataUrl: typeof file === "string" ? file : "" });
  const isImageFile = isImageLike({ fileName: resolvedFileName, mimeType: resolvedMimeType, dataUrl: typeof file === "string" ? file : "" });

  const handleLoadSuccess = ({ numPages: totalPages }) => {
    setLoadError("");
    setNumPages(totalPages);
    if (onLoadSuccess) {
      onLoadSuccess(totalPages);
    }
  };

  const handleLoadError = (error) => {
    console.error("PDF load error:", error);
    setNumPages(null);
    setPageNumber(1);
    const details = error?.message ? ` (${error.message})` : "";
    setLoadError(`Unable to open this PDF. Please upload a valid PDF file.${details}`);
  };

  const goToPreviousPage = () => {
    if (pageNumber > 1) setPageNumber(pageNumber - 1);
  };

  const goToNextPage = () => {
    if (numPages && pageNumber < numPages) setPageNumber(pageNumber + 1);
  };

  const setScrollContainerRef = (element) => {
    if (!scrollContainerRef) return;
    if (typeof scrollContainerRef === "function") {
      scrollContainerRef(element);
      return;
    }
    scrollContainerRef.current = element;
  };

  return (
    <div className="pdf-viewer" style={{ height: containerHeight, display: "flex", flexDirection: "column" }}>
      {showControls && isPdfFile && (
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
      )}

      <div
        ref={setScrollContainerRef}
        onScroll={onViewerScroll}
        style={{ flex: 1, overflow: noInternalScroll ? "visible" : "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "10px" }}
      >
        {file ? (
          isPdfFile ? (
            <>
              <Document
                file={file}
                onLoadSuccess={handleLoadSuccess}
                onLoadError={handleLoadError}
                loading={<p>Loading PDF...</p>}
                error={null}
              >
                <Page pageNumber={pageNumber} scale={pageWidth ? undefined : 1.2} width={pageWidth} />
              </Document>
              {loadError && <p style={{ color: "#d32f2f" }}>{loadError}</p>}
            </>
          ) : isImageFile ? (
            <img
              src={typeof file === "string" ? file : URL.createObjectURL(file)}
              alt={resolvedFileName || "Uploaded document"}
              style={{
                width: pageWidth ? `${pageWidth}px` : "100%",
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : (
            <p style={{ color: "#666", textAlign: "center", maxWidth: "420px", lineHeight: 1.5 }}>
              Preview is unavailable for this file type. A draggable PNG preview is still added to the asset sidebar.
            </p>
          )
        ) : (
          <p>No document loaded</p>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
