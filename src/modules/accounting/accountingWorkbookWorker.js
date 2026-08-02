import { createAccountingWorkbookBuffer } from "./accountingWorkbook.js";
self.onmessage=async(event)=>{try{const buffer=await createAccountingWorkbookBuffer(event.data.payload,event.data.options);self.postMessage({ok:true,buffer},[buffer])}catch(error){self.postMessage({ok:false,error:error?.message||"Accounting workbook generation failed."})}};
