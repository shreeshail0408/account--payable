import React,{useEffect,useState} from "react";
import api from "../services/api";
import {PageHeader,Modal,Status,Loader,Empty} from "../components/UI";
import {Plus,Search,Upload} from "lucide-react";
import {useAuth} from "../App";

function formatApiError(data){
 if(typeof data==="string")return data;
 if(!data)return "Invoice could not be captured. Check the fields and try again.";
 return Object.entries(data).map(([field,messages])=>{
  const text=Array.isArray(messages)?messages.map(message=>typeof message==="string"?message:JSON.stringify(message)).join(" "):typeof messages==="string"?messages:JSON.stringify(messages);
  return field==="non_field_errors"||field==="detail"?text:`${field.replaceAll("_"," ")}: ${text}`;
 }).join(" ");
}

export default function Invoices(){
 const [rows,setRows]=useState([]),[vendors,setVendors]=useState([]),[purchaseOrders,setPurchaseOrders]=useState([]),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[q,setQ]=useState(""),[ocrInvoice,setOcrInvoice]=useState(null),[reviewFields,setReviewFields]=useState(null),[reviewLines,setReviewLines]=useState([]),[confirmReview,setConfirmReview]=useState(false),[erpConfigured,setErpConfigured]=useState(false),[actionError,setActionError]=useState("");
 const {user}=useAuth();
 const [form,setForm]=useState({invoice_number:"",vendor:"",purchase_order:"",invoice_date:"",due_date:"",extracted_gstin:"",subtotal:"",tax_amount:"0",total_amount:"",match_type:"NONE"});
 const [lineItems,setLineItems]=useState([]);
 const [file,setFile]=useState(null),[bulk,setBulk]=useState(null),[bulkVendor,setBulkVendor]=useState(""),[ocrPreview,setOcrPreview]=useState(null),[ocrLoading,setOcrLoading]=useState(false),[formError,setFormError]=useState(""),[reviewConfirmed,setReviewConfirmed]=useState(false);
 const load=()=>api.get("/invoices/",{params:{search:q}}).then(r=>setRows(r.data.results||r.data)).finally(()=>setLoading(false));
 useEffect(()=>{
  load();
  if(["ADMIN","AP_CLERK"].includes(user?.role)){
   api.get("/vendors/").then(r=>setVendors(r.data.results||r.data));
   api.get("/purchase-orders/").then(r=>setPurchaseOrders(r.data.results||r.data));
  }
  api.get("/integrations/status/").then(r=>setErpConfigured(r.data.erp.configured));
 },[q,user?.role]);
 const submit=async(e)=>{
  e.preventDefault();
  setFormError("");
  if(!file){setFormError("Select or drop an invoice file before capturing.");return;}
  if(!lineItems.length){setFormError("Add and verify at least one invoice line item before capture.");return;}
  const fd=new FormData();
  Object.entries(form).forEach(([k,v])=>{if(v!=="")fd.append(k,v)});
  fd.append("line_items",JSON.stringify(lineItems.map(line=>({...line,po_line:line.po_line||null,amount:(Number(line.quantity||0)*Number(line.unit_price||0)).toFixed(2)}))));
  if(reviewConfirmed)fd.append("reviewed_extraction","true");
  fd.append("file",file);
  try{
   await api.post("/invoices/",fd,{headers:{"Content-Type":"multipart/form-data"}});
   setOpen(false);setLineItems([]);setOcrPreview(null);setReviewConfirmed(false);setFormError("");load();
  }catch(err){
   setFormError(formatApiError(err.response?.data));
  }
 };
 const previewOCR=async(upload)=>{
  setFile(upload);setOcrPreview(null);setFormError("");
  if(!upload)return;
  const fd=new FormData();fd.append("file",upload);setOcrLoading(true);
  try{const response=await api.post("/invoices/ocr-preview/",fd);setOcrPreview(response.data)}
  catch(err){setFormError(err.response?.data?.detail||err.response?.data?.file?.[0]||"OCR preview failed.");}
  finally{setOcrLoading(false)}
 };
 const useOCRSuggestions=()=>{
  if(!ocrPreview?.fields)return;
  setForm(current=>Object.fromEntries(Object.entries(current).map(([key,value])=>[
   key,ocrPreview.fields[key]!==null&&ocrPreview.fields[key]!==undefined?String(ocrPreview.fields[key]):value
  ])));
  if(ocrPreview.fields.gstin)setForm(current=>({...current,extracted_gstin:String(ocrPreview.fields.gstin).toUpperCase()}));
  if(Array.isArray(ocrPreview.fields.line_items)){
   setLineItems(ocrPreview.fields.line_items.map(line=>({...line,quantity:String(line.quantity),unit_price:String(line.unit_price),tax_rate:String(line.tax_rate||0),amount:String(line.amount),po_line:""})));
  }
 };
 const bulkUpload=async()=>{
  if(!bulkVendor||!bulk?.length)return;
  const fd=new FormData();fd.append("vendor",bulkVendor);for(const f of bulk)fd.append("files",f);
  setActionError("");
  try{
   const {data}=await api.post("/invoices/bulk/",fd,{headers:{"Content-Type":"multipart/form-data"}});
   setBulk(null);load();
   if(data.errors?.length)setActionError(`${data.created} invoice(s) captured; ${data.errors.length} file(s) could not be captured: ${data.errors.map(item=>`${item.filename}: ${item.detail}`).join("; ")}`);
  }catch(err){setActionError(formatApiError(err.response?.data));}
 };
 const submitApproval=async(id)=>{setActionError("");try{await api.post(`/invoices/${id}/submit_approval/`);load()}catch(err){setActionError(err.response?.data?.detail||"Could not submit invoice for approval.")}};
 const openReview=invoice=>{setOcrInvoice(invoice);setReviewFields({invoice_number:invoice.invoice_number||"",invoice_date:invoice.invoice_date||"",due_date:invoice.due_date||"",subtotal:invoice.subtotal||"",tax_amount:invoice.tax_amount||"0",total_amount:invoice.total_amount||"",extracted_gstin:invoice.extracted_gstin||"",match_type:invoice.match_type||"NONE",purchase_order:invoice.purchase_order||""});setReviewLines((invoice.lines||[]).map(line=>({...line,po_line:line.po_line||""})));setConfirmReview(false)};
 const confirmReviewed=async()=>{setActionError("");try{if(!confirmReview){setActionError("Confirm that you compared the corrected fields and lines against the original invoice.");return}await api.patch(`/invoices/${ocrInvoice.id}/`,{...reviewFields,line_items:reviewLines.map(line=>({...line,po_line:line.po_line||null,amount:(Number(line.quantity||0)*Number(line.unit_price||0)).toFixed(2)}))});await api.post(`/invoices/${ocrInvoice.id}/review-extraction/`,{confirmed:true});setOcrInvoice(null);setConfirmReview(false);await load()}catch(err){const data=err.response?.data;setActionError(data?.detail||Object.values(data||{}).flat().join(" ")||"Could not save field review.")}};
 const syncERP=async(id)=>{setActionError("");try{await api.post(`/invoices/${id}/sync-erp/`);setActionError("Invoice synced to the configured ERP.");}catch(err){setActionError(err.response?.data?.detail||"ERP synchronization failed.")}};
 const selectedPO=purchaseOrders.find(po=>String(po.id)===String(form.purchase_order));
 const canEditReview=["ADMIN","AP_CLERK"].includes(user?.role);
 const updateLine=(index,key,value)=>setLineItems(lines=>lines.map((line,i)=>i===index?{...line,[key]:value}:line));
 return <>
 <PageHeader title="Invoices" subtitle="Capture, OCR, validation and matching" action={["ADMIN","AP_CLERK"].includes(user?.role)&&<button className="primary" onClick={()=>setOpen(true)}><Plus/>New invoice</button>}/>
 {actionError&&<div className="alert error">{actionError}</div>}
 <div className="toolbar"><div className="search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search invoices"/></div>
 {["ADMIN","AP_CLERK"].includes(user?.role)&&<><select value={bulkVendor} onChange={e=>setBulkVendor(e.target.value)}><option value="">Bulk vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select>
 <label className="upload-btn"><Upload/>Bulk upload<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff" onChange={e=>{setBulk(e.target.files);}}/></label>{bulk&&<button className="secondary" onClick={bulkUpload}>Process {bulk.length}</button>}</>}</div>
 <div className="panel table-panel">{loading?<Loader/>:rows.length?<table><thead><tr><th>Invoice</th><th>Vendor</th><th>Due date</th><th>Amount</th><th>OCR</th><th>Status</th><th/></tr></thead><tbody>{rows.map(i=><tr key={i.id}><td><b>{i.invoice_number||"Needs review"}</b><small>{i.capture_source}</small></td><td>{i.vendor_name}</td><td>{i.due_date||"Missing"}</td><td>₹ {Number(i.total_amount).toLocaleString()}</td><td>{i.ocr_accuracy}% <button className="link" onClick={()=>openReview(i)}>Review</button>{i.extraction_reviewed_at&&<small>Human reviewed</small>}</td><td><Status value={i.status}/></td><td>{["ADMIN","AP_CLERK"].includes(user?.role)&&["MATCHED","PENDING_APPROVAL"].includes(i.status)&&<button className="link" onClick={()=>submitApproval(i.id)}>Submit</button>}{erpConfigured&&user?.role==="ADMIN"&&["APPROVED","PAID"].includes(i.status)&&<button className="link" onClick={()=>syncERP(i.id)}>Sync ERP</button>}</td></tr>)}</tbody></table>:<Empty/>}</div>
 <Modal open={open} title="Capture invoice" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}>
 {formError&&<div className="alert error span-2">{formError}</div>}
 <label>Invoice number<input required value={form.invoice_number} onChange={e=>setForm({...form,invoice_number:e.target.value})}/></label>
 <label>Vendor<select required value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})}><option value="">Select vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label>Purchase order<select value={form.purchase_order} onChange={e=>setForm({...form,purchase_order:e.target.value})}><option value="">No purchase order</option>{purchaseOrders.filter(p=>!form.vendor||String(p.vendor)===String(form.vendor)).map(p=><option key={p.id} value={p.id}>{p.number} — ₹{p.total_amount}</option>)}</select></label>
 <label>Invoice date<input type="date" required value={form.invoice_date} onChange={e=>setForm({...form,invoice_date:e.target.value})}/></label>
 <label>Vendor GSTIN<input value={form.extracted_gstin} onChange={e=>setForm({...form,extracted_gstin:e.target.value.toUpperCase()})} placeholder="15 character GSTIN"/></label>
 <label>Due date<input type="date" required value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
 <label>Subtotal<input type="number" min="0" step="0.01" required value={form.subtotal} onChange={e=>setForm({...form,subtotal:e.target.value})}/></label>
 <label>Tax amount<input type="number" min="0" step="0.01" required value={form.tax_amount} onChange={e=>setForm({...form,tax_amount:e.target.value})}/></label>
 <label>Total amount<input type="number" min="0.01" step="0.01" required value={form.total_amount} onChange={e=>setForm({...form,total_amount:e.target.value})}/></label>
 <label>Match type<select value={form.match_type} onChange={e=>{setForm({...form,match_type:e.target.value});if(e.target.value!=="NONE"&&!lineItems.length)setLineItems([{description:"",quantity:"",unit_price:"",tax_rate:"0",po_line:""}]);}}><option value="NONE">No matching</option><option value="2WAY">2-Way</option><option value="3WAY">3-Way</option></select></label>
 <div className="span-2 line-item-editor"><div className="line-item-head"><b>Invoice materials (required)</b><button type="button" className="secondary" onClick={()=>setLineItems([...lineItems,{description:"",quantity:"",unit_price:"",tax_rate:"0",po_line:""}])}>Add line</button></div>{lineItems.map((line,index)=><div className="line-item-row" key={index}>
  <label>Description<input required value={line.description} onChange={e=>updateLine(index,"description",e.target.value)}/></label>
  {form.match_type!=="NONE"&&<label>PO line<select required value={line.po_line||""} onChange={e=>updateLine(index,"po_line",e.target.value)}><option value="">Select PO line</option>{(selectedPO?.lines||[]).map(poLine=><option key={poLine.id} value={poLine.id}>{poLine.description} · ₹{poLine.unit_price}</option>)}</select></label>}
  <label>Qty<input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={e=>updateLine(index,"quantity",e.target.value)}/></label>
  <label>Unit price<input type="number" min="0" step="0.01" required value={line.unit_price} onChange={e=>updateLine(index,"unit_price",e.target.value)}/></label>
  <button type="button" className="link" onClick={()=>setLineItems(lineItems.filter((_,i)=>i!==index))}>Remove</button>
 </div>)}</div>
 <div className="span-2 invoice-drop-zone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();previewOCR(e.dataTransfer.files?.[0]);}}>
  <Upload size={19}/><span>{file?file.name:"Drop an invoice here, or choose a file"}</span>
  <label className="secondary">Choose file<input type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff" onChange={e=>previewOCR(e.target.files[0])}/></label>
 </div>
 {ocrLoading&&<div className="span-2">Reading invoice pages with OCR…</div>}
 {ocrPreview&&<div className="ocr-suggestion span-2"><div><b>OCR preview ready</b><span>Tesseract word confidence {ocrPreview.accuracy}% — this is not field-extraction accuracy. Verify each value and material line against the source document.</span></div><button type="button" className="secondary" onClick={useOCRSuggestions}>Use suggestions</button></div>}
 <label className="span-2 review-confirm"><input type="checkbox" checked={reviewConfirmed} onChange={e=>setReviewConfirmed(e.target.checked)}/> I checked the entered invoice fields and line items against the attached source document.</label>
 <div className="form-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary">Capture invoice</button></div>
 </form></Modal>
 <Modal open={!!ocrInvoice} title={`Invoice review — ${ocrInvoice?.invoice_number||"Needs invoice number"}`} onClose={()=>setOcrInvoice(null)}><div className="form-grid">
  <div className="span-2 integration-notice">Tesseract word confidence: {ocrInvoice?.ocr_accuracy}% (not extraction accuracy). Compare the fields below with the source document; corrections will be recorded for extraction quality measurement.</div>
  {ocrInvoice?.exceptions?.length>0&&<div className="span-2 alert error">{ocrInvoice.exceptions.join(" ")}</div>}
  {reviewFields&&<>
   <label>Invoice number<input disabled={!(["ADMIN","AP_CLERK"].includes(user?.role))} value={reviewFields.invoice_number} onChange={e=>setReviewFields({...reviewFields,invoice_number:e.target.value})}/></label>
   <label>Invoice date<input disabled={!canEditReview} type="date" value={reviewFields.invoice_date} onChange={e=>setReviewFields({...reviewFields,invoice_date:e.target.value})}/></label>
   <label>Due date<input disabled={!canEditReview} type="date" value={reviewFields.due_date} onChange={e=>setReviewFields({...reviewFields,due_date:e.target.value})}/></label>
   <label>Vendor GSTIN<input disabled={!canEditReview} value={reviewFields.extracted_gstin} onChange={e=>setReviewFields({...reviewFields,extracted_gstin:e.target.value.toUpperCase()})}/></label>
   <label>Subtotal<input disabled={!canEditReview} type="number" step="0.01" value={reviewFields.subtotal} onChange={e=>setReviewFields({...reviewFields,subtotal:e.target.value})}/></label>
   <label>Tax<input disabled={!canEditReview} type="number" step="0.01" value={reviewFields.tax_amount} onChange={e=>setReviewFields({...reviewFields,tax_amount:e.target.value})}/></label>
   <label>Grand total<input disabled={!canEditReview} type="number" step="0.01" value={reviewFields.total_amount} onChange={e=>setReviewFields({...reviewFields,total_amount:e.target.value})}/></label>
   <label>Matching mode<select disabled={!canEditReview} value={reviewFields.match_type} onChange={e=>setReviewFields({...reviewFields,match_type:e.target.value})}><option value="NONE">No matching</option><option value="2WAY">2-Way</option><option value="3WAY">3-Way</option></select></label>
   <label>Purchase order<select disabled={!canEditReview} value={reviewFields.purchase_order||""} onChange={e=>setReviewFields({...reviewFields,purchase_order:e.target.value||null})}><option value="">No PO</option>{purchaseOrders.filter(po=>String(po.vendor)===String(ocrInvoice.vendor)).map(po=><option key={po.id} value={po.id}>{po.number}</option>)}</select></label>
   <div className="span-2 line-item-editor"><div className="line-item-head"><b>Invoice lines</b>{canEditReview&&<button type="button" className="secondary" onClick={()=>setReviewLines([...reviewLines,{description:"",quantity:"1",unit_price:"0",tax_rate:"0",amount:"0",po_line:""}])}>Add line</button>}</div>{reviewLines.map((line,index)=><div className="line-item-row" key={index}>
    <label>Description<input disabled={!canEditReview} value={line.description} onChange={e=>setReviewLines(reviewLines.map((x,i)=>i===index?{...x,description:e.target.value}:x))}/></label>
    {reviewFields.match_type!=="NONE"&&<label>PO line<select disabled={!canEditReview} value={line.po_line||""} onChange={e=>setReviewLines(reviewLines.map((x,i)=>i===index?{...x,po_line:e.target.value}:x))}><option value="">Select PO line</option>{(purchaseOrders.find(po=>String(po.id)===String(reviewFields.purchase_order))?.lines||[]).map(poLine=><option key={poLine.id} value={poLine.id}>{poLine.description}</option>)}</select></label>}
    <label>Quantity<input disabled={!canEditReview} type="number" step="0.001" value={line.quantity} onChange={e=>setReviewLines(reviewLines.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))}/></label><label>Unit price<input disabled={!canEditReview} type="number" step="0.01" value={line.unit_price} onChange={e=>setReviewLines(reviewLines.map((x,i)=>i===index?{...x,unit_price:e.target.value}:x))}/></label>
    {canEditReview&&<button type="button" className="link" onClick={()=>setReviewLines(reviewLines.filter((_,i)=>i!==index))}>Remove</button>}
   </div>)}</div>
   <div className="span-2 ocr-preview"><b>OCR source text</b><pre>{ocrInvoice?.ocr_text||"No OCR text was extracted."}</pre></div>
   {canEditReview&&<label className="span-2 review-confirm"><input type="checkbox" checked={confirmReview} onChange={e=>setConfirmReview(e.target.checked)}/> I verified the displayed fields and lines against the invoice image or PDF.</label>}
   <div className="form-actions"><button type="button" className="secondary" onClick={()=>setOcrInvoice(null)}>Close</button>{canEditReview&&!ocrInvoice?.extraction_reviewed_at&&<button className="primary" disabled={!confirmReview} onClick={confirmReviewed}>Save corrections and confirm review</button>}</div>
  </>}
 </div></Modal>
 </>;
}
