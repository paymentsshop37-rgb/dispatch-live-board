export async function exportNttrReport(report, jobs, metadata = {}) {
  const date = new Date().toISOString().slice(0, 10);
  if (report.format === "pdf") {
    const { createExecutivePdf } = await import("./pdfReport");
    const blob = createExecutivePdf(jobs, { ...metadata, reportType: report.id });
    downloadBlob(blob, `NTTR-Executive-Operations-${date}.pdf`);
    return;
  }
  const buffer = await runExcelWorker(jobs, { ...metadata, reportType: report.id });
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `NTTR-${filenamePart(report.id)}-${date}.xlsx`);
}

function runExcelWorker(jobs, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./excelReportWorker.js", import.meta.url), { type: "module" });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("The report took too long to generate. Try a narrower filter."));
    }, 300000);
    worker.onmessage = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.ok) resolve(event.data.buffer);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message || "Excel report generation failed."));
    };
    worker.postMessage({ jobs, options });
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filenamePart(value) {
  return String(value).split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join("-");
}
