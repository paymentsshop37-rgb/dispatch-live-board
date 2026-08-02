import { createReportXlsxBuffer } from "./excelReport.js";

self.onmessage = async (event) => {
  try {
    const { jobs, options } = event.data;
    const buffer = await createReportXlsxBuffer(jobs, options);
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || "Excel report generation failed." });
  }
};
